import { readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { requireIntegrationTestEnvironment } from "../../src/server/testing/integration-test-environment";

const environment = requireIntegrationTestEnvironment();
const sql = postgres(environment.databaseUrl, { max: 1, prepare: false });

describe("staging migration history", () => {
  afterAll(async () => sql.end({ timeout: 5 }));

  it("contains exactly the 27 repository migrations in order", async () => {
    const expected = (await readFile(join(process.cwd(), "scripts", "uat", "migration-manifest.txt"), "utf8"))
      .split(/\r?\n/)
      .filter(Boolean);
    const rows = await sql<{ version: string }[]>`
      select version::text as version
      from supabase_migrations.schema_migrations
      order by version
    `;
    expect(rows.map((row) => row.version)).toEqual(expected);
  });
});
