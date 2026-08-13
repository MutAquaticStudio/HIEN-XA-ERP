import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { requireIntegrationTestEnvironment } from "../../src/server/testing/integration-test-environment";

const environment = requireIntegrationTestEnvironment();
const sql = postgres(environment.databaseUrl, { max: 1, prepare: false });

describe("staging PostgreSQL integration harness", () => {
  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it("connects only to the explicitly confirmed staging database", async () => {
    const [row] = await sql<{ database_name: string; server_version_num: string }[]>`
      select current_database() as database_name, current_setting('server_version_num') as server_version_num
    `;

    expect(row.database_name.toLowerCase()).not.toContain("prod");
    expect(Number(row.server_version_num)).toBeGreaterThanOrEqual(140000);
  });
});
