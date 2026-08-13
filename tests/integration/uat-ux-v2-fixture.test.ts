import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { assertOperationsInvariants } from "../../src/modules/operations/invariants";
import type { OperationsState } from "../../src/modules/operations/types";
import type { PersistedIdentityData } from "../../src/server/identity/types";
import { SupabaseRuntimeDocumentStore } from "../../src/server/infrastructure/supabase-runtime-document-store";
import {
  applyUatUxV2Fixture,
  requireUatUxV2FixtureEnvironment,
  UAT_UXV2_IDENTITIES
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
    expect(identity.payload.users.filter((user) => user.username?.startsWith("uat.uxv2."))).toHaveLength(11);
    for (const role of UAT_UXV2_IDENTITIES) {
      expect(identity.payload.users.some((user) => user.username === environment.credentials[role].username)).toBe(true);
    }

    const communications = await documents.read<{ messages: Array<{ threadId: string }> }>("communications", { messages: [] });
    expect(communications.payload.messages.some((message) => message.threadId === "partner:customer:uat-uxv2-customer")).toBe(true);
    expect(communications.payload.messages.some((message) => message.threadId === "partner:customer:uat-uxv2-customer-b")).toBe(true);

    const push = await documents.read<{ subscriptions: Array<{ userId: string }> }>("push_notifications", { subscriptions: [] });
    expect(push.payload.subscriptions.some((subscription) => subscription.userId === "uat-uxv2-user-supplier")).toBe(true);
    expect(push.payload.subscriptions.some((subscription) => subscription.userId === "uat-uxv2-user-supplier-b")).toBe(true);

    for (const attachmentId of ["d98741e8-4d11-4bdf-9ce2-0318c0a11001", "d98741e8-4d11-4bdf-9ce2-0318c0a11002", "d98741e8-4d11-4bdf-9ce2-0318c0a11003", "d98741e8-4d11-4bdf-9ce2-0318c0a11004"]) {
      const stored = await client.storage.from("erp-attachments").download(`${attachmentId}.png`);
      expect(stored.error).toBeNull();
      expect(stored.data?.size).toBeGreaterThan(0);
    }
  });
});
