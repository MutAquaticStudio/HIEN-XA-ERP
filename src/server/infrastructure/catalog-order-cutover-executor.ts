import type {
  CatalogOrderCutoverBatch,
  CatalogOrderCutoverPlan,
  CatalogOrderCutoverRow
} from "./operations-catalog-order-cutover-plan";
import { calculateCatalogOrderCutoverPlanChecksum } from "./operations-catalog-order-cutover-plan";

export type CutoverSqlClient = {
  query(sql: string, values?: unknown[]): Promise<void>;
};

export type ExecuteCatalogOrderCutoverPlanInput = {
  mode: "staging_rehearsal";
  expectedSourceChecksum: string;
  expectedPlanChecksum: string;
  batchSize?: number;
};

export type CatalogOrderCutoverExecution = {
  batchCount: number;
  statementCount: number;
  rowCount: number;
};

const MAXIMUM_BATCH_SIZE = 250;

const TABLE_COLUMNS: Record<string, readonly string[]> = {
  customers: ["code", "display_name", "normalized_name", "phone", "credit_limit", "payment_term_days", "status", "legacy_runtime_id"],
  suppliers: ["code", "display_name", "normalized_name", "phone", "payment_term_days", "status", "legacy_runtime_id"],
  employees: ["auth_user_id", "code", "display_name", "normalized_name", "role_type", "status", "legacy_runtime_id"],
  units: ["code", "name", "legacy_runtime_id"],
  products: ["code", "name", "normalized_name", "category_id", "status", "legacy_runtime_id"],
  product_units: ["product_id", "unit_id", "conversion_factor", "is_base", "status", "legacy_runtime_id"],
  price_rules: ["product_unit_id", "unit_price", "tax_rate", "effective_from", "effective_to", "status", "legacy_runtime_id"],
  warehouses: ["code", "name", "status", "legacy_runtime_id"],
  vehicles: ["code", "plate_number", "capacity_tons", "status", "legacy_runtime_id"],
  sales_orders: ["document_no", "customer_id", "order_date", "status", "currency", "net_total", "tax_total", "gross_total", "version", "delivery_address", "customer_note", "payment_method", "legacy_runtime_id"],
  sales_order_items: ["sales_order_id", "product_unit_id", "quantity", "delivered_quantity", "unit_price", "discount_amount", "tax_rate", "net_amount", "tax_amount", "gross_amount", "pricing_snapshot", "source_type", "warehouse_id", "purchase_order_item_id", "legacy_runtime_id"],
  purchase_orders: ["document_no", "supplier_id", "order_date", "status", "version", "legacy_runtime_id"],
  purchase_order_items: ["purchase_order_id", "product_unit_id", "ordered_quantity", "received_quantity", "unit_cost", "tax_rate", "pricing_snapshot", "legacy_runtime_id"],
  purchase_destinations: ["purchase_order_item_id", "destination_type", "warehouse_id", "customer_id", "sales_order_item_id", "quantity", "legacy_runtime_id"],
  delivery_jobs: ["document_no", "sales_order_id", "vehicle_id", "driver_id", "planned_date", "status", "version", "recipient_name", "evidence_reference", "failure_reason", "confirmed_at", "legacy_runtime_id"],
  delivery_assignments: ["delivery_job_id", "employee_id", "assignment_role", "legacy_runtime_id"],
  delivery_items: ["delivery_job_id", "sales_order_item_id", "planned_quantity", "delivered_quantity", "legacy_runtime_id"]
};

export async function executeCatalogOrderCutoverPlan(
  sql: CutoverSqlClient,
  plan: CatalogOrderCutoverPlan,
  input: ExecuteCatalogOrderCutoverPlanInput
): Promise<CatalogOrderCutoverExecution> {
  assertExecutionInput(plan, input);
  validatePlan(plan);
  const batchSize = normalizeBatchSize(input.batchSize);
  let statementCount = 0;
  let rowCount = 0;

  await sql.query("begin");
  try {
    for (const batch of plan.batches) {
      const rowGroups = batch.operation === "update"
        ? batch.rows.map((row) => [row])
        : chunk(batch.rows, batchSize);
      for (const rows of rowGroups) {
        if (rows.length === 0) continue;
        const statement = batch.operation === "insert"
          ? renderInsert(batch, rows)
          : renderUpdate(batch, rows);
        await sql.query(statement.sql, statement.values);
        statementCount += 1;
        rowCount += rows.length;
      }
    }
    await sql.query("commit");
  } catch (error) {
    try {
      await sql.query("rollback");
    } catch {
      // Preserve the original write error. A failed rollback requires operator intervention.
    }
    throw error;
  }

  return {
    batchCount: plan.batches.length,
    statementCount,
    rowCount
  };
}

