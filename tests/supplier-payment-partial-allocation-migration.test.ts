import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/202607280005_supplier_payment_partial_allocation.sql"), "utf8");

describe("supplier payment partial allocation migration", () => {
  it("preserves the runtime partially_allocated status without weakening other status constraints", () => {
    expect(migration).toContain("drop constraint if exists supplier_payments_status_check");
    expect(migration).toContain("'partially_allocated'");
    expect(migration).toContain("'allocated'");
    expect(migration).toContain("'reversed'");
  });
});
