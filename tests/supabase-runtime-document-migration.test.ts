import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Supabase runtime document persistence migration", () => {
  it("keeps browser roles out and commits only through compare-and-swap", async () => {
    const migration = await readFile(join(process.cwd(), "supabase/migrations/202607260003_runtime_document_persistence.sql"), "utf8");
    expect(migration).toContain("create table if not exists public.erp_runtime_documents");
    expect(migration).toContain("alter table public.erp_runtime_documents enable row level security");
    expect(migration).toContain("revoke all on table public.erp_runtime_documents from anon, authenticated");
    expect(migration).toContain("create or replace function public.commit_erp_runtime_document");
    expect(migration).toContain("for update");
    expect(migration).toContain("grant execute on function public.commit_erp_runtime_document(text, bigint, jsonb) to service_role");
  });
});
