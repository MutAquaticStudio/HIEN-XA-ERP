import type { OperationsModuleId } from "@/modules/operations/erp-registry";
import { visibleModulesForRole } from "@/modules/operations/identity";
import type { OperationsSnapshot, OperationsState } from "@/modules/operations/types";
import type { SafeIdentityUser } from "./types";

const stateFields = [
  "customers",
  "suppliers",
  "employees",
  "productUnits",
  "unitDefinitions",
  "purchaseUnitConversions",
  "warehouses",
  "vehicles",
  "salesOrders",
  "purchaseOrders",
  "inventoryMovements",
  "inventoryCountSessions",
  "deliveryJobs",
  "approvalRequests",
  "customerLedgerEntries",
  "supplierLedgerEntries",
  "employeeLedgerEntries",
  "customerPayments",
  "supplierPayments",
  "employeePayments",
  "employeeAdvances",
  "cashTransactions",
  "cashVouchers",
  "bankTransferProofs",
  "customerPaymentProofRequests",
  "workOrders",
  "compensationBatches",
  "importIssues",
  "importJobs",
  "auditLogs",
  "processedOperations"
] as const satisfies ReadonlyArray<keyof OperationsState>;

type StateField = (typeof stateFields)[number];

const moduleStateFields: Record<OperationsModuleId, StateField[]> = {
  overview: [],
  masterData: [
    "customers",
    "suppliers",
    "employees",
    "productUnits",
    "unitDefinitions",
    "purchaseUnitConversions",
    "warehouses",
    "vehicles"
  ],
  sales: [
    "customers",
    "productUnits",
    "warehouses",
    "salesOrders",
    "purchaseOrders",
    "deliveryJobs",
    "customerLedgerEntries"
  ],
  procurement: [
    "suppliers",
    "customers",
    "productUnits",
    "unitDefinitions",
    "purchaseUnitConversions",
    "warehouses",
    "purchaseOrders",
    "salesOrders",
    "approvalRequests"
  ],
  delivery: [
    "customers",
    "suppliers",
    "employees",
    "productUnits",
    "warehouses",
    "vehicles",
    "salesOrders",
    "purchaseOrders",
    "inventoryMovements",
    "deliveryJobs",
    "approvalRequests"
  ],
  inventory: [
    "productUnits",
    "warehouses",
    "salesOrders",
    "purchaseOrders",
    "inventoryMovements",
    "inventoryCountSessions"
  ],
  receivables: [
    "customers",
    "salesOrders",
    "deliveryJobs",
    "customerLedgerEntries",
    "customerPayments",
    "cashTransactions"
  ],
  payables: [
    "suppliers",
    "purchaseOrders",
    "supplierLedgerEntries",
    "supplierPayments",
    "cashTransactions"
  ],
  cash: [
    "customers",
    "suppliers",
    "employees",
    "customerLedgerEntries",
    "supplierLedgerEntries",
    "employeeLedgerEntries",
    "customerPayments",
    "supplierPayments",
    "employeePayments",
    "employeeAdvances",
    "cashTransactions",
    "cashVouchers",
    "bankTransferProofs",
    "customerPaymentProofRequests"
  ],
  workforce: [
    "employees",
    "productUnits",
    "employeeLedgerEntries",
    "employeePayments",
    "employeeAdvances",
    "workOrders",
    "compensationBatches"
  ],
  import: ["importIssues", "importJobs"],
  audit: ["auditLogs"],
  reporting: stateFields.filter((field) => field !== "processedOperations")
};

export function projectOperationsSnapshot(snapshot: OperationsSnapshot, user: SafeIdentityUser): OperationsSnapshot {
  return {
    ...snapshot,
    state: projectOperationsState(snapshot.state, user)
  };
}

export function projectOperationsState(state: OperationsState, user: SafeIdentityUser): OperationsState {
  if (user.role === "customer") {
    return projectCustomerData(structuredClone(state), user);
  }
  if (user.role === "supplier") {
    return projectSupplierData(structuredClone(state), user);
  }
  const allowedByRole = new Set(visibleModulesForRole(user.role));
  const effectiveModules = user.moduleIds.filter((moduleId) => allowedByRole.has(moduleId));
  const allowedFields = new Set<StateField>(
    effectiveModules.flatMap((moduleId) => moduleStateFields[moduleId])
  );
  const projected = structuredClone(state);

  for (const field of stateFields) {
    if (!allowedFields.has(field) || field === "processedOperations") {
      projected[field] = [] as never;
    }
  }

  if (user.role === "driver") {
    return projectDriverData(projected, user);
  }
  if (user.role === "worker") {
    return projectWorkerData(projected, user);
  }
  if (user.role === "warehouse") {
    return projectWarehouseData(projected, user);
  }
  return projected;
}

