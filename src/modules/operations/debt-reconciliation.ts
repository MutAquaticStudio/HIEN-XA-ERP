import type {
  CustomerPayment,
  OperationsState,
  PaymentAllocation,
  SupplierPayment
} from "./types";

export type DebtObligationStatus = "open" | "partially_allocated" | "settled";

export type DebtObligation = {
  ledgerEntryId: string;
  partyId: string;
  partyName: string;
  sourceDocument: string;
  postingDate: string;
  dueDate?: string;
  originalAmount: number;
  allocatedAmount: number;
  openAmount: number;
  status: DebtObligationStatus;
};

export type CustomerDebtAlert = {
  ledgerEntryId: string;
  customerId: string;
  customerName: string;
  collectionOwnerEmployeeId?: string;
  dueDate: string;
  openAmount: number;
  status: "due_soon_7" | "due_soon_3" | "due_soon_1" | "overdue";
};

export type DebtPartySummary = {
  partyId: string;
  partyName: string;
  balance: number;
  openObligationAmount: number;
  unappliedPaymentAmount: number;
  openObligationCount: number;
};

export function paymentAllocatedAmount(payment: Pick<CustomerPayment | SupplierPayment, "allocations">) {
  return (payment.allocations ?? []).reduce((sum, allocation) => sum + allocation.amount, 0);
}

export function paymentUnallocatedAmount(payment: Pick<CustomerPayment | SupplierPayment, "amount" | "allocations">) {
  return Math.max(0, payment.amount - paymentAllocatedAmount(payment));
}

export function customerAllocatedAmountForLedgerEntry(state: OperationsState, ledgerEntryId: string) {
  return activeAllocationAmount(state.customerPayments, ledgerEntryId);
}

export function supplierAllocatedAmountForLedgerEntry(state: OperationsState, ledgerEntryId: string) {
  return activeAllocationAmount(state.supplierPayments, ledgerEntryId);
}

export function getCustomerDebtObligations(state: OperationsState): DebtObligation[] {
  return state.customerLedgerEntries
    .filter((entry) =>
      entry.direction === "debit" &&
      !entry.reversedById &&
      entry.entryType !== "reversal" &&
      !hasCustomerLedgerReversal(state, entry.id, entry.postingGroupId)
    )
    .map((entry) => {
      const allocatedAmount = customerAllocatedAmountForLedgerEntry(state, entry.id);
      return obligation({
        ledgerEntryId: entry.id,
        partyId: entry.customerId,
        partyName: state.customers.find((customer) => customer.id === entry.customerId)?.displayName ?? entry.customerId,
        sourceDocument: entry.sourceDocument,
        postingDate: entry.postingDate,
        dueDate: entry.dueDate,
        originalAmount: entry.amount,
        allocatedAmount
      });
    })
    .sort(compareObligations);
}

export function getSupplierDebtObligations(state: OperationsState): DebtObligation[] {
  return state.supplierLedgerEntries
    .filter((entry) =>
      entry.direction === "credit" &&
      !entry.reversedById &&
      entry.entryType !== "reversal" &&
      !hasSupplierLedgerReversal(state, entry.id, entry.postingGroupId)
    )
    .map((entry) => {
      const allocatedAmount = supplierAllocatedAmountForLedgerEntry(state, entry.id);
      return obligation({
        ledgerEntryId: entry.id,
        partyId: entry.supplierId,
        partyName: state.suppliers.find((supplier) => supplier.id === entry.supplierId)?.displayName ?? entry.supplierId,
        sourceDocument: entry.sourceDocument,
        postingDate: entry.postingDate,
        originalAmount: entry.amount,
        allocatedAmount
      });
    })
    .sort(compareObligations);
}

export function getOpenCustomerDebtObligations(state: OperationsState, customerId?: string) {
  return getCustomerDebtObligations(state).filter(
    (item) => item.openAmount > 0 && (!customerId || item.partyId === customerId)
  );
}

export function getCustomerDebtAlerts(state: OperationsState, asOf: string): CustomerDebtAlert[] {
  const today = asUtcDay(asOf);
  return getOpenCustomerDebtObligations(state).flatMap((obligation) => {
    if (!obligation.dueDate) return [];
    const due = asUtcDay(obligation.dueDate);
    const daysUntilDue = Math.round((due.getTime() - today.getTime()) / 86_400_000);
    const status: CustomerDebtAlert["status"] | undefined = daysUntilDue < 0
      ? "overdue"
      : daysUntilDue === 1
        ? "due_soon_1"
        : daysUntilDue === 3
          ? "due_soon_3"
          : daysUntilDue === 7
            ? "due_soon_7"
            : undefined;
    if (!status) return [];
    return [{
      ledgerEntryId: obligation.ledgerEntryId,
      customerId: obligation.partyId,
      customerName: obligation.partyName,
      collectionOwnerEmployeeId: state.customers.find((customer) => customer.id === obligation.partyId)?.collectionOwnerEmployeeId,
      dueDate: obligation.dueDate,
      openAmount: obligation.openAmount,
      status
    }];
  }).sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.customerName.localeCompare(right.customerName));
}

export function getOpenSupplierDebtObligations(state: OperationsState, supplierId?: string) {
  return getSupplierDebtObligations(state).filter(
    (item) => item.openAmount > 0 && (!supplierId || item.partyId === supplierId)
  );
}

