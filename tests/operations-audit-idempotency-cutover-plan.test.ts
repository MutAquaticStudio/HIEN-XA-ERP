import { describe, expect, it } from "vitest";

import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import {
  calculateAuditIdempotencyCutoverPlanChecksum,
  createAuditIdempotencyCutoverPlan,
  type CreateAuditIdempotencyCutoverPlanInput,
} from "../src/server/infrastructure/operations-audit-idempotency-cutover-plan";

const OWNER_UUID = "11111111-1111-4111-8111-111111111111";

describe("createAuditIdempotencyCutoverPlan", () => {
  it("preserves append-only audit provenance and creates deterministic legacy idempotency markers", () => {
    const state = createState();
    const plan = createAuditIdempotencyCutoverPlan(state, createInput());
    const auditBatch = plan.batches.find((batch) => batch.name === "audit_logs");
    const idempotencyBatch = plan.batches.find(
      (batch) => batch.name === "idempotency_keys",
    );

    expect(auditBatch?.rows).toHaveLength(1);
    expect(auditBatch?.rows[0]?.values).toMatchObject({
      actor_id: OWNER_UUID,
      entity_id: null,
      target_legacy_id: "SO-LEGACY-1",
      correlation_id: "correlation-1",
      occurred_at: "2026-07-27T10:00:00.000Z",
      legacy_metadata: {
        legacyId: "audit-legacy-1",
        entityIdResolution: "deferred",
      },
    });
    expect(idempotencyBatch?.rows[0]?.values).toMatchObject({
      key: "legacy-key-1",
      status: "completed",
      response_body: {
        kind: "legacy_migrated_operation",
      },
      legacy_metadata: {
        requestResponseRecovered: false,
      },
    });
    expect(idempotencyBatch?.rows[0]?.values.request_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.planChecksum).toBe(calculateAuditIdempotencyCutoverPlanChecksum(plan));
  });

  it("fails closed when an audit actor has no verified identity alias", () => {
    const state = createState();
    state.auditLogs[0]!.actorId = "unmapped-user";

    expect(() => createAuditIdempotencyCutoverPlan(state, createInput())).toThrow(
      "CUTOVER_IDENTITY_ALIAS_REQUIRED",
    );
  });

  it("rejects duplicate legacy idempotency keys instead of hiding retry ambiguity", () => {
    const state = createState();
    state.processedOperations.push({
      idempotencyKey: "legacy-key-1",
      operation: "createSalesOrder" as never,
      summary: "Duplicate legacy retry marker.",
    });

    expect(() => createAuditIdempotencyCutoverPlan(state, createInput())).toThrow(
      "CUTOVER_SOURCE_DUPLICATE_IDEMPOTENCY_KEY",
    );
  });

  it("requires an explicit future retention boundary for legacy retry keys", () => {
    expect(() =>
      createAuditIdempotencyCutoverPlan(createState(), {
        ...createInput(),
        legacyIdempotencyExpiresAt: "2026-07-28T00:00:00.000Z",
      }),
    ).toThrow("CUTOVER_IDEMPOTENCY_EXPIRY_INVALID");
  });
});

function createState() {
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
      correlationId: "correlation-1",
      before: { status: "draft" },
      after: { status: "confirmed" },
    },
  ];
  state.processedOperations = [
    {
      idempotencyKey: "legacy-key-1",
      operation: "createSalesOrder" as never,
      summary: "Legacy sales order command.",
    },
  ];
  return state;
}

function createInput(): CreateAuditIdempotencyCutoverPlanInput {
  return {
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
  };
}
