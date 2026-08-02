import { createHash } from "node:crypto";
import { assertOperationsInvariants } from "@/modules/operations/invariants";
import type { OperationsState } from "@/modules/operations/types";

export type CutoverIssue = {
  code: string;
  message: string;
  path?: string;
};

export type CutoverSource = {
  namespace: string;
  revision: number;
  stateSchemaVersion: number;
};

export type CutoverTotals = {
  entityCounts: Record<string, number>;
  stockByWarehouseProduct: Record<string, { quantity: number; value: number }>;
  receivablesByCustomer: Record<string, number>;
  payablesBySupplier: Record<string, number>;
  employeeBalances: Record<string, number>;
  cashByAccount: Record<string, number>;
  allocationTotals: {
    customer: number;
    supplier: number;
  };
  audit: {
    records: number;
    correlationIds: number;
    processedOperations: number;
  };
};

export type OperationsCutoverManifest = {
  source: CutoverSource;
  sourceChecksum: string;
  generatedAt: string;
  ready: boolean;
  issues: CutoverIssue[];
  totals: CutoverTotals;
};

export type CutoverReconciliation = {
  matches: boolean;
  differences: string[];
};

export type CutoverLegacyIdMap = {
  entityType: string;
  legacyId: string;
  targetId: string;
};

export type ReadOnlyOperationsSnapshotSource = {
  read(): Promise<{
    revision: number;
    payload: {
      schemaVersion?: number;
      state: OperationsState;
    };
  }>;
};

export async function exportOperationsCutoverSnapshot(
  source: ReadOnlyOperationsSnapshotSource,
  now = new Date().toISOString(),
  namespace = "operations"
): Promise<OperationsCutoverManifest> {
  const snapshot = await source.read();
  return inspectOperationsStateForCutover(snapshot.payload.state, {
    namespace,
    revision: snapshot.revision,
    stateSchemaVersion: snapshot.payload.schemaVersion ?? 1,
    now
  });
}

export function inspectOperationsStateForCutover(
  state: OperationsState,
  input: CutoverSource & { now?: string }
): OperationsCutoverManifest {
  const issues: CutoverIssue[] = [];
  collectUniqueIds(state, issues);
  collectReferenceIssues(state, issues);
  collectInvariantIssues(state, issues);

  return {
    source: {
      namespace: input.namespace,
      revision: input.revision,
      stateSchemaVersion: input.stateSchemaVersion
    },
    sourceChecksum: checksum(state),
    generatedAt: input.now ?? new Date().toISOString(),
    ready: issues.length === 0,
    issues,
    totals: calculateCutoverTotals(state)
  };
}

export function reconcileOperationsCutover(
  expected: OperationsCutoverManifest,
  actual: OperationsCutoverManifest
): CutoverReconciliation {
  const differences: string[] = [];
  if (expected.sourceChecksum !== actual.sourceChecksum) {
    differences.push("Source checksum differs from the rehearsed snapshot.");
  }
  if (expected.source.namespace !== actual.source.namespace) {
    differences.push("Source namespace differs.");
  }
  if (expected.source.revision !== actual.source.revision) {
    differences.push("Source revision differs.");
  }
  compareValues("totals", expected.totals, actual.totals, differences);
  if (!actual.ready) {
    differences.push("Target manifest contains validation issues.");
  }
  return { matches: differences.length === 0, differences };
}

