import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/202607280003_normalized_cutover_schema_delta.sql";

describe("normalized cutover schema delta migration", () => {
  it("preserves runtime portal, supplier, approval and workforce data in relational tables", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("add column if not exists delivery_address text");
    expect(migration).toContain("create table if not exists public.customer_payment_proof_requests");
    expect(migration).toContain("create table if not exists public.purchase_order_supplier_acknowledgements");
    expect(migration).toContain("create table if not exists public.purchase_order_supplier_delivery_notices");
    expect(migration).toContain("create table if not exists public.approval_requests");
    expect(migration).toContain("create table if not exists public.work_order_location_points");
    expect(migration).toContain("create table if not exists public.purchase_unit_conversions");
  });

  it("keeps cutover provenance server-only and does not grant browser mutation access", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("add column if not exists legacy_runtime_id text");
    expect(migration).toContain("create unique index if not exists %I on public.%I(legacy_runtime_id) where legacy_runtime_id is not null");
    expect(migration).toContain("alter table public.customer_payment_proof_requests enable row level security");
    expect(migration).toContain("revoke all on table public.customer_payment_proof_requests from public, anon, authenticated");
    expect(migration).toContain("Portal proof requests are reconciliation evidence only; they never confirm cash or receivables.");
  });

  it("retains immutable audit, attachment and inventory provenance required for reconciliation", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("add column if not exists legacy_source_document text");
    expect(migration).toContain("add column if not exists actor_name text");
    expect(migration).toContain("add column if not exists sha256 text");
    expect(migration).toContain("create table if not exists public.document_attachment_links");
  });
});