function assertExecutionInput(plan: CatalogOrderCutoverPlan, input: ExecuteCatalogOrderCutoverPlanInput) {
  if (input.mode !== "staging_rehearsal") {
    throw new Error("CUTOVER_EXECUTION_SCOPE_BLOCKED: Catalog/order plan may run only as a staging rehearsal.");
  }
  if (plan.isComplete) {
    throw new Error("CUTOVER_EXECUTION_PLAN_KIND_INVALID: This executor accepts only the explicit partial rehearsal plan.");
  }
  if (calculateCatalogOrderCutoverPlanChecksum(plan) !== plan.planChecksum) {
    throw new Error("CUTOVER_EXECUTION_PLAN_INTEGRITY_MISMATCH: Refuse to run a plan whose checksum no longer matches its content.");
  }
  if (plan.sourceChecksum !== input.expectedSourceChecksum) {
    throw new Error("CUTOVER_EXECUTION_SOURCE_CHECKSUM_MISMATCH: Refuse to load a plan from another runtime snapshot.");
  }
  if (plan.planChecksum !== input.expectedPlanChecksum) {
    throw new Error("CUTOVER_EXECUTION_PLAN_CHECKSUM_MISMATCH: Refuse to load a changed cutover plan.");
  }
}

function validatePlan(plan: CatalogOrderCutoverPlan) {
  for (const batch of plan.batches) {
    const allowedColumns = TABLE_COLUMNS[batch.table];
    if (!allowedColumns) {
      throw new Error(`CUTOVER_EXECUTION_TABLE_BLOCKED: ${batch.table} is not an approved catalog/order target table.`);
    }
    const seenIds = new Set<string>();
    for (const item of batch.rows) {
      if (!item.id || !item.legacyId || seenIds.has(item.id)) {
        throw new Error(`CUTOVER_EXECUTION_ROW_INVALID: Batch ${batch.name} contains a missing or duplicate row identifier.`);
      }
      seenIds.add(item.id);
      const columns = Object.keys(item.values);
      if (columns.length === 0 || columns.some((column) => !allowedColumns.includes(column))) {
        throw new Error(`CUTOVER_EXECUTION_COLUMN_BLOCKED: Batch ${batch.name} contains a column outside its approved target contract.`);
      }
    }
    if (batch.operation === "insert") {
      const signature = columnSignature(batch.rows[0]);
      if (batch.rows.some((item) => columnSignature(item) !== signature)) {
        throw new Error(`CUTOVER_EXECUTION_BATCH_SHAPE_INVALID: Insert batch ${batch.name} has inconsistent row columns.`);
      }
    }
  }
}

function renderInsert(batch: CatalogOrderCutoverBatch, rows: CatalogOrderCutoverRow[]) {
  const columns = ["id", ...Object.keys(rows[0].values).sort()];
  const values: unknown[] = [];
  const placeholders = rows.map((item) => {
    const rowValues = [item.id, ...columns.slice(1).map((column) => item.values[column])];
    const rowPlaceholders = rowValues.map((value) => {
      values.push(value);
      return `$${values.length}`;
    });
    return `(${rowPlaceholders.join(", ")})`;
  });
  return {
    sql: `insert into public.${quoteIdentifier(batch.table)} (${columns.map(quoteIdentifier).join(", ")}) values ${placeholders.join(", ")}`,
    values
  };
}

function renderUpdate(batch: CatalogOrderCutoverBatch, rows: CatalogOrderCutoverRow[]) {
  if (rows.length !== 1) {
    throw new Error(`CUTOVER_EXECUTION_UPDATE_BATCH_SIZE_INVALID: Update batch ${batch.name} must be executed one row at a time.`);
  }
  const row = rows[0];
  const columns = Object.keys(row.values).sort();
  const values = columns.map((column) => row.values[column]);
  const assignments = columns.map((column, index) => `${quoteIdentifier(column)} = $${index + 1}`);
  values.push(row.id, row.legacyId);
  return {
    sql: `update public.${quoteIdentifier(batch.table)} set ${assignments.join(", ")} where "id" = $${values.length - 1} and "legacy_runtime_id" = $${values.length}`,
    values
  };
}

function quoteIdentifier(value: string) {
  return `"${value}"`;
}

function columnSignature(row: CatalogOrderCutoverRow) {
  return Object.keys(row.values).sort().join("|");
}

function normalizeBatchSize(value: number | undefined) {
  if (value === undefined) return MAXIMUM_BATCH_SIZE;
  if (!Number.isInteger(value) || value < 1 || value > MAXIMUM_BATCH_SIZE) {
    throw new Error(`CUTOVER_EXECUTION_BATCH_SIZE_INVALID: batchSize must be an integer from 1 to ${MAXIMUM_BATCH_SIZE}.`);
  }
  return value;
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