function projectWarehouseData(state: OperationsState, user: SafeIdentityUser): OperationsState {
  const warehouseIds = new Set(user.warehouseIds ?? []);
  if (warehouseIds.size === 0) {
    state.warehouses = [];
    state.inventoryMovements = [];
    state.inventoryCountSessions = [];
    state.purchaseOrders = [];
    state.salesOrders = [];
    state.deliveryJobs = [];
    state.approvalRequests = [];
    return state;
  }

  state.warehouses = state.warehouses.filter((warehouse) => warehouseIds.has(warehouse.id));
  state.inventoryMovements = state.inventoryMovements.filter((movement) => warehouseIds.has(movement.warehouseId));
  state.inventoryCountSessions = (state.inventoryCountSessions ?? [])
    .filter((session) => warehouseIds.has(session.warehouseId))
    .map((session) => ({
      ...session,
      lines: session.lines.map((line) => ({
        ...line,
        unitCost: 0,
        estimatedDifferenceValue: undefined,
        attachments: line.attachments.filter((attachment) => attachment.uploadedBy === user.id)
      }))
    }));

  state.purchaseOrders = state.purchaseOrders
    .map((order) => ({
      ...order,
      lines: order.lines.filter((line) => line.destinationType === "warehouse" && Boolean(line.warehouseId) && warehouseIds.has(line.warehouseId!))
    }))
    .filter((order) => order.lines.length > 0);
  state.salesOrders = state.salesOrders
    .map((order) => ({
      ...order,
      lines: order.lines.filter((line) => line.sourceType === "warehouse" && Boolean(line.warehouseId) && warehouseIds.has(line.warehouseId!))
    }))
    .filter((order) => order.lines.length > 0);

  const visibleSalesOrderIds = new Set(state.salesOrders.map((order) => order.id));
  state.deliveryJobs = state.deliveryJobs.filter((job) => visibleSalesOrderIds.has(job.salesOrderId));
  const visibleDeliveryJobIds = new Set(state.deliveryJobs.map((job) => job.id));
  state.approvalRequests = state.approvalRequests.filter((request) =>
    (request.type === "goods_receipt" && state.purchaseOrders.some((order) => order.lines.some((line) => line.id === request.targetId))) ||
    (request.type === "delivery_completion" && visibleDeliveryJobIds.has(request.targetId))
  );
  return state;
}

function projectCustomerData(state: OperationsState, user: SafeIdentityUser) {
  const customerId = user.customerId;
  if (!customerId) {
    for (const field of stateFields) {
      state[field] = [] as never;
    }
    return state;
  }

  const customerOrders = state.salesOrders
    .filter((order) => order.customerId === customerId)
    .map((order) => ({ ...order, attachments: undefined }));
  const productUnitIds = new Set(customerOrders.flatMap((order) => order.lines.map((line) => line.productUnitId)));
  const customerOrderIds = new Set(customerOrders.map((order) => order.id));
  const customerDeliveryJobs = state.deliveryJobs
    .filter((job) => customerOrderIds.has(job.salesOrderId))
    .map(({ completionAttachments: _completionAttachments, quantityChangeRequest: _quantityChangeRequest, ...job }) => job);

  for (const field of stateFields) {
    if (!["customers", "productUnits", "salesOrders", "deliveryJobs", "customerLedgerEntries", "customerPaymentProofRequests"].includes(field)) {
      state[field] = [] as never;
    }
  }
  state.customers = state.customers
    .filter((customer) => customer.id === customerId)
    .map(({ collectionOwnerEmployeeId: _collectionOwnerEmployeeId, collectionFollowUps: _collectionFollowUps, ...customer }) => customer);
  state.productUnits = state.productUnits
    .filter((productUnit) => productUnitIds.has(productUnit.id))
    .map(({ preferredSupplierId: _preferredSupplierId, targetMarginRate: _targetMarginRate, standardLeadTimeDays: _standardLeadTimeDays, reorderPolicies: _reorderPolicies, priceHistory: _priceHistory, ...productUnit }) => productUnit);
  state.salesOrders = customerOrders;
  state.deliveryJobs = customerDeliveryJobs;
  state.customerLedgerEntries = state.customerLedgerEntries.filter((entry) => entry.customerId === customerId);
  state.customerPaymentProofRequests = (state.customerPaymentProofRequests ?? []).filter((proof) => proof.customerId === customerId);
  return state;
}

