import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "202607280006_cutover_source_document_bank_proof.sql",
);

describe("cutover source document bank-proof migration", () => {
  it("keeps the PostgreSQL target entity constraint aligned with the TypeScript contract", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain(
      "drop constraint if exists erp_cutover_source_document_overrides_target_entity_type_check",
    );
    expect(sql).toContain("'bank_transfer_proof'");
    expect(sql).toContain("'sales_order'");
    expect(sql).toContain("'import_job'");
  });
});
