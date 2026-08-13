import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/202607270001_security_advisor_hardening.sql";

describe("Supabase security advisor hardening migration", () => {
  it("moves RLS helper functions away from the public API schema while preserving policy execution", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("create schema if not exists erp_private");
    expect(migration).toContain("revoke all on schema erp_private from public");
    expect(migration).toContain("grant usage on schema erp_private to authenticated, service_role");
    expect(migration).toContain("to_regprocedure('public.' || function_signature)");
    expect(migration).toContain("alter function public.%s set schema erp_private");
    expect(migration).toContain("grant execute on function erp_private.current_app_role() to authenticated, service_role");
    expect(migration).toContain("grant execute on function erp_private.can_access_partner_thread(text, uuid) to authenticated, service_role");
  });

  it("keeps runtime RPCs server-only and moves extensions outside the exposed public schema", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("revoke all on function public.commit_erp_runtime_document(text, bigint, jsonb) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.commit_erp_runtime_document(text, bigint, jsonb) to service_role");
    expect(migration).toContain("revoke all on function public.read_erp_runtime_document(text) from public, anon, authenticated");
    expect(migration).toContain("create schema if not exists extensions");
    expect(migration).toContain("alter extension unaccent set schema extensions");
    expect(migration).toContain("alter extension pg_trgm set schema extensions");
    expect(migration).toContain("lower(extensions.unaccent(new.name))");
  });

  it("collapses overlapping party and staff SELECT policies into one explicit scope per table", async () => {
    const migration = await readFile(migrationPath, "utf8");

    for (const table of [
      "app_users",
      "customer_ledger_entries",
      "customer_payment_allocations",
      "customer_payments",
      "customers",
      "sales_order_items",
      "sales_orders",
      "suppliers"
    ]) {
      expect(migration).toContain(`on public.${table}`);
    }
    expect(migration).toContain("create policy sales_order_items_read_scoped_or_owned");
    expect(migration).toContain("sales_order.customer_id = (select erp_private.current_customer_id())");
    expect(migration).toContain("erp_private.has_any_app_module(array['sales', 'receivables', 'reporting'])");
    expect(migration).not.toContain("create policy sales_roles_read_order_items");
  });
});