function projectSupplierData(state: OperationsState, user: SafeIdentityUser) {
  const supplierId = user.supplierId;
  if (!supplierId) {
    for (const field of stateFields) state[field] = [] as never;
    return state;
  }
  const purchaseOrders = state.purchaseOrders
    .filter((order) => order.supplierId === supplierId)
    .map(({ freightCharges: _freightCharges, attachments: _attachments, ...order }) => ({ ...order, attachments: undefined }));
  const productIds = new Set(purchaseOrders.flatMap((order) => order.lines.map((line) => line.productUnitId)));
  const warehouseIds = new Set(purchaseOrders.flatMap((order) => order.lines.map((line) => line.warehouseId).filter((id): id is string => Boolean(id))));
  const customerIds = new Set(purchaseOrders.flatMap((order) => order.lines.map((line) => line.customerId).filter((id): id is string => Boolean(id))));
  for (const field of stateFields) {
    if (!["suppliers", "purchaseOrders", "productUnits", "warehouses", "customers", "supplierLedgerEntries", "supplierPayments"].includes(field)) state[field] = [] as never;
  }
  state.suppliers = state.suppliers.filter((supplier) => supplier.id === supplierId);
  state.purchaseOrders = purchaseOrders;
  state.productUnits = state.productUnits
    .filter((product) => productIds.has(product.id))
    .map(({ preferredSupplierId: _preferredSupplierId, salePrice: _salePrice, saleTaxRate: _saleTaxRate, targetMarginRate: _targetMarginRate, standardLeadTimeDays: _standardLeadTimeDays, reorderPolicies: _reorderPolicies, priceHistory: _priceHistory, ...product }) => product);
  state.warehouses = state.warehouses.filter((warehouse) => warehouseIds.has(warehouse.id));
  state.customers = state.customers.filter((customer) => customerIds.has(customer.id)).map((customer) => ({ ...customer, creditLimit: 0, phone: "" }));
  state.supplierLedgerEntries = state.supplierLedgerEntries.filter((entry) => entry.supplierId === supplierId);
  state.supplierPayments = state.supplierPayments.filter((payment) => payment.supplierId === supplierId);
  return state;
}

function projectDriverData(state: OperationsState, user: SafeIdentityUser) {
  const driver = state.employees.find((employee) =>
    employee.roleType === "driver" && user.employeeId === employee.id && employee.status === "active"
  );
  const deliveryJobs = driver
    ? state.deliveryJobs.filter((job) => job.driverId === driver.id)
    : [];
  const salesOrderIds = new Set(deliveryJobs.map((job) => job.salesOrderId));
  const salesOrders = state.salesOrders
    .filter((order) => salesOrderIds.has(order.id))
    .map((order) => ({
      ...order,
      attachments: order.attachments?.filter((attachment) => attachment.uploadedBy === user.id),
      commercialTerms: undefined,
      deliveryCharge: undefined,
      lines: order.lines.map(({ discount: _discount, ...line }) => ({ ...line, unitPrice: 0 }))
    }));
  const customerIds = new Set(salesOrders.map((order) => order.customerId));
  const vehicleIds = new Set(deliveryJobs.map((job) => job.vehicleId));
  const productUnitIds = new Set(salesOrders.flatMap((order) => order.lines.map((line) => line.productUnitId)));

  state.employees = driver ? [driver] : [];
  state.deliveryJobs = deliveryJobs;
  state.salesOrders = salesOrders;
  state.customers = state.customers
    .filter((customer) => customerIds.has(customer.id))
    .map((customer) => ({ ...customer, creditLimit: 0 }));
  state.vehicles = state.vehicles.filter((vehicle) => vehicleIds.has(vehicle.id));
  state.productUnits = state.productUnits
    .filter((product) => productUnitIds.has(product.id))
    .map(({ preferredSupplierId: _preferredSupplierId, salePrice: _salePrice, saleTaxRate: _saleTaxRate, targetMarginRate: _targetMarginRate, standardLeadTimeDays: _standardLeadTimeDays, reorderPolicies: _reorderPolicies, priceHistory: _priceHistory, ...product }) => product);
  state.purchaseOrders = [];
  state.inventoryMovements = [];
  state.suppliers = [];
  state.approvalRequests = state.approvalRequests.filter((request) =>
    request.type === "delivery_completion" && salesOrderIds.has(state.deliveryJobs.find((job) => job.id === request.targetId)?.salesOrderId ?? "")
  );
  return state;
}

