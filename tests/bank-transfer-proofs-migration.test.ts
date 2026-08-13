import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("bank transfer proof migration", () => {
  it("keeps the archive append-only and readable only by finance roles", async () => {
    const migration = await readFile(join(process.cwd(), "supabase/migrations/202607230001_bank_transfer_proofs.sql"), "utf8");
    expect(migration).toContain("create table if not exists public.bank_transfer_proofs");
    expect(migration).toContain("idempotency_key text not null unique");
    expect(migration).toContain("archived_by uuid not null references public.app_users(user_id)");
    expect(migration).not.toContain("public.profiles");
    expect(migration).toContain("bank_transfer_proofs_append_only");
    expect(migration).toContain("bank_transfer_proofs_finance_select");
    expect(migration).toContain("'owner', 'administrator', 'accountant'");
    expect(migration).not.toContain("for insert");
  });
});