export function getCustomerDebtSummaries(state: OperationsState): DebtPartySummary[] {
  const obligations = getCustomerDebtObligations(state);
  return state.customers.map((customer) => {
    const partyObligations = obligations.filter((item) => item.partyId === customer.id);
    return {
      partyId: customer.id,
      partyName: customer.displayName,
      balance: state.customerLedgerEntries
        .filter((entry) => entry.customerId === customer.id && !entry.reversedById)
        .reduce((sum, entry) => sum + (entry.direction === "debit" ? entry.amount : -entry.amount), 0),
      openObligationAmount: partyObligations.reduce((sum, item) => sum + item.openAmount, 0),
      unappliedPaymentAmount: activeUnappliedAmount(state.customerPayments.filter((payment) => payment.customerId === customer.id)),
      openObligationCount: partyObligations.filter((item) => item.openAmount > 0).length
    };
  });
}

export function getSupplierDebtSummaries(state: OperationsState): DebtPartySummary[] {
  const obligations = getSupplierDebtObligations(state);
  return state.suppliers.map((supplier) => {
    const partyObligations = obligations.filter((item) => item.partyId === supplier.id);
    return {
      partyId: supplier.id,
      partyName: supplier.displayName,
      balance: state.supplierLedgerEntries
        .filter((entry) => entry.supplierId === supplier.id && !entry.reversedById)
        .reduce((sum, entry) => sum + (entry.direction === "credit" ? entry.amount : -entry.amount), 0),
      openObligationAmount: partyObligations.reduce((sum, item) => sum + item.openAmount, 0),
      unappliedPaymentAmount: activeUnappliedAmount(state.supplierPayments.filter((payment) => payment.supplierId === supplier.id)),
      openObligationCount: partyObligations.filter((item) => item.openAmount > 0).length
    };
  });
}

export function createDebtStatementCsv(state: OperationsState, kind: "customer" | "supplier") {
  const title = kind === "customer" ? "DOI SOAT CONG NO KHACH HANG" : "DOI SOAT CONG NO NHA CUNG CAP";
  const obligations = kind === "customer" ? getCustomerDebtObligations(state) : getSupplierDebtObligations(state);
  const summaries = kind === "customer" ? getCustomerDebtSummaries(state) : getSupplierDebtSummaries(state);
  const rows: Array<Array<string | number>> = [
    [title],
    ["Đối tượng", "Số dư sổ phụ", "Nghĩa vụ còn mở", "Tiền chưa phân bổ", "Số chứng từ mở"],
    ...summaries.map((item) => [
      item.partyName,
      item.balance,
      item.openObligationAmount,
      item.unappliedPaymentAmount,
      item.openObligationCount
    ]),
    [],
    ["Đối tượng", "Chứng từ", "Ngày ghi sổ", "Giá trị gốc", "Đã phân bổ", "Còn mở", "Trạng thái"],
    ...obligations.map((item) => [
      item.partyName,
      item.sourceDocument,
      item.postingDate,
      item.originalAmount,
      item.allocatedAmount,
      item.openAmount,
      item.status
    ])
  ];

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

function activeAllocationAmount(
  payments: Array<{ status: string; allocations?: PaymentAllocation[] }>,
  ledgerEntryId: string
) {
  return payments.reduce(
    (sum, payment) => payment.status === "reversed"
      ? sum
      : sum + (payment.allocations ?? [])
        .filter((allocation) => allocation.ledgerEntryId === ledgerEntryId)
        .reduce((allocationSum, allocation) => allocationSum + allocation.amount, 0),
    0
  );
}

function hasCustomerLedgerReversal(state: OperationsState, ledgerEntryId: string, postingGroupId?: string) {
  return state.customerLedgerEntries.some((entry) =>
    entry.entryType === "reversal" &&
    entry.direction === "credit" &&
    (entry.reversedById === ledgerEntryId || Boolean(postingGroupId && entry.postingGroupId === postingGroupId))
  );
}

function hasSupplierLedgerReversal(state: OperationsState, ledgerEntryId: string, postingGroupId?: string) {
  return state.supplierLedgerEntries.some((entry) =>
    entry.entryType === "reversal" &&
    entry.direction === "debit" &&
    (entry.reversedById === ledgerEntryId || Boolean(postingGroupId && entry.postingGroupId === postingGroupId))
  );
}

function activeUnappliedAmount<T extends CustomerPayment | SupplierPayment>(
  payments: T[]
) {
  return payments
    .filter((payment) => payment.status !== "draft" && payment.status !== "reversed")
    .reduce((sum, payment) => sum + paymentUnallocatedAmount(payment), 0);
}

function obligation(input: Omit<DebtObligation, "openAmount" | "status">): DebtObligation {
  const openAmount = Math.max(0, input.originalAmount - input.allocatedAmount);
  return {
    ...input,
    openAmount,
    status: openAmount === 0 ? "settled" : input.allocatedAmount > 0 ? "partially_allocated" : "open"
  };
}

function compareObligations(left: DebtObligation, right: DebtObligation) {
  return left.postingDate.localeCompare(right.postingDate) || left.sourceDocument.localeCompare(right.sourceDocument);
}

function asUtcDay(value: string) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