export function calculateCutoverTotals(state: OperationsState): CutoverTotals {
  const entityCounts: Record<string, number> = {
    customers: state.customers.length,
    suppliers: state.suppliers.length,
    employees: state.employees.length,
    productUnits: state.productUnits.length,
    warehouses: state.warehouses.length,
    vehicles: state.vehicles.length,
    salesOrders: state.salesOrders.length,
    purchaseOrders: state.purchaseOrders.length,
    inventoryMovements: state.inventoryMovements.length,
    deliveryJobs: state.deliveryJobs.length,
    customerLedgerEntries: state.customerLedgerEntries.length,
    supplierLedgerEntries: state.supplierLedgerEntries.length,
    employeeLedgerEntries: state.employeeLedgerEntries.length,
    customerPayments: state.customerPayments.length,
    supplierPayments: state.supplierPayments.length,
    employeePayments: state.employeePayments.length,
    employeeAdvances: state.employeeAdvances.length,
    cashTransactions: state.cashTransactions.length,
    cashVouchers: state.cashVouchers.length,
    bankTransferProofs: state.bankTransferProofs.length,
    workOrders: state.workOrders.length,
    compensationBatches: state.compensationBatches.length,
    importJobs: state.importJobs.length,
    importIssues: state.importIssues.length,
    approvalRequests: state.approvalRequests.length,
    customerPaymentProofRequests: state.customerPaymentProofRequests?.length ?? 0
  };

  const stockByWarehouseProduct: CutoverTotals["stockByWarehouseProduct"] = {};
  for (const movement of state.inventoryMovements) {
    const key = `${movement.warehouseId}:${movement.productUnitId}`;
    const row = stockByWarehouseProduct[key] ?? { quantity: 0, value: 0 };
    row.quantity += movement.quantity;
    row.value += movement.quantity * movement.unitCost;
    stockByWarehouseProduct[key] = normalizeTotals(row);
  }

  return {
    entityCounts,
    stockByWarehouseProduct,
    receivablesByCustomer: balanceBy(state.customerLedgerEntries, (entry) => entry.customerId, (entry) => entry.direction === "debit" ? entry.amount : -entry.amount),
    payablesBySupplier: balanceBy(state.supplierLedgerEntries, (entry) => entry.supplierId, (entry) => entry.direction === "credit" ? entry.amount : -entry.amount),
    employeeBalances: balanceBy(state.employeeLedgerEntries, (entry) => entry.employeeId, (entry) => entry.direction === "credit" ? entry.amount : -entry.amount),
    cashByAccount: balanceBy(state.cashTransactions, (entry) => entry.accountName, (entry) => entry.direction === "in" ? entry.amount : -entry.amount),
    allocationTotals: {
      customer: sumAllocations(state.customerPayments),
      supplier: sumAllocations(state.supplierPayments)
    },
    audit: {
      records: state.auditLogs.length,
      correlationIds: new Set(state.auditLogs.map((entry) => entry.correlationId).filter(Boolean)).size,
      processedOperations: state.processedOperations.length
    }
  };
}

