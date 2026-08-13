import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/202607280002_runtime_cutover_rehearsal.sql";

describe("runtime-to-PostgreSQL cutover rehearsal migration", () => {
  it("records immutable cutover evidence and stable legacy-to-UUID provenance", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("create table if not exists public.erp_cutover_runs");
    expect(migration).toContain("create table if not exists public.erp_cutover_checkpoints");
    expect(migration).toContain("create table if not exists public.erp_legacy_id_map");
    expect(migration).toContain("primary key (source_namespace, entity_type, legacy_id)");
    expect(migration).toContain("unique (source_namespace, source_revision, source_checksum)");
  });

  it("fails closed against runtime writes only after an explicit production cutover", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("where status = 'production_active'");
    expect(migration).toContain("raise exception 'Runtime document writes are disabled after normalized PostgreSQL cutover.'");
    expect(migration).toContain("create trigger erp_runtime_document_cutover_guard");
    expect(migration).toContain("before insert or update or delete on public.erp_runtime_documents");
  });

  it("requires backup, rehearsal and reconciliation gates before production activation", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("create unique index if not exists erp_cutover_single_active_idx");
    expect(migration).toContain("Production cutover requires a successful reconciliation.");
    expect(migration).toContain("Production cutover cannot continue with a failed checkpoint.");
    expect(migration).toContain("Production cutover requires all mandatory passed checkpoints.");
    expect(migration).toContain("create trigger erp_cutover_run_transition_guard");
  });

  it("does not expose cutover controls to browser database roles", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("alter table public.erp_cutover_runs enable row level security");
    expect(migration).toContain("revoke all on table public.erp_cutover_runs from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.assert_runtime_document_write_allowed() to service_role");
  });
});
