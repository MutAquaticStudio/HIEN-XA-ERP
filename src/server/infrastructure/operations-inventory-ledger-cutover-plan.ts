import { createHash } from "node:crypto";
import type {
  CustomerLedgerEntry,
  EmployeeLedgerEntry,
  InventoryMovement,
  OperationsState,
  SupplierLedgerEntry
} from "@/modules/operations/types";
import {
  createDeterministicLegacyUuid,
  createLegacyIdMap,
  inspectOperationsStateForCutover,
  type CutoverLegacyIdMap,
  type CutoverSource
} from "./operations-cutover";
import {
  assertOperationsCutoverMappings,
  cutoverSourceEntityLegacyMapEntityType,
  type CutoverMappingOverrides,
  type CutoverSourceDocumentOverride
} from "./operations-cutover-overrides";

export type InventoryLedgerCutoverRow = {
  id: string;
  legacyId: string;
  values: Record<string, unknown>;
};

export type InventoryLedgerCutoverBatch = {
  name: string;
  table: string;
  operation: "insert" | "update";
  rows: InventoryLedgerCutoverRow[];
};

export type InventoryLedgerCutoverPlan = {
  planVersion: 1;
  scope: "inventory_and_ledgers";
  isComplete: false;
  source: CutoverSource;
  sourceChecksum: string;
  generatedAt: string;
  idMap: CutoverLegacyIdMap[];
  batches: InventoryLedgerCutoverBatch[];
  deferredCollections: string[];
  planChecksum: string;
};

export type CreateInventoryLedgerCutoverPlanInput = {
  namespace: string;
  sourceRevision: number;
  stateSchemaVersion: number;
  generatedAt: string;
  mappingOverrides: CutoverMappingOverrides;
};

export type UnsignedInventoryLedgerCutoverPlan = Omit<InventoryLedgerCutoverPlan, "planChecksum">;

type IdResolver = {
  legacy(entityType: string, legacyId: string): string;
  derived(entityType: string, legacyId: string): string;
};

type ResolvedSourceDocument = {
  sourceType: string;
  sourceId: string;
};

type InventoryCostState = {
  warehouseId: string;
  productUnitId: string;
  quantityOnHand: number;
  movingAverageCost: number;
};

const DEFERRED_COLLECTIONS = [
  "approvalRequests",
  "customerPayments",
  "supplierPayments",
  "employeePayments",
  "employeeAdvances",
  "cashTransactions",
  "cashVouchers",
  "bankTransferProofs",
  "workOrders",
  "compensationBatches",
  "importJobs",
  "importIssues",
  "auditLogs",
  "processedOperations"
] as const;

export function createInventoryLedgerCutoverPlan(
  state: OperationsState,
  input: CreateInventoryLedgerCutoverPlanInput
): InventoryLedgerCutoverPlan {
  assertTimestamp(input.generatedAt, "generatedAt");
  const manifest = inspectOperationsStateForCutover(state, {
    namespace: input.namespace,
    revision: input.sourceRevision,
    stateSchemaVersion: input.stateSchemaVersion,
    now: input.generatedAt
  });
  if (!manifest.ready) {
    throw new Error(`CUTOVER_STATE_BLOCKED: ${manifest.issues.map((issue) => issue.code).join(", ")}`);
  }
  assertOperationsCutoverMappings(state, input.mappingOverrides);

  const idMap = createLegacyIdMap(state, input.namespace);
  const ids = createIdResolver(idMap, input.namespace);
  const source = (documentNo: string) => resolveSourceDocument(documentNo, input.mappingOverrides, ids);
  const inventory = buildInventoryBatches(state, ids, source, input.generatedAt);
  const ledgers = buildLedgerBatches(state, ids, source, input.generatedAt);
  const unsignedPlan: UnsignedInventoryLedgerCutoverPlan = {
    planVersion: 1,
    scope: "inventory_and_ledgers",
    isComplete: false,
    source: manifest.source,
    sourceChecksum: manifest.sourceChecksum,
    generatedAt: input.generatedAt,
    idMap,
    batches: [...inventory, ...ledgers],
    deferredCollections: [...DEFERRED_COLLECTIONS]
  };
  return {
    ...unsignedPlan,
    planChecksum: calculateInventoryLedgerCutoverPlanChecksum(unsignedPlan)
  };
}

