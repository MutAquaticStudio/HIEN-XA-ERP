import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import {
  createInventoryLedgerCutoverPlan,
  type CreateInventoryLedgerCutoverPlanInput
} from "../src/server/infrastructure/operations-inventory-ledger-cutover-plan";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CASH_ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";

function createInput(): CreateInventoryLedgerCutoverPlanInput {
  const state = createInitialOperationsState();
  const sourceDocuments = new Set([
    ...state.customerLedgerEntries.map((entry) => entry.sourceDocument),
    ...state.supplierLedgerEntries.map((entry) => entry.sourceDocument),
    ...state.employeeLedgerEntries.map((entry) => entry.sourceDocument),
    ...state.inventoryMovements.map((entry) => entry.sourceDocument),
    ...state.cashTransactions.map((entry) => entry.sourceDocument),
    ...state.workOrders.map((entry) => entry.sourceDocument)
  ]);
  return {
    namespace: "operations",
    sourceRevision: 88,
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
      paymentMetadata: Object.fromEntries([
        ...state.customerPayments.map((payment) => [`customer_payment:${payment.id}`, paymentOverride()]),
        ...state.supplierPayments.map((payment) => [`supplier_payment:${payment.id}`, paymentOverride()]),
        ...state.employeePayments.map((payment) => [`employee_payment:${payment.id}`, paymentOverride()]),
        ...state.employeeAdvances.map((advance) => [`employee_advance:${advance.id}`, paymentOverride()])
      ]),
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

describe("inventory and ledger normalized cutover plan", () => {
  it("creates deterministic immutable postings, derived cost states, and debit-credit ledgers", () => {
    const state = createInitialOperationsState();
    state.customerLedgerEntries.push({
      id: "cutover-test-receivable",
      customerId: state.customers[0].id,
      sourceDocument: state.salesOrders[0].documentNo,
      direction: "debit",
      amount: 123456,
      entryType: "sale_delivery",
      postingDate: "2026-07-28"
    });
    const input = createInput();
    input.mappingOverrides.sourceDocuments![state.salesOrders[0].documentNo] = {
      entityType: "sales_order",
      targetLegacyId: state.salesOrders[0].id
    };
    const first = createInventoryLedgerCutoverPlan(state, input);
    const second = createInventoryLedgerCutoverPlan(structuredClone(state), input);

    expect(first.planChecksum).toBe(second.planChecksum);
    expect(first.isComplete).toBe(false);
    expect(first.batches.map((batch) => batch.name)).toEqual([
      "inventory.postings",
      "inventory.movement-lines",
      "inventory.cost-states",
      "inventory.posting-reversals",
      "receivables.entries",
      "payables.entries",
      "workforce.ledger-entries",
      "receivables.reversals",
      "payables.reversals",
      "workforce.ledger-reversals"
    ]);
    expect(first.batches.find((batch) => batch.name === "inventory.postings")?.rows[0].values.document_no).toMatch(/^CUTOVER-INV-/);
    expect(first.batches.find((batch) => batch.name === "inventory.cost-states")?.rows[0].values).toMatchObject({
      quantity_on_hand: 10000,
      moving_average_cost: 950
    });
    const receivable = first.batches.find((batch) => batch.name === "receivables.entries")?.rows.find((row) => row.legacyId === "cutover-test-receivable");
    expect(receivable?.values).toMatchObject({
      entry_type: "receivable",
      credit: 0,
      posted_at: "2026-07-28T00:00:00.000Z"
    });
  });

  it("requires a typed source mapping for inventory movement provenance", () => {
    const state = createInitialOperationsState();
    const input = createInput();
    delete input.mappingOverrides.sourceDocuments![state.inventoryMovements[0].sourceDocument];

    expect(() => createInventoryLedgerCutoverPlan(state, input)).toThrow("CUTOVER_MAPPING_BLOCKED");
  });

  it("does not allow a movement sequence to manufacture negative stock", () => {
    const state = createInitialOperationsState();
    state.inventoryMovements[0].quantity = -1;

    expect(() => createInventoryLedgerCutoverPlan(state, createInput())).toThrow("CUTOVER_STATE_BLOCKED");
  });
});