export function createLegacyIdMap(
  state: OperationsState,
  sourceNamespace = "operations"
): CutoverLegacyIdMap[] {
  const map = new Map<string, CutoverLegacyIdMap>();
  const register = (entityType: string, legacyId: string, allowRepeatedReference = false) => {
    if (!legacyId?.trim()) {
      throw new Error(`CUTOVER_LEGACY_ID_REQUIRED: ${entityType} requires a stable legacy id.`);
    }
    const key = `${entityType}:${legacyId}`;
    const existing = map.get(key);
    if (existing) {
      if (allowRepeatedReference) return;
      throw new Error(`CUTOVER_LEGACY_ID_DUPLICATE: ${entityType} contains duplicate legacy id ${legacyId}.`);
    }
    map.set(key, {
      entityType,
      legacyId,
      targetId: createDeterministicLegacyUuid(sourceNamespace, entityType, legacyId)
    });
  };
  const registerCollection = (entityType: string, values: Array<{ id: string }>) => {
    values.forEach((value) => register(entityType, value.id));
  };
  const registerAttachments = (attachments: Array<{ id: string }> | undefined) => {
    attachments?.forEach((attachment) => register("attachment", attachment.id, true));
  };

  registerCollection("customer", state.customers);
  registerCollection("supplier", state.suppliers);
  registerCollection("employee", state.employees);
  registerCollection("unit", state.unitDefinitions);
  registerCollection("product_unit", state.productUnits);
  registerCollection("purchase_unit_conversion", state.purchaseUnitConversions);
  registerCollection("warehouse", state.warehouses);
  registerCollection("vehicle", state.vehicles);
  registerCollection("sales_order", state.salesOrders);
  registerCollection("purchase_order", state.purchaseOrders);
  registerCollection("inventory_movement", state.inventoryMovements);
  registerCollection("delivery_job", state.deliveryJobs);
  registerCollection("approval_request", state.approvalRequests);
  registerCollection("customer_ledger_entry", state.customerLedgerEntries);
  registerCollection("supplier_ledger_entry", state.supplierLedgerEntries);
  registerCollection("employee_ledger_entry", state.employeeLedgerEntries);
  registerCollection("customer_payment", state.customerPayments);
  registerCollection("supplier_payment", state.supplierPayments);
  registerCollection("employee_payment", state.employeePayments);
  registerCollection("employee_advance", state.employeeAdvances);
  registerCollection("cash_transaction", state.cashTransactions);
  registerCollection("cash_voucher", state.cashVouchers);
  registerCollection("bank_transfer_proof", state.bankTransferProofs);
  registerCollection("work_order", state.workOrders);
  registerCollection("compensation_batch", state.compensationBatches);
  registerCollection("import_job", state.importJobs);
  registerCollection("import_issue", state.importIssues);
  registerCollection("audit_log", state.auditLogs);
  state.processedOperations.forEach((operation) => register("processed_operation", operation.idempotencyKey));
  registerCollection("customer_payment_proof", state.customerPaymentProofRequests ?? []);

  for (const order of state.salesOrders) {
    registerAttachments(order.attachments);
    order.lines.forEach((line) => register("sales_order_item", line.id));
  }
  for (const order of state.purchaseOrders) {
    registerAttachments(order.attachments);
    order.lines.forEach((line) => {
      register("purchase_order_item", line.id);
      register("purchase_destination", line.id);
    });
    order.supplierAcknowledgements?.forEach((acknowledgement) => register("supplier_purchase_order_acknowledgement", acknowledgement.id));
    order.supplierDeliveryNotices?.forEach((notice) => {
      register("supplier_delivery_notice", notice.id);
      registerAttachments(notice.attachments);
      Object.keys(notice.lineQuantities).sort().forEach((lineId) => register("supplier_delivery_notice_item", `${notice.id}:${lineId}`));
    });
  }
  for (const job of state.deliveryJobs) {
    registerAttachments(job.completionAttachments);
    job.helperIds.forEach((employeeId) => register("delivery_assignment", `${job.id}:${employeeId}`));
  }
  for (const request of state.approvalRequests) registerAttachments(request.attachments);
  for (const proof of state.customerPaymentProofRequests ?? []) registerAttachments(proof.attachments);
  for (const proof of state.bankTransferProofs) registerAttachments(proof.attachments);
  for (const payment of state.customerPayments) {
    payment.allocations.forEach((allocation) => register("customer_payment_allocation", `${payment.id}:${allocation.ledgerEntryId}`));
  }
  for (const payment of state.supplierPayments) {
    payment.allocations.forEach((allocation) => register("supplier_payment_allocation", `${payment.id}:${allocation.ledgerEntryId}`));
  }
  for (const workOrder of state.workOrders) {
    if (workOrder.locationHistory?.length) {
      throw new Error(`CUTOVER_LEGACY_ID_REQUIRED: work order ${workOrder.id} has location history without stable point ids.`);
    }
    workOrder.outputs.forEach((output) => register("work_output", output.id));
    workOrder.participants.forEach((participant) => register("work_participant", `${workOrder.id}:${participant.employeeId}`));
  }
  for (const batch of state.compensationBatches) {
    batch.lines.forEach((line) => register("compensation_line", `${batch.id}:${line.workOutputId}:${line.employeeId}`));
  }

  return [...map.values()].sort((left, right) => (
    left.entityType.localeCompare(right.entityType) || left.legacyId.localeCompare(right.legacyId)
  ));
}