export function calculateInventoryLedgerCutoverPlanChecksum(
  plan: InventoryLedgerCutoverPlan | UnsignedInventoryLedgerCutoverPlan
) {
  const { planChecksum: _planChecksum, ...unsignedPlan } = plan as InventoryLedgerCutoverPlan;
  return checksum(unsignedPlan);
}

function buildInventoryBatches(
  state: OperationsState,
  ids: IdResolver,
  source: (documentNo: string) => ResolvedSourceDocument,
  generatedAt: string
): InventoryLedgerCutoverBatch[] {
  const postings: InventoryLedgerCutoverRow[] = [];
  const lines: InventoryLedgerCutoverRow[] = [];
  const reversalLinks: InventoryLedgerCutoverRow[] = [];
  const costStates = new Map<string, InventoryCostState>();
  const movements = state.inventoryMovements.slice().sort(compareInventoryMovement);

  for (const movement of movements) {
    if (!Number.isFinite(movement.quantity) || movement.quantity === 0 || !Number.isFinite(movement.unitCost) || movement.unitCost < 0) {
      throw new Error(`CUTOVER_INVENTORY_MOVEMENT_INVALID: Movement ${movement.id} has an invalid quantity or unit cost.`);
    }
    const sourceDocument = source(movement.sourceDocument);
    postings.push(row(ids.legacy("inventory_movement", movement.id), movement.id, {
      document_no: `CUTOVER-INV-${movement.id}`,
      posting_type: mapInventoryPostingType(movement),
      source_type: sourceDocument.sourceType,
      source_id: sourceDocument.sourceId,
      posting_key: movement.postingKey,
      posted_at: movement.postedAt,
      posted_by: null,
      reversed_by_id: null,
      legacy_runtime_id: movement.id,
      legacy_metadata: {
        source_document: movement.sourceDocument,
        source_line_legacy_id: movement.sourceLineId ?? null,
        reason: movement.reason ?? null,
        related_movement_legacy_id: movement.relatedMovementId ?? null
      }
    }));
    lines.push(row(ids.derived("inventory_movement_line", movement.id), movement.id, {
      posting_id: ids.legacy("inventory_movement", movement.id),
      warehouse_id: ids.legacy("warehouse", movement.warehouseId),
      product_unit_id: ids.legacy("product_unit", movement.productUnitId),
      quantity: movement.quantity,
      unit_cost: movement.unitCost,
      legacy_runtime_id: movement.id
    }));
    if (movement.reversedById) {
      reversalLinks.push(row(ids.legacy("inventory_movement", movement.id), movement.id, {
        reversed_by_id: ids.legacy("inventory_movement", movement.reversedById)
      }));
    }
    applyInventoryCostState(costStates, movement, ids);
  }

  const costStateRows = [...costStates.values()]
    .sort((left, right) => `${left.warehouseId}:${left.productUnitId}`.localeCompare(`${right.warehouseId}:${right.productUnitId}`))
    .map((state) => row(
      ids.derived("inventory_cost_state", `${state.warehouseId}:${state.productUnitId}`),
      `${state.warehouseId}:${state.productUnitId}`,
      {
        warehouse_id: state.warehouseId,
        product_unit_id: state.productUnitId,
        quantity_on_hand: state.quantityOnHand,
        moving_average_cost: state.movingAverageCost,
        updated_at: generatedAt
      }
    ));

  return [
    batch("inventory.postings", "inventory_postings", "insert", postings),
    batch("inventory.movement-lines", "inventory_movement_lines", "insert", lines),
    batch("inventory.cost-states", "inventory_cost_states", "insert", costStateRows),
    batch("inventory.posting-reversals", "inventory_postings", "update", reversalLinks)
  ];
}