function projectWorkerData(state: OperationsState, user: SafeIdentityUser) {
  const worker = state.employees.find((employee) =>
    employee.roleType === "worker" && user.employeeId === employee.id && employee.status === "active"
  );
  if (!worker) {
    state.employees = [];
    state.deliveryJobs = [];
    state.salesOrders = [];
    state.purchaseOrders = [];
    state.suppliers = [];
    state.customers = [];
    state.vehicles = [];
    state.productUnits = [];
    state.inventoryMovements = [];
    state.approvalRequests = [];
    state.workOrders = [];
    state.compensationBatches = [];
    state.employeeLedgerEntries = [];
    state.employeePayments = [];
    state.employeeAdvances = [];
    return state;
  }

  const ownWorkOrders = state.workOrders.filter((order) =>
    order.participants.some((participant) => participant.employeeId === worker.id)
  );
  const claimableWorkOrders = state.workOrders.filter((order) => order.status === "open" && Boolean(order.salesOrderId));
  const workOrders = [...ownWorkOrders, ...claimableWorkOrders];
  const workOrderIds = new Set(ownWorkOrders.map((order) => order.id));
  const deliveryJobs = state.deliveryJobs.filter((job) => job.driverId === worker.id || job.helperIds.includes(worker.id));
  const deliveryOrderIds = new Set(deliveryJobs.map((job) => job.salesOrderId));
  const receiptOrders = state.purchaseOrders
    .map((order) => ({
      ...order,
      attachments: order.attachments?.filter((attachment) => attachment.uploadedBy === user.id),
      commercialTerms: undefined,
      freightCharges: undefined,
      lines: order.lines
        .filter((line) => line.destinationType === "warehouse" && line.receivedQuantity < line.orderedQuantity)
        .map(({ discount: _discount, ...line }) => ({
          ...line,
          unitCost: 0,
          taxRate: 0,
          documentUnit: line.documentUnit ? { ...line.documentUnit, unitAmount: 0 } : undefined
        }))
    }))
    .filter((order) => order.lines.length > 0);
  const receiptSupplierIds = new Set(receiptOrders.map((order) => order.supplierId));
  const relatedEmployeeIds = new Set([
    worker.id,
    ...deliveryJobs.flatMap((job) => [job.driverId, ...job.helperIds])
  ]);
  const productUnitIds = new Set([
    ...receiptOrders.flatMap((order) => order.lines.map((line) => line.productUnitId)),
    ...state.salesOrders
      .filter((order) => deliveryOrderIds.has(order.id))
      .flatMap((order) => order.lines.map((line) => line.productUnitId))
  ]);
  state.employees = state.employees.filter((employee) => relatedEmployeeIds.has(employee.id));
  state.deliveryJobs = deliveryJobs;
  state.salesOrders = state.salesOrders
    .filter((order) => deliveryOrderIds.has(order.id))
    .map((order) => ({
      ...order,
      attachments: order.attachments?.filter((attachment) => attachment.uploadedBy === user.id),
      commercialTerms: undefined,
      deliveryCharge: undefined,
      lines: order.lines.map(({ discount: _discount, ...line }) => ({
        ...line,
        unitPrice: 0,
        taxRate: 0,
        documentUnit: line.documentUnit ? { ...line.documentUnit, unitAmount: 0 } : undefined
      }))
    }));
  state.purchaseOrders = receiptOrders;
  state.suppliers = state.suppliers.filter((supplier) => receiptSupplierIds.has(supplier.id));
  state.customers = state.customers
    .filter((customer) => state.salesOrders.some((order) => order.customerId === customer.id))
    .map((customer) => ({ ...customer, creditLimit: 0 }));
  state.vehicles = state.vehicles.filter((vehicle) => deliveryJobs.some((job) => job.vehicleId === vehicle.id));
  state.productUnits = state.productUnits
    .filter((product) => productUnitIds.has(product.id))
    .map(({ preferredSupplierId: _preferredSupplierId, salePrice: _salePrice, saleTaxRate: _saleTaxRate, targetMarginRate: _targetMarginRate, standardLeadTimeDays: _standardLeadTimeDays, reorderPolicies: _reorderPolicies, priceHistory: _priceHistory, ...product }) => product);
  state.inventoryMovements = [];
  state.approvalRequests = state.approvalRequests.filter((request) => request.submittedBy === user.id);
  state.workOrders = workOrders;
  state.compensationBatches = state.compensationBatches
    .filter((batch) => workOrderIds.has(batch.workOrderId))
    .map((batch) => ({
      ...batch,
      lines: batch.lines.filter((line) => line.employeeId === worker.id),
      totalAmount: batch.lines
        .filter((line) => line.employeeId === worker.id)
        .reduce((sum, line) => sum + line.amount, 0)
    }));
  state.employeeLedgerEntries = state.employeeLedgerEntries.filter((entry) => entry.employeeId === worker.id);
  state.employeePayments = state.employeePayments.filter((payment) => payment.employeeId === worker.id);
  state.employeeAdvances = state.employeeAdvances.filter((advance) => advance.employeeId === worker.id);
  return state;
}

function normalizeName(value: string) {
  return value
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}
