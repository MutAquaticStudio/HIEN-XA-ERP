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
    "inventoryMovements"
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
    "cashVouchers"
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
  return projected;
}

function projectDriverData(state: OperationsState, user: SafeIdentityUser) {
  const driver = state.employees.find((employee) =>
    employee.roleType === "driver" && normalizeName(employee.displayName) === normalizeName(user.displayName)
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
      lines: order.lines.map((line) => ({ ...line, unitPrice: 0 }))
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
  state.productUnits = state.productUnits.filter((product) => productUnitIds.has(product.id));
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
    employee.roleType === "worker" && normalizeName(employee.displayName) === normalizeName(user.displayName)
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

  const workOrders = state.workOrders.filter((order) =>
    order.participants.some((participant) => participant.employeeId === worker.id)
  );
  const workOrderIds = new Set(workOrders.map((order) => order.id));
  const deliveryJobs = state.deliveryJobs.filter((job) => job.driverId === worker.id || job.helperIds.includes(worker.id));
  const deliveryOrderIds = new Set(deliveryJobs.map((job) => job.salesOrderId));
  const receiptOrders = state.purchaseOrders
    .map((order) => ({
      ...order,
      attachments: order.attachments?.filter((attachment) => attachment.uploadedBy === user.id),
      lines: order.lines
        .filter((line) => line.destinationType === "warehouse" && line.receivedQuantity < line.orderedQuantity)
        .map((line) => ({
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
      lines: order.lines.map((line) => ({
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
  state.productUnits = state.productUnits.filter((product) => productUnitIds.has(product.id));
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
