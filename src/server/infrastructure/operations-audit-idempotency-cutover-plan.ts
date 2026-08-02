import { createHash } from "node:crypto";

import type { OperationsState } from "../../modules/operations/types";
import {
  createDeterministicLegacyUuid,
  inspectOperationsStateForCutover,
} from "./operations-cutover";
import type { CutoverMappingOverrides } from "./operations-cutover-overrides";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AuditIdempotencyCutoverBatchName = "audit_logs" | "idempotency_keys";

export interface AuditIdempotencyCutoverRow {
  id: string;
  legacyId: string;
  values: Record<string, unknown>;
}

export interface AuditIdempotencyCutoverBatch {
  name: AuditIdempotencyCutoverBatchName;
  table: "audit_logs" | "idempotency_keys";
  operation: "insert";
  rows: readonly AuditIdempotencyCutoverRow[];
}

export interface AuditIdempotencyCutoverPlan {
  scope: "audit_and_idempotency";
  isComplete: false;
  sourceChecksum: string;
  sourceRevision: number;
  stateSchemaVersion: number;
  generatedAt: string;
  batches: readonly AuditIdempotencyCutoverBatch[];
  reconciliation: {
    auditLogCount: number;
    auditCorrelationIds: readonly string[];
    idempotencyKeyCount: number;
    idempotencyKeys: readonly string[];
  };
  deferredCollections: readonly string[];
  planChecksum: string;
}

export interface CreateAuditIdempotencyCutoverPlanInput {
  namespace: string;
  sourceRevision: number;
  stateSchemaVersion: number;
  generatedAt: string;
  legacyIdempotencyExpiresAt: string;
  mappingOverrides?: CutoverMappingOverrides;
}

export class AuditIdempotencyCutoverPlanError extends Error {
  constructor(
    readonly code:
      | "CUTOVER_IDEMPOTENCY_EXPIRY_INVALID"
      | "CUTOVER_IDENTITY_ALIAS_INVALID"
      | "CUTOVER_IDENTITY_ALIAS_REQUIRED"
      | "CUTOVER_SOURCE_DUPLICATE_AUDIT_ID"
      | "CUTOVER_SOURCE_DUPLICATE_IDEMPOTENCY_KEY"
      | "CUTOVER_TIMESTAMP_INVALID",
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "AuditIdempotencyCutoverPlanError";
  }
}

