import type {
  Customer,
  Employee,
  OperationsActor,
  CustomerLedgerEntry,
  MoneyTotals,
  OperationsState,
  ProductUnit,
  SalesOrderLine,
  Supplier,
  SupplierLedgerEntry,
  UnitDefinition,
  Vehicle,
  Warehouse
} from "./types";

const activeDeliveryStatuses = new Set(["assigned", "loading", "in_transit"]);

/**
 * Shared master-data read models. These functions are the only selector
 * contract used by operational dropdowns: the entity id remains the
 * authoritative id, while actor scope and active/eligible rules stay here.
 */
export function getSelectableCustomers(state: OperationsState, actor: OperationsActor): Customer[] {
  if (actor.role === "customer" && !actor.customerId) return [];
  return state.customers.filter((customer) =>
    customer.status === "active" && (!actor.customerId || customer.id === actor.customerId)
  );
}

export function getSelectableSuppliers(state: OperationsState, actor: OperationsActor): Supplier[] {
  if (actor.role === "supplier" && !actor.supplierId) return [];
  return state.suppliers.filter((supplier) =>
    supplier.status === "active" && (!actor.supplierId || supplier.id === actor.supplierId)
  );
}

export function getSelectableProducts(state: OperationsState): ProductUnit[] {
  return state.productUnits.filter((product) => product.status === "active");
}

export function getSelectableWarehouses(state: OperationsState, actor: OperationsActor): Warehouse[] {
  const warehouseIds = scopedWarehouseIds(actor);
  return state.warehouses.filter((warehouse) =>
    warehouse.status === "active" && (!warehouseIds || warehouseIds.has(warehouse.id))
  );
}

export function getSelectableEmployees(state: OperationsState, actor: OperationsActor, roleType?: Employee["roleType"]): Employee[] {
  if (actor.role === "worker" && !actor.employeeId) return [];
  return state.employees.filter((employee) =>
    employee.status === "active" &&
    (!roleType || employee.roleType === roleType) &&
    (actor.role !== "worker" || employee.id === actor.employeeId)
  );
}

export function getAssignableWorkers(state: OperationsState, actor: OperationsActor): Employee[] {
  return getSelectableEmployees(state, actor, "worker");
}

export function getAssignableDrivers(state: OperationsState, actor: OperationsActor): Employee[] {
  return getSelectableEmployees(state, actor, "driver");
}

export function getAvailableVehicles(state: OperationsState): Vehicle[] {
  const busyVehicleIds = new Set(
    state.deliveryJobs
      .filter((job) => activeDeliveryStatuses.has(job.status))
      .map((job) => job.vehicleId)
  );
  return state.vehicles.filter((vehicle) => vehicle.status === "active" && !busyVehicleIds.has(vehicle.id));
}

export function getEligibleSalesOrdersForDelivery(state: OperationsState, actor: OperationsActor) {
  const warehouseIds = scopedWarehouseIds(actor);
  const activeOrderIds = new Set(
    state.deliveryJobs
      .filter((job) => activeDeliveryStatuses.has(job.status))
      .map((job) => job.salesOrderId)
  );
  return state.salesOrders.filter((order) =>
    (order.status === "allocated" || order.status === "partially_delivered") &&
    !activeOrderIds.has(order.id) &&
    order.lines.some((line) =>
      line.sourceType === "warehouse" &&
      line.deliveredQuantity < line.quantity &&
      (!warehouseIds || (line.warehouseId ? warehouseIds.has(line.warehouseId) : false))
    )
  );
}

export function getSelectableUnitDefinitions(state: OperationsState): UnitDefinition[] {
  return state.unitDefinitions.filter((unit) => unit.status === "active");
}

function scopedWarehouseIds(actor: OperationsActor): Set<string> | undefined {
  if (actor.warehouseIds !== undefined) return new Set(actor.warehouseIds);
  // A warehouse actor without an explicit assignment fails closed.
  return actor.role === "warehouse" ? new Set<string>() : undefined;
}

export function lineTotals(line: Pick<SalesOrderLine, "quantity" | "unitPrice" | "taxRate">): MoneyTotals {
  const net = line.quantity * line.unitPrice;
  const tax = net * line.taxRate;
  return {
    net,
    tax,
    gross: net + tax
  };
}

export function salesOrderTotals(lines: SalesOrderLine[]): MoneyTotals {
  return lines.reduce(
    (total, line) => {
      const current = lineTotals(line);
      return {
        net: total.net + current.net,
        tax: total.tax + current.tax,
        gross: total.gross + current.gross
      };
    },
    { net: 0, tax: 0, gross: 0 }
  );
}

export function customerBalance(entries: CustomerLedgerEntry[], customerId: string) {
  return entries
    .filter((entry) => entry.customerId === customerId && !entry.reversedById)
    .reduce((balance, entry) => balance + (entry.direction === "debit" ? entry.amount : -entry.amount), 0);
}

export function supplierBalance(entries: SupplierLedgerEntry[], supplierId: string) {
  return entries
    .filter((entry) => entry.supplierId === supplierId && !entry.reversedById)
    .reduce((balance, entry) => balance + (entry.direction === "credit" ? entry.amount : -entry.amount), 0);
}

export function employeeBalance(state: OperationsState, employeeId: string) {
  return state.employeeLedgerEntries
    .filter((entry) => entry.employeeId === employeeId && !entry.reversedById)
    .reduce((balance, entry) => balance + (entry.direction === "credit" ? entry.amount : -entry.amount), 0);
}

export function stockBalance(state: OperationsState, warehouseId: string, productUnitId: string) {
  return state.inventoryMovements
    .filter((movement) => movement.warehouseId === warehouseId && movement.productUnitId === productUnitId)
    .reduce((quantity, movement) => quantity + movement.quantity, 0);
}

export function cashBalance(state: OperationsState) {
  return state.cashTransactions.reduce(
    (balance, transaction) => balance + (transaction.direction === "in" ? transaction.amount : -transaction.amount),
    0
  );
}

export function productLabel(state: OperationsState, productUnitId: string) {
  const product = state.productUnits.find((item) => item.id === productUnitId);
  return product ? `${product.productCode} · ${product.productName} (${product.unitName})` : productUnitId;
}

export function partyName(state: OperationsState, id: string) {
  return (
    state.customers.find((item) => item.id === id)?.displayName ??
    state.suppliers.find((item) => item.id === id)?.displayName ??
    state.employees.find((item) => item.id === id)?.displayName ??
    id
  );
}
