import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/202607280004_cutover_mapping_overrides.sql";

describe("cutover mapping overrides migration", () => {
  it("adds vehicle capacity and fail-closed typed source-document mappings", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("add column if not exists capacity_tons numeric(12, 3)");
    expect(migration).toContain("create table if not exists public.erp_cutover_source_document_overrides");
    expect(migration).toContain("target_entity_type text not null check (");
    expect(migration).toContain("create or replace function public.assert_cutover_source_document_override_target()");
    expect(migration).toContain("Cutover source document override target does not exist.");
  });

  it("requires an explicit account, method, actor alias and timestamp for payment mappings", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("create table if not exists public.erp_cutover_payment_overrides");
    expect(migration).toContain("cash_account_id uuid not null references public.cash_accounts(id)");
    expect(migration).toContain("payment_method text not null check (payment_method in ('cash', 'bank_transfer', 'other'))");
    expect(migration).toContain("payment_occurred_at timestamptz not null");
    expect(migration).toContain("actor_identity_alias_id uuid not null references public.erp_cutover_identity_aliases(id)");
    expect(migration).toContain("create or replace function public.assert_cutover_payment_override_integrity()");
    expect(migration).not.toContain("payment_method text not null default");
    expect(migration).not.toContain("cash_account_id uuid not null default");
  });

  it("keeps identity and attachment evidence server-only with mandatory storage metadata", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("create table if not exists public.erp_cutover_identity_aliases");
    expect(migration).toContain("app_user_id uuid not null references public.app_users(user_id)");
    expect(migration).toContain("create table if not exists public.erp_cutover_attachment_overrides");
    expect(migration).toContain("storage_bucket text not null");
    expect(migration).toContain("storage_object_path text not null");
    expect(migration).toContain("sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$')");
    expect(migration).toContain("alter table public.erp_cutover_attachment_overrides enable row level security");
    expect(migration).toContain("revoke all on table public.erp_cutover_attachment_overrides from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.assert_cutover_payment_override_integrity() to service_role");
  });
});
