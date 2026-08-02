import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import {
  executeCatalogOrderCutoverPlan,
  type CutoverSqlClient
} from "../src/server/infrastructure/catalog-order-cutover-executor";
import {
  calculateCatalogOrderCutoverPlanChecksum,
  createCatalogOrderCutoverPlan,
  type CreateCatalogOrderCutoverPlanInput
} from "../src/server/infrastructure/operations-catalog-order-cutover-plan";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CASH_ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";

class FakeSqlClient implements CutoverSqlClient {
  readonly statements: Array<{ sql: string; values: unknown[] }> = [];

  constructor(private readonly failOnStatement?: number) {}

  async query(sql: string, values: unknown[] = []) {
    this.statements.push({ sql, values });
    if (this.failOnStatement === this.statements.length) {
      throw new Error("simulated database write failure");
    }
  }
}

function createPlan() {
  const state = createInitialOperationsState();
  const sourceDocuments = new Set([
    ...state.customerLedgerEntries.map((entry) => entry.sourceDocument),
    ...state.supplierLedgerEntries.map((entry) => entry.sourceDocument),
    ...state.employeeLedgerEntries.map((entry) => entry.sourceDocument),
    ...state.inventoryMovements.map((entry) => entry.sourceDocument),
    ...state.cashTransactions.map((entry) => entry.sourceDocument),
    ...state.workOrders.map((entry) => entry.sourceDocument)
  ]);
  const input: CreateCatalogOrderCutoverPlanInput = {
    namespace: "operations",
    sourceRevision: 99,
    stateSchemaVersion: 1,
    cutoverDate: "2026-07-28",
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
  return createCatalogOrderCutoverPlan(state, input);
}

function paymentOverride() {
  return {
    targetCashAccountId: CASH_ACCOUNT_ID,
    method: "bank_transfer" as const,
    postedAt: "2026-07-28T00:00:00.000Z",
    actorLegacyId: "owner-1"
  };
}

describe("catalog/order cutover staging executor", () => {
  it("executes approved plan batches atomically without conflict-hiding upserts", async () => {
    const plan = createPlan();
    const sql = new FakeSqlClient();

    const result = await executeCatalogOrderCutoverPlan(sql, plan, {
      mode: "staging_rehearsal",
      expectedSourceChecksum: plan.sourceChecksum,
      expectedPlanChecksum: plan.planChecksum
    });

    expect(sql.statements[0].sql).toBe("begin");
    expect(sql.statements.at(-1)?.sql).toBe("commit");
    expect(sql.statements.some((statement) => statement.sql.includes("on conflict"))).toBe(false);
    expect(sql.statements.some((statement) => statement.sql.includes("purchase_order_item_id"))).toBe(true);
    expect(result.rowCount).toBe(plan.batches.reduce((total, batch) => total + batch.rows.length, 0));
  });

  it("refuses a changed snapshot or plan before sending a database statement", async () => {
    const plan = createPlan();
    const sql = new FakeSqlClient();

    await expect(executeCatalogOrderCutoverPlan(sql, plan, {
      mode: "staging_rehearsal",
      expectedSourceChecksum: "0".repeat(64),
      expectedPlanChecksum: plan.planChecksum
    })).rejects.toThrow("CUTOVER_EXECUTION_SOURCE_CHECKSUM_MISMATCH");
    expect(sql.statements).toEqual([]);
  });

  it("rolls back the whole rehearsal when a target write fails", async () => {
    const plan = createPlan();
    const sql = new FakeSqlClient(3);

    await expect(executeCatalogOrderCutoverPlan(sql, plan, {
      mode: "staging_rehearsal",
      expectedSourceChecksum: plan.sourceChecksum,
      expectedPlanChecksum: plan.planChecksum,
      batchSize: 1
    })).rejects.toThrow("simulated database write failure");
    expect(sql.statements.at(-1)?.sql).toBe("rollback");
  });

  it("detects an in-memory plan mutation before it begins a database transaction", async () => {
    const plan = createPlan();
    plan.batches[0].table = 'customers; drop table public.customers; --';
    const sql = new FakeSqlClient();

    await expect(executeCatalogOrderCutoverPlan(sql, plan, {
      mode: "staging_rehearsal",
      expectedSourceChecksum: plan.sourceChecksum,
      expectedPlanChecksum: plan.planChecksum
    })).rejects.toThrow("CUTOVER_EXECUTION_PLAN_INTEGRITY_MISMATCH");
    expect(sql.statements).toEqual([]);
  });

  it("blocks table injection even when a caller supplies a matching recalculated checksum", async () => {
    const plan = createPlan();
    plan.batches[0].table = 'customers; drop table public.customers; --';
    plan.planChecksum = calculateCatalogOrderCutoverPlanChecksum(plan);
    const sql = new FakeSqlClient();

    await expect(executeCatalogOrderCutoverPlan(sql, plan, {
      mode: "staging_rehearsal",
      expectedSourceChecksum: plan.sourceChecksum,
      expectedPlanChecksum: plan.planChecksum
    })).rejects.toThrow("CUTOVER_EXECUTION_TABLE_BLOCKED");
    expect(sql.statements).toEqual([]);
  });

  it("executes each backfill update separately when an order has several source links", async () => {
    const plan = createPlan();
    const updateBatch = plan.batches.find((batch) => batch.name === "sales.items.purchase-links")!;
    updateBatch.rows.push({
      id: "33333333-3333-4333-8333-333333333333",
      legacyId: "first-sales-link",
      values: {
        purchase_order_item_id: "44444444-4444-4444-8444-444444444444"
      }
    }, {
      id: "66666666-6666-4666-8666-666666666666",
      legacyId: "second-sales-link",
      values: {
        purchase_order_item_id: "55555555-5555-4555-8555-555555555555"
      }
    });
    plan.planChecksum = calculateCatalogOrderCutoverPlanChecksum(plan);
    const sql = new FakeSqlClient();

    await executeCatalogOrderCutoverPlan(sql, plan, {
      mode: "staging_rehearsal",
      expectedSourceChecksum: plan.sourceChecksum,
      expectedPlanChecksum: plan.planChecksum
    });

    const updates = sql.statements.filter((statement) => statement.sql.startsWith("update public.\"sales_order_items\""));
    expect(updates).toHaveLength(2);
  });
});
