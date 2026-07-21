import type {
  CustomerLedgerEntry,
  MoneyTotals,
  OperationsState,
  SalesOrderLine,
  SupplierLedgerEntry
} from "./types";

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
