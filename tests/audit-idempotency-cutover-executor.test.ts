import { describe, expect, it } from "vitest";

import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import {
  executeAuditIdempotencyCutoverPlan,
} from "../src/server/infrastructure/audit-idempotency-cutover-executor";
import {
  createAuditIdempotencyCutoverPlan,
} from "../src/server/infrastructure/operations-audit-idempotency-cutover-plan";

const OWNER_UUID = "11111111-1111-4111-8111-111111111111";

describe("executeAuditIdempotencyCutoverPlan", () => {
  it("runs approved audit and idempotency batches in one staging transaction without upsert", async () => {
    const plan = createPlan();
    const sql = new FakeSqlClient();

    const result = await executeAuditIdempotencyCutoverPlan(sql, plan, {
      mode: "staging_rehearsal",
      expectedSourceChecksum: plan.sourceChecksum,
      expectedPlanChecksum: plan.planChecksum,
    });

    expect(result).toEqual({ batchCount: 2, statementCount: 4, rowCount: 2 });
    expect(sql.calls.map((call) => call.sql)).toEqual([
      "BEGIN",
      expect.stringContaining("INSERT INTO public.audit_logs"),
      expect.stringContaining("INSERT INTO public.idempotency_keys"),
      "COMMIT",
    ]);
    expect(sql.calls.some((call) => call.sql.includes("ON CONFLICT"))).toBe(false);
  });

  it("blocks a changed source checksum before starting a transaction", async () => {
    const plan = createPlan();
    const sql = new FakeSqlClient();

    await expect(
      executeAuditIdempotencyCutoverPlan(sql, plan, {
        mode: "staging_rehearsal",
        expectedSourceChecksum: "changed-source",
        expectedPlanChecksum: plan.planChecksum,
      }),
    ).rejects.toThrow("CUTOVER_SOURCE_CHECKSUM_INVALID");
    expect(sql.calls).toEqual([]);
  });

  it("rolls back when the idempotency insert fails", async () => {
    const plan = createPlan();
    const sql = new FakeSqlClient((statement) =>
      statement.includes("INSERT INTO public.idempotency_keys"),
    );

    await expect(
      executeAuditIdempotencyCutoverPlan(sql, plan, {
        mode: "staging_rehearsal",
        expectedSourceChecksum: plan.sourceChecksum,
        expectedPlanChecksum: plan.planChecksum,
      }),
    ).rejects.toThrow("planned SQL failure");
    expect(sql.calls.at(-1)?.sql).toBe("ROLLBACK");
  });

  it("blocks a tampered plan before it can issue SQL", async () => {
    const plan = createPlan();
    const sql = new FakeSqlClient();
    const tampered = {
      ...plan,
      batches: plan.batches.map((batch) =>
        batch.name === "audit_logs"
          ? {
              ...batch,
              rows: [
                {
                  ...batch.rows[0]!,
                  values: {
                    ...batch.rows[0]!.values,
                    summary: "Tampered after review.",
                  },
                },
              ],
            }
          : batch,
      ),
    };

    await expect(
      executeAuditIdempotencyCutoverPlan(sql, tampered, {
        mode: "staging_rehearsal",
        expectedSourceChecksum: plan.sourceChecksum,
        expectedPlanChecksum: plan.planChecksum,
      }),
    ).rejects.toThrow("CUTOVER_PLAN_CHECKSUM_INVALID");
    expect(sql.calls).toEqual([]);
  });
});

function createPlan() {
  const state = createInitialOperationsState();
  state.auditLogs = [
    {
      id: "audit-legacy-1",
      actorId: "legacy-owner",
      actorName: "Chu cua hang",
      action: "sales_order_confirmed",
      entityType: "sales_order",
      entityId: "SO-LEGACY-1",
      occurredAt: "2026-07-27T10:00:00.000Z",
      summary: "Confirmed legacy sales order.",
    },
  ];
  state.processedOperations = [
    {
      idempotencyKey: "legacy-key-1",
      operation: "createSalesOrder" as never,
      summary: "Legacy sales order command.",
    },
  ];
  return createAuditIdempotencyCutoverPlan(state, {
    namespace: "operations",
    sourceRevision: 101,
    stateSchemaVersion: 1,
    generatedAt: "2026-07-28T00:00:00.000Z",
    legacyIdempotencyExpiresAt: "2026-08-04T00:00:00.000Z",
    mappingOverrides: {
      identityAliases: {
        "legacy-owner": OWNER_UUID,
      },
    },
  });
}

class FakeSqlClient {
  readonly calls: Array<{ sql: string; values?: unknown[] }> = [];

  constructor(private readonly failWhen?: (statement: string) => boolean) {}

  async query(sql: string, values?: unknown[]): Promise<void> {
    this.calls.push({ sql, values });
    if (this.failWhen?.(sql)) {
      throw new Error("planned SQL failure");
    }
  }
}
