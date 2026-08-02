import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertOperationsInvariants } from "../src/modules/operations/invariants";
import { verifyPassword } from "../src/server/identity/crypto";
import { requireIntegrationTestEnvironment } from "../src/server/testing/integration-test-environment";
import {
  createUatUxV2IdentityData,
  createUatUxV2OperationsState,
  requireUatUxV2FixtureEnvironment,
  UAT_UXV2_ROLES
} from "../src/server/testing/uat-ux-v2-fixture";

function stagingEnvironment(): Record<string, string> {
  const projectRef = "abcdefghijklmnopqrst";
  return {
    ERP_RUN_INTEGRATION_TESTS: "1",
    ERP_TEST_DATABASE_CONFIRMATION: "hien-xa-staging",
    ERP_UAT_FIXTURE_CONFIRMATION: "UAT-UXV2",
    ERP_TEST_DATABASE_URL: `postgresql://postgres:secret@db.${projectRef}.supabase.co:5432/postgres`,
    SUPABASE_TEST_URL: `https://${projectRef}.supabase.co`,
    SUPABASE_TEST_ANON_KEY: "anon-test-only",
    SUPABASE_TEST_SERVICE_ROLE_KEY: "service-role-test-only",
    SUPABASE_TEST_PROJECT_REF: projectRef,
    SUPABASE_PRODUCTION_PROJECT_REF: "zyxwvutsrqponmlkjihg",
    ...Object.fromEntries(UAT_UXV2_ROLES.flatMap((role, index) => [
      [`E2E_${role}_USERNAME`, `uat.uxv2.${role.toLocaleLowerCase("en-US")}`],
      [`E2E_${role}_PASSWORD`, `Unique-UAT-${index}-password-2026`]
    ]))
  };
}

describe("staging rehearsal safety contract", () => {
  it("accepts only a separately identified Supabase staging project", () => {
    const environment = stagingEnvironment();
    expect(requireIntegrationTestEnvironment(environment).projectRef).toBe(environment.SUPABASE_TEST_PROJECT_REF);
    expect(requireUatUxV2FixtureEnvironment(environment).credentials.OWNER.username).toBe("uat.uxv2.owner");
  });

  it("rejects production ref reuse and repeated UAT passwords", () => {
    const productionReuse = stagingEnvironment();
    productionReuse.SUPABASE_PRODUCTION_PROJECT_REF = productionReuse.SUPABASE_TEST_PROJECT_REF;
    expect(() => requireIntegrationTestEnvironment(productionReuse)).toThrow(/production Supabase project ref/i);

    const repeatedPassword = stagingEnvironment();
    repeatedPassword.E2E_WORKER_PASSWORD = repeatedPassword.E2E_DRIVER_PASSWORD;
    expect(() => requireUatUxV2FixtureEnvironment(repeatedPassword)).toThrow(/different password/i);
  });

  it("keeps the migration manifest equal to all 27 repository migrations", async () => {
    const manifest = (await readFile(join(process.cwd(), "scripts", "uat", "migration-manifest.txt"), "utf8"))
      .split(/\r?\n/)
      .filter(Boolean);
    const migrations = (await readdir(join(process.cwd(), "supabase", "migrations")))
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .map((file) => file.split("_")[0]);
    expect(manifest).toHaveLength(27);
    expect(migrations).toEqual(manifest);
  });
});

describe("UAT UXV2 fixture", () => {
  it("is non-PII, invariant-safe and idempotent for operations", () => {
    const once = createUatUxV2OperationsState();
    const twice = createUatUxV2OperationsState(once);
    expect(twice).toEqual(once);
    expect(once.customers.filter((item) => item.id === "uat-uxv2-customer")).toHaveLength(1);
    expect(once.suppliers.filter((item) => item.id === "uat-uxv2-supplier")).toHaveLength(1);
    expect(once.deliveryJobs.find((item) => item.id === "uat-uxv2-delivery-job")?.status).toBe("in_transit");
    expect(() => assertOperationsInvariants(once)).not.toThrow();
  });

  it("creates eight scoped identities and preserves password hashes on retry", () => {
    const environment = requireUatUxV2FixtureEnvironment(stagingEnvironment());
    const empty = { schemaVersion: 1 as const, revision: 0, users: [], auditEvents: [] };
    const once = createUatUxV2IdentityData(empty, environment.credentials, 1);
    const twice = createUatUxV2IdentityData(once, environment.credentials, 1);
    expect(twice).toEqual(once);
    expect(once.users).toHaveLength(8);
    for (const role of UAT_UXV2_ROLES) {
      const user = once.users.find((candidate) => candidate.username === environment.credentials[role].username);
      expect(user?.passwordHash && verifyPassword(environment.credentials[role].password, user.passwordHash)).toBe(true);
    }
  });
});