export function createAuditIdempotencyCutoverPlan(
  state: OperationsState,
  input: CreateAuditIdempotencyCutoverPlanInput,
): AuditIdempotencyCutoverPlan {
  assertTimestamp(input.generatedAt, "generatedAt");
  assertTimestamp(input.legacyIdempotencyExpiresAt, "legacyIdempotencyExpiresAt");

  if (
    Date.parse(input.legacyIdempotencyExpiresAt) <= Date.parse(input.generatedAt)
  ) {
    throw new AuditIdempotencyCutoverPlanError(
      "CUTOVER_IDEMPOTENCY_EXPIRY_INVALID",
      "Legacy idempotency expiry must be after the imported snapshot time.",
    );
  }

  // Keep this slice connected to the common snapshot contract. It validates the
  // source revision before this planner derives any immutable legacy records.
  void inspectOperationsStateForCutover(state, {
    namespace: input.namespace,
    revision: input.sourceRevision,
    stateSchemaVersion: input.stateSchemaVersion,
    now: input.generatedAt,
  });

  const sourceChecksum = calculateAuditIdempotencySourceChecksum(state, input);
  const aliases = input.mappingOverrides?.identityAliases ?? {};
  const seenAuditIds = new Set<string>();
  const seenIdempotencyKeys = new Set<string>();

  const auditRows = state.auditLogs.map((audit) => {
    if (seenAuditIds.has(audit.id)) {
      throw new AuditIdempotencyCutoverPlanError(
        "CUTOVER_SOURCE_DUPLICATE_AUDIT_ID",
        `Audit log ${audit.id} appears more than once in the runtime snapshot.`,
      );
    }
    seenAuditIds.add(audit.id);

    assertTimestamp(audit.occurredAt, `auditLogs.${audit.id}.occurredAt`);
    const actorId = aliases[audit.actorId];
    if (!actorId) {
      throw new AuditIdempotencyCutoverPlanError(
        "CUTOVER_IDENTITY_ALIAS_REQUIRED",
        `Audit log ${audit.id} requires an identity alias for ${audit.actorId}.`,
      );
    }
    if (!UUID_PATTERN.test(actorId)) {
      throw new AuditIdempotencyCutoverPlanError(
        "CUTOVER_IDENTITY_ALIAS_INVALID",
        `Audit log ${audit.id} has an invalid UUID alias for ${audit.actorId}.`,
      );
    }

    return row(
      createDeterministicLegacyUuid(input.namespace, "audit_log", audit.id),
      audit.id,
      {
        id: createDeterministicLegacyUuid(input.namespace, "audit_log", audit.id),
        actor_id: actorId,
        action: audit.action,
        entity_type: audit.entityType,
        // Runtime entity ids are strings and may not be UUIDs. Preserve them for
        // reconciliation instead of casting them into a potentially wrong FK.
        entity_id: null,
        before_data: audit.before ?? null,
        after_data: audit.after ?? null,
        reason: audit.reason ?? null,
        correlation_id: audit.correlationId ?? null,
        created_at: audit.occurredAt,
        actor_name: audit.actorName,
        actor_role: audit.actorRole ?? null,
        permission: audit.permission ?? null,
        target_legacy_id: audit.targetId ?? audit.entityId,
        summary: audit.summary,
        occurred_at: audit.occurredAt,
        legacy_metadata: {
          legacyId: audit.id,
          legacyActorId: audit.actorId,
          legacyEntityType: audit.entityType,
          legacyEntityId: audit.entityId,
          entityIdResolution: "deferred",
          sourceNamespace: input.namespace,
        },
      },
    );
  });

  const idempotencyRows = state.processedOperations.map((operation) => {
    if (seenIdempotencyKeys.has(operation.idempotencyKey)) {
      throw new AuditIdempotencyCutoverPlanError(
        "CUTOVER_SOURCE_DUPLICATE_IDEMPOTENCY_KEY",
        `Idempotency key ${operation.idempotencyKey} appears more than once in the runtime snapshot.`,
      );
    }
    seenIdempotencyKeys.add(operation.idempotencyKey);

    return row(operation.idempotencyKey, operation.idempotencyKey, {
      key: operation.idempotencyKey,
      operation: operation.operation,
      // The runtime source does not retain historical request/response payloads.
      // This is a deterministic migration marker, never a reconstructed request hash.
      request_hash: legacyIdempotencyRequestHash(
        input.namespace,
        operation.idempotencyKey,
        operation.operation,
      ),
      response_body: {
        kind: "legacy_migrated_operation",
        operation: operation.operation,
        summary: operation.summary,
      },
      status: "completed",
      created_at: input.generatedAt,
      expires_at: input.legacyIdempotencyExpiresAt,
      summary: operation.summary,
      legacy_metadata: {
        sourceNamespace: input.namespace,
        legacyKey: operation.idempotencyKey,
        importedAs: "legacy_idempotency_marker",
        requestResponseRecovered: false,
      },
    });
  });

  const unsignedPlan = {
    scope: "audit_and_idempotency" as const,
    isComplete: false as const,
    sourceChecksum,
    sourceRevision: input.sourceRevision,
    stateSchemaVersion: input.stateSchemaVersion,
    generatedAt: input.generatedAt,
    batches: [
      batch("audit_logs", "audit_logs", auditRows),
      batch("idempotency_keys", "idempotency_keys", idempotencyRows),
    ],
    reconciliation: {
      auditLogCount: auditRows.length,
      auditCorrelationIds: [...new Set(
        state.auditLogs
          .map((audit) => audit.correlationId)
          .filter((correlationId): correlationId is string => Boolean(correlationId)),
      )].sort(),
      idempotencyKeyCount: idempotencyRows.length,
      idempotencyKeys: [...seenIdempotencyKeys].sort(),
    },
    deferredCollections: [
      "approval_requests",
      "attachments",
      "chat",
      "delivery_tracking",
      "push_notifications",
      "workforce",
    ],
  };

  return {
    ...unsignedPlan,
    planChecksum: calculateAuditIdempotencyCutoverPlanChecksum(unsignedPlan),
  };
}

export function calculateAuditIdempotencyCutoverPlanChecksum(
  plan: Omit<AuditIdempotencyCutoverPlan, "planChecksum"> | AuditIdempotencyCutoverPlan,
): string {
  const unsignedPlan = {
    ...plan,
  } as Partial<AuditIdempotencyCutoverPlan>;
  delete unsignedPlan.planChecksum;
  return sha256(stableJson(unsignedPlan));
}

export function calculateAuditIdempotencySourceChecksum(
  state: Pick<OperationsState, "auditLogs" | "processedOperations">,
  input: Pick<
    CreateAuditIdempotencyCutoverPlanInput,
    "namespace" | "sourceRevision" | "stateSchemaVersion"
  >,
): string {
  return sha256(
    stableJson({
      namespace: input.namespace,
      sourceRevision: input.sourceRevision,
      stateSchemaVersion: input.stateSchemaVersion,
      auditLogs: [...state.auditLogs].sort((left, right) => left.id.localeCompare(right.id)),
      processedOperations: [...state.processedOperations].sort((left, right) =>
        left.idempotencyKey.localeCompare(right.idempotencyKey),
      ),
    }),
  );
}

export function legacyIdempotencyRequestHash(
  namespace: string,
  key: string,
  operation: string,
): string {
  return sha256(`legacy-idempotency-v1:${namespace}:${key}:${operation}`);
}

function assertTimestamp(value: string, path: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new AuditIdempotencyCutoverPlanError(
      "CUTOVER_TIMESTAMP_INVALID",
      `${path} must be a valid ISO timestamp.`,
    );
  }
}

function batch(
  name: AuditIdempotencyCutoverBatchName,
  table: AuditIdempotencyCutoverBatch["table"],
  rows: AuditIdempotencyCutoverRow[],
): AuditIdempotencyCutoverBatch {
  return {
    name,
    table,
    operation: "insert",
    rows: [...rows].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function row(
  id: string,
  legacyId: string,
  values: Record<string, unknown>,
): AuditIdempotencyCutoverRow {
  return { id, legacyId, values };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === undefined || value === null) {
    return "null";
  }
  if (typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}