function buildLedgerBatches(
  state: OperationsState,
  ids: IdResolver,
  source: (documentNo: string) => ResolvedSourceDocument,
  generatedAt: string
): InventoryLedgerCutoverBatch[] {
  const customerRows = state.customerLedgerEntries.slice().sort(compareId).map((entry) => customerLedgerRow(entry, ids, source, generatedAt));
  const supplierRows = state.supplierLedgerEntries.slice().sort(compareId).map((entry) => supplierLedgerRow(entry, ids, source, generatedAt));
  const employeeRows = state.employeeLedgerEntries.slice().sort(compareId).map((entry) => employeeLedgerRow(entry, ids, source, generatedAt));
  const customerReversals = state.customerLedgerEntries
    .filter((entry) => entry.reversedById)
    .map((entry) => row(ids.legacy("customer_ledger_entry", entry.id), entry.id, { reversed_by_id: ids.legacy("customer_ledger_entry", entry.reversedById!) }));
  const supplierReversals = state.supplierLedgerEntries
    .filter((entry) => entry.reversedById)
    .map((entry) => row(ids.legacy("supplier_ledger_entry", entry.id), entry.id, { reversed_by_id: ids.legacy("supplier_ledger_entry", entry.reversedById!) }));
  const employeeReversals = state.employeeLedgerEntries
    .filter((entry) => entry.reversedById)
    .map((entry) => row(ids.legacy("employee_ledger_entry", entry.id), entry.id, { reversed_by_id: ids.legacy("employee_ledger_entry", entry.reversedById!) }));

  return [
    batch("receivables.entries", "customer_ledger_entries", "insert", customerRows),
    batch("payables.entries", "supplier_ledger_entries", "insert", supplierRows),
    batch("workforce.ledger-entries", "employee_ledger_entries", "insert", employeeRows),
    batch("receivables.reversals", "customer_ledger_entries", "update", customerReversals),
    batch("payables.reversals", "supplier_ledger_entries", "update", supplierReversals),
    batch("workforce.ledger-reversals", "employee_ledger_entries", "update", employeeReversals)
  ];
}

function customerLedgerRow(
  entry: CustomerLedgerEntry,
  ids: IdResolver,
  source: (documentNo: string) => ResolvedSourceDocument,
  generatedAt: string
) {
  const resolved = source(entry.sourceDocument);
  return row(ids.legacy("customer_ledger_entry", entry.id), entry.id, {
    customer_id: ids.legacy("customer", entry.customerId),
    entry_type: entry.entryType === "customer_payment" ? "payment" : entry.entryType === "reversal" ? "reversal" : "receivable",
    source_type: resolved.sourceType,
    source_id: resolved.sourceId,
    debit: entry.direction === "debit" ? entry.amount : 0,
    credit: entry.direction === "credit" ? entry.amount : 0,
    posting_date: dateOnly(entry.postingDate, `customerLedgerEntries.${entry.id}.postingDate`),
    posted_at: generatedAt,
    posted_by: null,
    reversed_by_id: null,
    legacy_runtime_id: entry.id
  });
}

function supplierLedgerRow(
  entry: SupplierLedgerEntry,
  ids: IdResolver,
  source: (documentNo: string) => ResolvedSourceDocument,
  generatedAt: string
) {
  const resolved = source(entry.sourceDocument);
  return row(ids.legacy("supplier_ledger_entry", entry.id), entry.id, {
    supplier_id: ids.legacy("supplier", entry.supplierId),
    entry_type: entry.entryType === "supplier_payment" ? "payment" : entry.entryType === "reversal" ? "reversal" : "payable",
    source_type: resolved.sourceType,
    source_id: resolved.sourceId,
    debit: entry.direction === "debit" ? entry.amount : 0,
    credit: entry.direction === "credit" ? entry.amount : 0,
    posting_date: dateOnly(entry.postingDate, `supplierLedgerEntries.${entry.id}.postingDate`),
    posted_at: generatedAt,
    posted_by: null,
    reversed_by_id: null,
    legacy_runtime_id: entry.id
  });
}

function employeeLedgerRow(
  entry: EmployeeLedgerEntry,
  ids: IdResolver,
  source: (documentNo: string) => ResolvedSourceDocument,
  generatedAt: string
) {
  const resolved = source(entry.sourceDocument);
  return row(ids.legacy("employee_ledger_entry", entry.id), entry.id, {
    employee_id: ids.legacy("employee", entry.employeeId),
    entry_type: entry.entryType ?? (entry.direction === "credit" ? "compensation" : "payment"),
    source_type: resolved.sourceType,
    source_id: resolved.sourceId,
    debit: entry.direction === "debit" ? entry.amount : 0,
    credit: entry.direction === "credit" ? entry.amount : 0,
    posting_date: dateOnly(entry.postingDate, `employeeLedgerEntries.${entry.id}.postingDate`),
    posted_at: generatedAt,
    posted_by: null,
    reversed_by_id: null,
    legacy_runtime_id: entry.id
  });
}

