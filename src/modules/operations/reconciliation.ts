import {
  customerBalance,
  employeeBalance,
  cashBalance,
  stockBalance,
  supplierBalance
} from "./selectors";
import { paymentAllocatedAmount, paymentUnallocatedAmount } from "./debt-reconciliation";
import type { OperationsState } from "./types";

export type ReconciliationPayment = {
  amount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  status: string;
};

export type ReconciliationSnapshot = {
  customerAr: Record<string, number>;
  supplierAp: Record<string, number>;
  employeePayables: Record<string, number>;
  cashBalance: number;
  inventoryQuantities: Record<string, number>;
  customerPayments: Record<string, ReconciliationPayment>;
  supplierPayments: Record<string, ReconciliationPayment>;
  paymentTotals: {
    customerAllocated: number;
    customerUnallocated: number;
    supplierAllocated: number;
    supplierUnallocated: number;
  };
};

/**
 * Read-only reconciliation contract. Every value is derived from append-only
 * ledgers, cash transactions, inventory movements, employee ledgers, and
 * payment allocations; no mutable balance field is read or written.
 */
export function reconcileOperationsState(state: OperationsState): ReconciliationSnapshot {
  const customerAr = Object.fromEntries(state.customers.map((customer) => [
    customer.id,
    customerBalance(state.customerLedgerEntries, customer.id)
  ]));
  const supplierAp = Object.fromEntries(state.suppliers.map((supplier) => [
    supplier.id,
    supplierBalance(state.supplierLedgerEntries, supplier.id)
  ]));
  const employeePayables = Object.fromEntries(state.employees.map((employee) => [
    employee.id,
    employeeBalance(state, employee.id)
  ]));

  const inventoryKeys = new Set<string>();
  for (const warehouse of state.warehouses) {
    for (const product of state.productUnits) inventoryKeys.add(inventoryKey(warehouse.id, product.id));
  }
  for (const movement of state.inventoryMovements) inventoryKeys.add(inventoryKey(movement.warehouseId, movement.productUnitId));
  const inventoryQuantities = Object.fromEntries([...inventoryKeys].sort().map((key) => {
    const [warehouseId, productUnitId] = key.split("::");
    return [key, stockBalance(state, warehouseId ?? "", productUnitId ?? "")];
  }));

  const customerPayments = Object.fromEntries(state.customerPayments.map((payment) => [
    payment.id,
    paymentSnapshot(payment.amount, payment.allocations, payment.status)
  ]));
  const supplierPayments = Object.fromEntries(state.supplierPayments.map((payment) => [
    payment.id,
    paymentSnapshot(payment.amount, payment.allocations, payment.status)
  ]));

  return {
    customerAr,
    supplierAp,
    employeePayables,
    cashBalance: cashBalance(state),
    inventoryQuantities,
    customerPayments,
    supplierPayments,
    paymentTotals: {
      customerAllocated: activePaymentTotal(customerPayments, "allocatedAmount"),
      customerUnallocated: activePaymentTotal(customerPayments, "unallocatedAmount"),
      supplierAllocated: activePaymentTotal(supplierPayments, "allocatedAmount"),
      supplierUnallocated: activePaymentTotal(supplierPayments, "unallocatedAmount")
    }
  };
}

export function reconciliationDiff(before: ReconciliationSnapshot, after: ReconciliationSnapshot) {
  const fields: Array<keyof ReconciliationSnapshot> = [
    "customerAr",
    "supplierAp",
    "employeePayables",
    "cashBalance",
    "inventoryQuantities",
    "customerPayments",
    "supplierPayments",
    "paymentTotals"
  ];
  return fields.filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
}

function paymentSnapshot(amount: number, allocations: Parameters<typeof paymentAllocatedAmount>[0]["allocations"], status: string): ReconciliationPayment {
  const allocatedAmount = paymentAllocatedAmount({ allocations });
  return {
    amount,
    allocatedAmount,
    unallocatedAmount: paymentUnallocatedAmount({ amount, allocations }),
    status
  };
}

function activePaymentTotal(
  payments: Record<string, ReconciliationPayment>,
  field: "allocatedAmount" | "unallocatedAmount"
) {
  return Object.values(payments)
    .filter((payment) => payment.status !== "draft" && payment.status !== "reversed")
    .reduce((total, payment) => total + payment[field], 0);
}

function inventoryKey(warehouseId: string, productUnitId: string) {
  return `${warehouseId}::${productUnitId}`;
}
