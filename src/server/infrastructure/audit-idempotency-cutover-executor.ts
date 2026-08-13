import type { CutoverSqlClient } from "./catalog-order-cutover-executor";
import {
  calculateAuditIdempotencyCutoverPlanChecksum,
  type AuditIdempotencyCutoverBatch,
  type AuditIdempotencyCutoverPlan,
} from "./operations-audit-idempotency-cutover-plan";

const TABLE_COLUMNS = {
  audit_logs: [
    "id",
    "actor_id",
    "action",
    "entity_type",
    "entity_id",
    "before_data",
    "after_data",
    "reason",
    "correlation_id",
    "created_at",
    "actor_name",
    "actor_role",
    "permission",
    "target_legacy_id",
    "summary",
    "occurred_at",
    "legacy_metadata",
  ],
  idempotency_keys: [
    "key",
    "operation",
    "request_hash",
    "response_body",
    "status",
    "created_at",
    "expires_at",
    "summary",
    "legacy_metadata",
  ],
} as const;

export interface ExecuteAuditIdempotencyCutoverPlanInput {
  mode: "staging_rehearsal";
  expectedSourceChecksum: string;
  expectedPlanChecksum: string;
  batchSize?: number;
}

export class AuditIdempotencyCutoverExecutionError extends Error {
  constructor(
    readonly code:
      | "CUTOVER_EXECUTION_MODE_INVALID"
      | "CUTOVER_PLAN_CHECKSUM_INVALID"
      | "CUTOVER_PLAN_COLUMNS_INVALID"
      | "CUTOVER_PLAN_SCOPE_INVALID"
      | "CUTOVER_SOURCE_CHECKSUM_INVALID",
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "AuditIdempotencyCutoverExecutionError";
  }
}

export async function executeAuditIdempotencyCutoverPlan(
  sql: CutoverSqlClient,
  plan: AuditIdempotencyCutoverPlan,
  input: ExecuteAuditIdempotencyCutoverPlanInput,
): Promise<{ batchCount: number; statementCount: number; rowCount: number }> {
  if (input.mode !== "staging_rehearsal") {
    throw new AuditIdempotencyCutoverExecutionError(
      "CUTOVER_EXECUTION_MODE_INVALID",
      "Audit/idempotency cutover can only run in staging_rehearsal mode.",
    );
  }
  if (plan.scope !== "audit_and_idempotency" || plan.isComplete !== false) {
    throw new AuditIdempotencyCutoverExecutionError(
      "CUTOVER_PLAN_SCOPE_INVALID",
      "The executor only accepts the explicit partial audit/idempotency plan.",
    );
  }
  if (plan.sourceChecksum !== input.expectedSourceChecksum) {
    throw new AuditIdempotencyCutoverExecutionError(
      "CUTOVER_SOURCE_CHECKSUM_INVALID",
      "The source snapshot checksum does not match the approved rehearsal input.",
    );
  }

  const calculatedChecksum = calculateAuditIdempotencyCutoverPlanChecksum(plan);
  if (
    calculatedChecksum !== plan.planChecksum ||
    plan.planChecksum !== input.expectedPlanChecksum
  ) {
    throw new AuditIdempotencyCutoverExecutionError(
      "CUTOVER_PLAN_CHECKSUM_INVALID",
      "The plan checksum does not match the immutable reviewed plan.",
    );
  }

  const batchSize = input.batchSize ?? 200;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new AuditIdempotencyCutoverExecutionError(
      "CUTOVER_PLAN_SCOPE_INVALID",
      "batchSize must be a positive integer.",
    );
  }

  let statementCount = 0;
  let rowCount = 0;
  let began = false;

  try {
    await sql.query("BEGIN");
    statementCount += 1;
    began = true;

    for (const batch of plan.batches) {
      for (const rows of chunks(batch.rows, batchSize)) {
        const statement = buildInsertStatement(batch, rows);
        await sql.query(statement.sql, statement.values);
        statementCount += 1;
        rowCount += rows.length;
      }
    }

    await sql.query("COMMIT");
    statementCount += 1;
    return {
      batchCount: plan.batches.length,
      statementCount,
      rowCount,
    };
  } catch (error) {
    if (began) {
      try {
        await sql.query("ROLLBACK");
      } catch {
        // Preserve the original failure. A failed rollback still leaves this
        // rehearsal blocked for operator investigation.
      }
    }
    throw error;
  }
}

function buildInsertStatement(
  batch: AuditIdempotencyCutoverBatch,
  rows: readonly AuditIdempotencyCutoverBatch["rows"][number][],
): { sql: string; values: unknown[] } {
  const allowedColumns = TABLE_COLUMNS[batch.table];
  const columns = allowedColumns.filter((column) =>
    rows.every((row) => Object.prototype.hasOwnProperty.call(row.values, column)),
  );

  if (columns.length !== allowedColumns.length) {
    throw new AuditIdempotencyCutoverExecutionError(
      "CUTOVER_PLAN_COLUMNS_INVALID",
      `Batch ${batch.name} is missing a required allowlisted column.`,
    );
  }
  for (const row of rows) {
    for (const column of Object.keys(row.values)) {
      if (!allowedColumns.includes(column as never)) {
        throw new AuditIdempotencyCutoverExecutionError(
          "CUTOVER_PLAN_COLUMNS_INVALID",
          `Batch ${batch.name} includes a non-allowlisted column ${column}.`,
        );
      }
    }
  }

  const values = rows.flatMap((row) =>
    columns.map((column) => toSqlValue(row.values[column])),
  );
  const placeholders = rows
    .map((_, rowIndex) => {
      const offset = rowIndex * columns.length;
      return `(${columns.map((_, columnIndex) => `$${offset + columnIndex + 1}`).join(", ")})`;
    })
    .join(", ");

  return {
    sql: `INSERT INTO public.${batch.table} (${columns.join(", ")}) VALUES ${placeholders}`,
    values,
  };
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function toSqlValue(value: unknown): unknown {
  return value !== null && typeof value === "object" ? JSON.stringify(value) : value;
}
