import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import {
  createPaymentCashCutoverPlan,
  type CreatePaymentCashCutoverPlanInput
} from "../src/server/infrastructure/operations-payment-cash-cutover-plan";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CASH_ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";

function createStateWithCashDocuments() {
  const state = createInitialOperationsState();
  const sourceDocument = state.salesOrders[0].documentNo;
  state.customerPayments.push({
    id: "cutover-customer-payment",
    documentNo: "PT-CUTOVER-001",
    customerId: state.customers[0].id,
    amount: 120000,
    status: "draft",
    allocations: []
  });
  state.supplierPayments.push({
    id: "cutover-supplier-payment",
    documentNo: "PC-CUTOVER-001",
    supplierId: state.suppliers[0].id,
    amount: 80000,
    status: "draft",
    allocations: []
  });
  state.employeePayments.push({
    id: "cutover-employee-payment",
    documentNo: "PCT-CUTOVER-001",
    employeeId: state.employees[0].id,
    amount: 50000,
    status: "draft"
  });
  state.employeeAdvances.push({
    id: "cutover-employee-advance",
    documentNo: "TU-CUTOVER-001",
    employeeId: state.employees[0].id,
    purpose: "Tam ung giao hang",
    amount: 30000,
    status: "draft"
  });
  state.cashVouchers.push({
    id: "cutover-cash-voucher",
    documentNo: "PCQ-CUTOVER-001",
    accountName: "Test bank account",
    direction: "out",
    category: "Van hanh",
    description: "Chi thu nghiem cutover",
    amount: 10000,
    status: "draft"
  });
  state.cashTransactions.push({
    id: "cutover-cash-transaction",
    accountName: "Test bank account",
    sourceDocument,
    direction: "in",
    amount: 120000,
    postedAt: "2026-07-28T01:00:00.000Z"
  });
  state.bankTransferProofs.push({
    id: "cutover-transfer-proof",
    documentNo: "UNC-CUTOVER-001",
    direction: "in",
    amount: 120000,
    counterpartyName: "Cong trinh Minh Anh",
    transactionReference: "TX-CUTOVER-001",
    transferredAt: "2026-07-28T01:00:00.000Z",
    attachments: [],
    archivedBy: "owner-1",
    archivedAt: "2026-07-28T01:05:00.000Z"
  });
  return state;
}

function createInput(state: ReturnType<typeof createStateWithCashDocuments>): CreatePaymentCashCutoverPlanInput {
  const sourceDocuments = new Set([
    ...state.customerLedgerEntries.map((entry) => entry.sourceDocument),
    ...state.supplierLedgerEntries.map((entry) => entry.sourceDocument),
    ...state.employeeLedgerEntries.map((entry) => entry.sourceDocument),
    ...state.inventoryMovements.map((entry) => entry.sourceDocument),
    ...state.cashTransactions.map((entry) => entry.sourceDocument),
    ...state.workOrders.map((entry) => entry.sourceDocument)
  ]);
  const paymentMetadata = Object.fromEntries([
    ...state.customerPayments.map((payment) => [`customer_payment:${payment.id}`, paymentOverride()]),
    ...state.supplierPayments.map((payment) => [`supplier_payment:${payment.id}`, paymentOverride()]),
    ...state.employeePayments.map((payment) => [`employee_payment:${payment.id}`, paymentOverride()]),
    ...state.employeeAdvances.map((advance) => [`employee_advance:${advance.id}`, paymentOverride()])
  ]);
  return {
    namespace: "operations",
    sourceRevision: 101,
    stateSchemaVersion: 1,
    generatedAt: "2026-07-28T00:00:00.000Z",
    mappingOverrides: {
      identityAliases: {
        ...Object.fromEntries(state.auditLogs.map((entry) => [entry.actorId, USER_ID])),
        "owner-1": USER_ID
      },
      sourceDocuments: Object.fromEntries([...sourceDocuments].map((sourceDocument) => [sourceDocument, {
        entityType: "sales_order" as const,
        targetLegacyId: state.salesOrders[0].id
      }])),
      cashAccounts: Object.fromEntries([...new Set([
        ...state.cashTransactions.map((entry) => entry.accountName),
        ...state.cashVouchers.map((entry) => entry.accountName)
      ])].map((accountName) => [accountName, CASH_ACCOUNT_ID])),
      paymentMetadata,
      cashVoucherMetadata: Object.fromEntries(state.cashVouchers.map((voucher) => [`cash_voucher:${voucher.id}`, {
        occurredAt: "2026-07-28T00:00:00.000Z",
        actorLegacyId: "owner-1"
      }]))
    }
  };
}

function paymentOverride() {
  return {
    targetCashAccountId: CASH_ACCOUNT_ID,
    method: "bank_transfer" as const,
    postedAt: "2026-07-28T00:00:00.000Z",
    actorLegacyId: "owner-1"
  };
}

describe("payment and cash normalized cutover plan", () => {
  it("keeps payment account, method, actor, timestamps, and proof metadata explicit", () => {
    const state = createStateWithCashDocuments();
    const input = createInput(state);
    const first = createPaymentCashCutoverPlan(state, input);
    const second = createPaymentCashCutoverPlan(structuredClone(state), input);

    expect(first.planChecksum).toBe(second.planChecksum);
    expect(first.requiredCashAccountIds).toEqual([CASH_ACCOUNT_ID]);
    expect(first.batches.map((batch) => batch.name)).toEqual([
      "cash.vouchers",
      "receivables.payments",
      "payables.payments",
      "workforce.employee-payments",
      "workforce.employee-advances",
      "receivables.payment-allocations",
      "payables.payment-allocations",
      "cash.transactions",
      "cash.transfer-proofs"
    ]);
    const payment = first.batches.find((batch) => batch.name === "receivables.payments")!.rows.find((row) => row.legacyId === "cutover-customer-payment");
    expect(payment?.values).toMatchObject({
      cash_account_id: CASH_ACCOUNT_ID,
      method: "bank_transfer",
      created_by: USER_ID,
      confirmed_by: null
    });
    const proof = first.batches.find((batch) => batch.name === "cash.transfer-proofs")!.rows.find((row) => row.legacyId === "cutover-transfer-proof");
    expect(proof?.values).toMatchObject({
      archived_by: USER_ID,
      transaction_reference: "TX-CUTOVER-001"
    });
  });

  it("does not manufacture a cash account when a runtime account mapping is absent", () => {
    const state = createStateWithCashDocuments();
    const input = createInput(state);
    delete input.mappingOverrides.cashAccounts!["Test bank account"];

    expect(() => createPaymentCashCutoverPlan(state, input)).toThrow("CUTOVER_MAPPING_BLOCKED");
  });
});
