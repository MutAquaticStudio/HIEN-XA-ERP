import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "202607280007_commercial_pricing_terms.sql",
);

describe("commercial pricing migration", () => {
  it("creates server-only freight and delivery-charge persistence with terms snapshots", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("target_margin_rate");
    expect(sql).toContain("payment_term_days");
    expect(sql).toContain("create table if not exists public.purchase_freight_charges");
    expect(sql).toContain("create table if not exists public.purchase_freight_allocations");
    expect(sql).toContain("create table if not exists public.sales_order_charges");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on public.purchase_freight_charges from public, anon, authenticated");
  });
});