export function createDeterministicLegacyUuid(sourceNamespace: string, entityType: string, legacyId: string) {
  const bytes = createHash("sha256")
    .update(`hien-xa/v1|${sourceNamespace}|${entityType}|${legacyId}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function collectUniqueIds(state: OperationsState, issues: CutoverIssue[]) {
  const collections: Array<[string, Array<{ id: string }>]> = [
    ["customers", state.customers],
    ["suppliers", state.suppliers],
    ["employees", state.employees],
    ["productUnits", state.productUnits],
    ["unitDefinitions", state.unitDefinitions],
    ["purchaseUnitConversions", state.purchaseUnitConversions],
    ["warehouses", state.warehouses],
    ["vehicles", state.vehicles],
    ["salesOrders", state.salesOrders],
    ["purchaseOrders", state.purchaseOrders],
    ["inventoryMovements", state.inventoryMovements],
    ["deliveryJobs", state.deliveryJobs],
    ["approvalRequests", state.approvalRequests],
    ["customerLedgerEntries", state.customerLedgerEntries],
    ["supplierLedgerEntries", state.supplierLedgerEntries],
    ["employeeLedgerEntries", state.employeeLedgerEntries],
    ["customerPayments", state.customerPayments],
    ["supplierPayments", state.supplierPayments],
    ["employeePayments", state.employeePayments],
    ["employeeAdvances", state.employeeAdvances],
    ["cashTransactions", state.cashTransactions],
    ["cashVouchers", state.cashVouchers],
    ["bankTransferProofs", state.bankTransferProofs],
    ["workOrders", state.workOrders],
    ["compensationBatches", state.compensationBatches],
    ["importJobs", state.importJobs],
    ["importIssues", state.importIssues],
    ["auditLogs", state.auditLogs],
    ["processedOperations", state.processedOperations.map((operation) => ({ id: operation.idempotencyKey }))],
    ["customerPaymentProofRequests", state.customerPaymentProofRequests ?? []]
  ];
  for (const [name, values] of collections) {
    const seen = new Set<string>();
    for (const value of values) {
      if (!value.id || !value.id.trim()) {
        issues.push({ code: "MISSING_LEGACY_ID", message: `${name} has a record without a stable legacy id.`, path: name });
      } else if (seen.has(value.id)) {
        issues.push({ code: "DUPLICATE_LEGACY_ID", message: `${name} contains duplicate legacy id ${value.id}.`, path: name });
      } else {
        seen.add(value.id);
      }
    }
  }
}

function collectReferenceIssues(state: OperationsState, issues: CutoverIssue[]) {
  const customers = ids(state.customers);
  const suppliers = ids(state.suppliers);
  const employees = ids(state.employees);
  const products = ids(state.productUnits);
  const units = ids(state.unitDefinitions);
  const warehouses = ids(state.warehouses);
  const vehicles = ids(state.vehicles);
  const salesOrders = ids(state.salesOrders);
  const purchaseOrders = ids(state.purchaseOrders);
  const salesLines = ids(state.salesOrders.flatMap((order) => order.lines));
  const purchaseLines = ids(state.purchaseOrders.flatMap((order) => order.lines));
  const customerLedger = ids(state.customerLedgerEntries);
  const supplierLedger = ids(state.supplierLedgerEntries);
  const workOrders = ids(state.workOrders);
  const workOutputs = ids(state.workOrders.flatMap((order) => order.outputs));

  for (const order of state.salesOrders) {
    requireReference(customers, order.customerId, "salesOrders.customerId", issues);
    for (const line of order.lines) {
      requireReference(products, line.productUnitId, "salesOrders.lines.productUnitId", issues);
      optionalReference(warehouses, line.warehouseId, "salesOrders.lines.warehouseId", issues);
      optionalReference(purchaseLines, line.purchaseOrderLineId, "salesOrders.lines.purchaseOrderLineId", issues);
    }
  }
  for (const order of state.purchaseOrders) {
    requireReference(suppliers, order.supplierId, "purchaseOrders.supplierId", issues);
    for (const line of order.lines) {
      requireReference(products, line.productUnitId, "purchaseOrders.lines.productUnitId", issues);
      optionalReference(warehouses, line.warehouseId, "purchaseOrders.lines.warehouseId", issues);
      optionalReference(customers, line.customerId, "purchaseOrders.lines.customerId", issues);
      optionalReference(salesLines, line.salesOrderLineId, "purchaseOrders.lines.salesOrderLineId", issues);
    }
  }
  for (const movement of state.inventoryMovements) {
    requireReference(warehouses, movement.warehouseId, "inventoryMovements.warehouseId", issues);
    requireReference(products, movement.productUnitId, "inventoryMovements.productUnitId", issues);
  }
  for (const job of state.deliveryJobs) {
    requireReference(salesOrders, job.salesOrderId, "deliveryJobs.salesOrderId", issues);
    requireReference(employees, job.driverId, "deliveryJobs.driverId", issues);
    requireReference(vehicles, job.vehicleId, "deliveryJobs.vehicleId", issues);
    for (const helperId of job.helperIds) requireReference(employees, helperId, "deliveryJobs.helperIds", issues);
  }
  for (const entry of state.customerLedgerEntries) requireReference(customers, entry.customerId, "customerLedgerEntries.customerId", issues);
  for (const entry of state.supplierLedgerEntries) requireReference(suppliers, entry.supplierId, "supplierLedgerEntries.supplierId", issues);
  for (const entry of state.employeeLedgerEntries) requireReference(employees, entry.employeeId, "employeeLedgerEntries.employeeId", issues);
  for (const payment of state.customerPayments) {
    requireReference(customers, payment.customerId, "customerPayments.customerId", issues);
    for (const allocation of payment.allocations) requireReference(customerLedger, allocation.ledgerEntryId, "customerPayments.allocations.ledgerEntryId", issues);
  }
  for (const payment of state.supplierPayments) {
    requireReference(suppliers, payment.supplierId, "supplierPayments.supplierId", issues);
    for (const allocation of payment.allocations) requireReference(supplierLedger, allocation.ledgerEntryId, "supplierPayments.allocations.ledgerEntryId", issues);
  }
  for (const workOrder of state.workOrders) {
    optionalReference(employees, workOrder.claimedByEmployeeId, "workOrders.claimedByEmployeeId", issues);
    optionalReference(salesOrders, workOrder.salesOrderId, "workOrders.salesOrderId", issues);
    for (const output of workOrder.outputs) requireReference(products, output.productUnitId, "workOrders.outputs.productUnitId", issues);
    for (const participant of workOrder.participants) requireReference(employees, participant.employeeId, "workOrders.participants.employeeId", issues);
  }
  for (const batch of state.compensationBatches) {
    requireReference(workOrders, batch.workOrderId, "compensationBatches.workOrderId", issues);
    for (const line of batch.lines) {
      requireReference(workOutputs, line.workOutputId, "compensationBatches.lines.workOutputId", issues);
      requireReference(employees, line.employeeId, "compensationBatches.lines.employeeId", issues);
    }
  }
  for (const proof of state.customerPaymentProofRequests ?? []) {
    requireReference(customers, proof.customerId, "customerPaymentProofRequests.customerId", issues);
    requireReference(salesOrders, proof.salesOrderId, "customerPaymentProofRequests.salesOrderId", issues);
  }
  for (const conversion of state.purchaseUnitConversions) {
    requireReference(products, conversion.productUnitId, "purchaseUnitConversions.productUnitId", issues);
    requireReference(units, conversion.unitId, "purchaseUnitConversions.unitId", issues);
  }
  for (const acknowledgement of state.purchaseOrders.flatMap((order) => order.supplierAcknowledgements ?? [])) {
    if (!acknowledgement.id.trim()) issues.push({ code: "MISSING_LEGACY_ID", message: "Supplier acknowledgement has no stable id." });
  }
  for (const notice of state.purchaseOrders.flatMap((order) => order.supplierDeliveryNotices ?? [])) {
    if (!notice.id.trim()) issues.push({ code: "MISSING_LEGACY_ID", message: "Supplier delivery notice has no stable id." });
  }
}

function collectInvariantIssues(state: OperationsState, issues: CutoverIssue[]) {
  try {
    assertOperationsInvariants(state);
  } catch (error) {
    issues.push({
      code: "DOMAIN_INVARIANT_FAILED",
      message: error instanceof Error ? error.message : "Operations state violates a domain invariant."
    });
  }
}

function requireReference(values: Set<string>, id: string, path: string, issues: CutoverIssue[]) {
  if (!values.has(id)) issues.push({ code: "UNMAPPED_REFERENCE", message: `${path} references unknown legacy id ${id}.`, path });
}

function optionalReference(values: Set<string>, id: string | undefined, path: string, issues: CutoverIssue[]) {
  if (id) requireReference(values, id, path, issues);
}

function ids(values: Array<{ id: string }>) {
  return new Set(values.map((value) => value.id));
}

function sumAllocations(payments: Array<{ allocations: Array<{ amount: number }> }>) {
  return payments.reduce((total, payment) => total + payment.allocations.reduce((sum, allocation) => sum + allocation.amount, 0), 0);
}

function balanceBy<T>(values: T[], key: (value: T) => string, amount: (value: T) => number) {
  const balances: Record<string, number> = {};
  for (const value of values) {
    const id = key(value);
    balances[id] = normalizeNumber((balances[id] ?? 0) + amount(value));
  }
  return balances;
}

function normalizeTotals(value: { quantity: number; value: number }) {
  return { quantity: normalizeNumber(value.quantity), value: normalizeNumber(value.value) };
}

function normalizeNumber(value: number) {
  return Number(value.toFixed(6));
}

function checksum(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function compareValues(path: string, expected: unknown, actual: unknown, differences: string[]) {
  if (typeof expected === "number" || typeof expected === "string" || typeof expected === "boolean" || expected === null) {
    if (expected !== actual) differences.push(`${path} differs (expected ${String(expected)}, actual ${String(actual)}).`);
    return;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length !== actual.length) {
      differences.push(`${path} differs.`);
      return;
    }
    expected.forEach((item, index) => compareValues(`${path}[${index}]`, item, actual[index], differences));
    return;
  }
  if (!expected || typeof expected !== "object" || !actual || typeof actual !== "object") {
    if (stableJson(expected) !== stableJson(actual)) differences.push(`${path} differs.`);
    return;
  }
  const expectedRecord = expected as Record<string, unknown>;
  const actualRecord = actual as Record<string, unknown>;
  const keys = new Set([...Object.keys(expectedRecord), ...Object.keys(actualRecord)]);
  for (const key of [...keys].sort()) compareValues(`${path}.${key}`, expectedRecord[key], actualRecord[key], differences);
}
