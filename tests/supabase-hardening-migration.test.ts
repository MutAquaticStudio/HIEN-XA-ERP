import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "202607160002_erp_invariant_hardening.sql"),
  "utf8"
);
const completionMigration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "202607170001_operational_completion.sql"),
  "utf8"
);
const documentUnitMigration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "202607170002_document_unit_conversion.sql"),
  "utf8"
);
const purchaseUnitMigration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "202607170003_purchase_unit_configuration.sql"),
  "utf8"
);
const variablePurchaseUnitMigration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "202607170004_variable_purchase_units.sql"),
  "utf8"
);
const auditDebtMigration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "202607180001_audit_debt_reconciliation.sql"),
  "utf8"
);

describe("Supabase ERP hardening migration", () => {
  it("adds append-only protection for financial, inventory, and audit tables", () => {
    expect(migration).toContain("prevent_any_update_or_delete");
    expect(migration).toContain("prevent_update_except_reversal_marker");
    expect(migration).toContain("trg_customer_ledger_entries_append_only");
    expect(migration).toContain("trg_supplier_ledger_entries_append_only");
    expect(migration).toContain("trg_employee_ledger_entries_append_only");
    expect(migration).toContain("trg_inventory_movement_lines_append_only");
    expect(migration).toContain("trg_audit_logs_append_only");
  });

  it("mirrors critical ERP invariants into deferred database triggers", () => {
    expect(migration).toContain("assert_inventory_line_invariants");
    expect(migration).toContain("Supplier direct delivery cannot create warehouse receipt movement");
    expect(migration).toContain("assert_customer_payment_allocation_invariants");
    expect(migration).toContain("Customer payment allocation cannot exceed payment amount");
    expect(migration).toContain("assert_compensation_batch_valid");
    expect(migration).toContain("A work output cannot be posted into more than one compensation batch");
  });

  it("hardens purchase allocation and attachment evidence metadata", () => {
    expect(migration).toContain("assert_purchase_destination_quantities");
    expect(migration).toContain("attachments_content_sha256_format_check");
    expect(migration).toContain("attachments_byte_size_positive_check");
    expect(migration).toContain("attachments_bucket_object_path_unique_idx");
  });

  it("adds a database revision stream for production realtime dashboards", () => {
    expect(migration).toContain("create table if not exists public.erp_revisions");
    expect(migration).toContain("bump_operations_revision");
    expect(migration).toContain("pg_notify");
    expect(migration).toContain("trg_sales_orders_bump_operations_revision");
    expect(migration).toContain("trg_inventory_lines_bump_operations_revision");
    expect(migration).toContain("trg_import_issues_bump_operations_revision");
  });

  it("does not use invalid PostgreSQL add-constraint-if-not-exists syntax", () => {
    expect(migration.toLowerCase()).not.toContain("add constraint if not exists");
    expect(completionMigration.toLowerCase()).not.toContain("add constraint if not exists");
    expect(documentUnitMigration.toLowerCase()).not.toContain("add constraint if not exists");
    expect(purchaseUnitMigration.toLowerCase()).not.toContain("add constraint if not exists");
    expect(variablePurchaseUnitMigration.toLowerCase()).not.toContain("add constraint if not exists");
    expect(auditDebtMigration.toLowerCase()).not.toContain("add constraint if not exists");
  });

  it("enforces delivery scheduling and completion evidence in PostgreSQL", () => {
    expect(completionMigration).toContain("delivery_jobs_active_driver_day_unique_idx");
    expect(completionMigration).toContain("delivery_jobs_active_vehicle_day_unique_idx");
    expect(completionMigration).toContain("assert_delivery_completion_metadata");
    expect(completionMigration).toContain("capacity_tons");
  });

  it("adds durable cash documents and analytical posting metadata", () => {
    expect(completionMigration).toContain("create table if not exists public.cash_vouchers");
    expect(completionMigration).toContain("create table if not exists public.employee_payments");
    expect(completionMigration).toContain("create table if not exists public.employee_advances");
    expect(completionMigration).toContain("posting_group_id");
    expect(completionMigration).toContain("net_amount");
    expect(completionMigration).toContain("bump_operations_revision");
  });

  it("persists and reconciles document units against stock base units", () => {
    expect(documentUnitMigration).toContain("document_unit_factor");
    expect(documentUnitMigration).toContain("document_quantity * document_unit_factor");
    expect(documentUnitMigration).toContain("unit_price * document_unit_factor - document_unit_price");
    expect(documentUnitMigration).toContain("unit_cost * document_unit_factor - document_unit_cost");
  });

  it("versions configurable units and product-specific purchase conversions", () => {
    expect(purchaseUnitMigration).toContain("units_normalized_name_uidx");
    expect(purchaseUnitMigration).toContain("product_units_one_base_uidx");
    expect(purchaseUnitMigration).toContain("bump_product_unit_config_version");
    expect(purchaseUnitMigration).toContain("conversion_factor");
  });

  it("supports variable purchase units without a fixed stock conversion", () => {
    expect(variablePurchaseUnitMigration).toContain("conversion_mode");
    expect(variablePurchaseUnitMigration).toContain("alter column conversion_factor drop not null");
    expect(variablePurchaseUnitMigration).toContain("conversion_mode = 'variable'");
    expect(variablePurchaseUnitMigration).toContain("conversion_factor is null");
    expect(variablePurchaseUnitMigration).toContain("document_unit_conversion_mode");
  });

  it("adds append-only supplier allocations and debt/audit reconciliation read models", () => {
    expect(auditDebtMigration).toContain("create table if not exists public.supplier_payment_allocations");
    expect(auditDebtMigration).toContain("trg_supplier_payment_allocations_append_only");
    expect(auditDebtMigration).toContain("assert_supplier_payment_allocation_invariants");
    expect(auditDebtMigration).toContain("where payment.status <> 'reversed'");
    expect(auditDebtMigration).toContain("customer_debt_reconciliation_view");
    expect(auditDebtMigration).toContain("supplier_debt_reconciliation_view");
    expect(auditDebtMigration).toContain("audit_integrity_view");
  });
});