function applyInventoryCostState(
  states: Map<string, InventoryCostState>,
  movement: InventoryMovement,
  ids: IdResolver
) {
  const warehouseId = ids.legacy("warehouse", movement.warehouseId);
  const productUnitId = ids.legacy("product_unit", movement.productUnitId);
  const key = `${warehouseId}:${productUnitId}`;
  const current = states.get(key) ?? {
    warehouseId,
    productUnitId,
    quantityOnHand: 0,
    movingAverageCost: 0
  };
  const nextQuantity = number(current.quantityOnHand + movement.quantity, 3);
  if (nextQuantity < 0) {
    throw new Error(`CUTOVER_INVENTORY_NEGATIVE_STOCK: Movement ${movement.id} would make ${movement.warehouseId}/${movement.productUnitId} negative.`);
  }
  const nextCost = movement.quantity > 0
    ? number(((current.quantityOnHand * current.movingAverageCost) + (movement.quantity * movement.unitCost)) / nextQuantity, 4)
    : current.movingAverageCost;
  states.set(key, {
    warehouseId,
    productUnitId,
    quantityOnHand: nextQuantity,
    movingAverageCost: nextQuantity === 0 ? current.movingAverageCost : nextCost
  });
}

function resolveSourceDocument(documentNo: string, overrides: CutoverMappingOverrides, ids: IdResolver): ResolvedSourceDocument {
  const mapping = overrides.sourceDocuments?.[documentNo] as CutoverSourceDocumentOverride | undefined;
  if (!mapping) {
    throw new Error(`CUTOVER_SOURCE_DOCUMENT_MAPPING_REQUIRED: ${documentNo} has no typed source target.`);
  }
  return {
    sourceType: mapping.entityType,
    sourceId: ids.legacy(cutoverSourceEntityLegacyMapEntityType(mapping.entityType), mapping.targetLegacyId)
  };
}

function mapInventoryPostingType(movement: InventoryMovement) {
  switch (movement.movementType) {
    case "opening": return "opening";
    case "receipt": return "receipt";
    case "issue": return "issue";
    case "transfer_out":
    case "transfer_in": return "transfer";
    case "adjustment": return "count_adjustment";
    case "reverse": return "reversal";
  }
}

function createIdResolver(map: CutoverLegacyIdMap[], namespace: string): IdResolver {
  const values = new Map(map.map((entry) => [`${entry.entityType}:${entry.legacyId}`, entry.targetId]));
  return {
    legacy(entityType, legacyId) {
      const id = values.get(`${entityType}:${legacyId}`);
      if (!id) throw new Error(`CUTOVER_LEGACY_ID_MAPPING_REQUIRED: ${entityType} ${legacyId} has no deterministic target id.`);
      return id;
    },
    derived(entityType, legacyId) {
      return createDeterministicLegacyUuid(namespace, entityType, legacyId);
    }
  };
}

function batch(name: string, table: string, operation: "insert" | "update", rows: InventoryLedgerCutoverRow[]): InventoryLedgerCutoverBatch {
  return { name, table, operation, rows: rows.slice().sort((left, right) => left.id.localeCompare(right.id)) };
}

function row(id: string, legacyId: string, values: Record<string, unknown>): InventoryLedgerCutoverRow {
  return { id, legacyId, values };
}

function compareId<T extends { id: string }>(left: T, right: T) {
  return left.id.localeCompare(right.id);
}

function compareInventoryMovement(left: InventoryMovement, right: InventoryMovement) {
  return left.postedAt.localeCompare(right.postedAt) || left.id.localeCompare(right.id);
}

function dateOnly(value: string, path: string) {
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00.000Z`))) {
    throw new Error(`CUTOVER_DATE_INVALID: ${path} must be an ISO calendar date.`);
  }
  return date;
}

function assertTimestamp(value: string, path: string) {
  if (!value.trim() || Number.isNaN(Date.parse(value))) {
    throw new Error(`CUTOVER_TIMESTAMP_INVALID: ${path} must be an ISO timestamp.`);
  }
}

function number(value: number, decimals: number) {
  const multiplier = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function checksum(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}
