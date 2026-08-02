import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { assertOperationsInvariants } from "../../src/modules/operations/invariants";
import type { OperationsState } from "../../src/modules/operations/types";
import type { PersistedIdentityData } from "../../src/server/identity/types";
import { SupabaseRuntimeDocumentStore } from "../../src/server/infrastructure/supabase-runtime-document-store";
import {
  applyUatUxV2Fixture,
  requireUatUxV2FixtureEnvironment,
  UAT_UXV2_ROLES
} from "../../src/server/testing/uat-ux-v2-fixture";

const environment = requireUatUxV2FixtureEnvironment();
const client = createClient(environment.supabaseUrl, environment.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
const documents = new SupabaseRuntimeDocumentStore(client);

describe("UAT-UXV2 staging fixture", () => {
  it("applies only with the explicit mutation gate and remains idempotent", async () => {
    if (process.env.ERP_UAT_FIXTURE_APPLY === "1") {
      const first = await applyUatUxV2Fixture(environment);
      const second = await applyUatUxV2Fixture(environment);
      expect(second).toEqual(first);
    }

    const operations = await documents.read<{ schemaVersion: 1; state: OperationsState }>("operations", {
      schemaVersion: 1,
      state: {} as OperationsState
    });
    const identity = await documents.read<PersistedIdentityData>("identity", {
      schemaVersion: 1,
      revision: 0,
      users: [],
      auditEvents: []
    });

    expect(operations.revision).toBeGreaterThan(0);
    expect(identity.revision).toBeGreaterThan(0);
    expect(() => assertOperationsInvariants(operations.payload.state)).not.toThrow();
    expect(identity.payload.users.filter((user) => user.username?.startsWith("uat.uxv2."))).toHaveLength(8);
    for (const role of UAT_UXV2_ROLES) {
      expect(identity.payload.users.some((user) => user.username === environment.credentials[role].username)).toBe(true);
    }
  });
});
