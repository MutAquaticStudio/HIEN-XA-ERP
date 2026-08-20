import type {
  Customer,
  CustomerLedgerEntry,
  Employee,
  MoneyTotals,
  OperationsActor,
  OperationsState,
  ProductUnit,
  SalesOrderLine,
  Supplier,
  SupplierLedgerEntry,
  Vehicle,
  Warehouse
} from "./types";
import { buildCustomerOrderCatalog, type CustomerOrderCatalogProduct } from "./customer-order-catalog";

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

/** Canonical selectable master data used by all module forms and read models. */
export function getSelectableCustomers(state: OperationsState, actor?: OperationsActor): Customer[] {
  return state.customers.filter((customer) => customer.status === "active" && (!actor?.customerId || actor.customerId === customer.id));
}

export function getSelectableSuppliers(state: OperationsState, actor?: OperationsActor): Supplier[] {
  return state.suppliers.filter((supplier) => supplier.status === "active" && (!actor?.supplierId || actor.supplierId === supplier.id));
}

export function getSelectableProducts(state: OperationsState): ProductUnit[] {
  return state.productUnits.filter((product) => product.status === "active");
}

export function getProductUnits(state: OperationsState): ProductUnit[] {
  return getSelectableProducts(state);
}

export function getSelectableWarehouses(state: OperationsState, actor?: OperationsActor): Warehouse[] {
  const scopedWarehouseIds = actor?.warehouseIds?.length ? new Set(actor.warehouseIds) : undefined;
  return state.warehouses.filter((warehouse) => warehouse.status === "active" && (!scopedWarehouseIds || scopedWarehouseIds.has(warehouse.id)));
}

export function getAssignableWorkers(state: OperationsState): Employee[] {
  return state.employees.filter((employee) => employee.status === "active" && employee.roleType === "worker");
}

export function getAvailableVehicles(state: OperationsState): Vehicle[] {
  const busyVehicleIds = new Set(state.deliveryJobs.filter((job) => ["assigned", "loading", "in_transit"].includes(job.status)).map((job) => job.vehicleId));
  return state.vehicles.filter((vehicle) => vehicle.status === "active" && !busyVehicleIds.has(vehicle.id));
}

export function getCustomerPortalCatalog(state: OperationsState): CustomerOrderCatalogProduct[] {
  return buildCustomerOrderCatalog(state);
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
