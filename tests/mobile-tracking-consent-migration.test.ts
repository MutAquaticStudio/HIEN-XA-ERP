import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/202608010001_mobile_tracking_consent.sql"), "utf8");

describe("mobile tracking consent migration", () => {
  it("persists versioned consent with active-consent and idempotency constraints", () => {
    expect(migration).toContain("create table if not exists public.delivery_tracking_consents");
    expect(migration).toContain("delivery_tracking_consents_one_active_policy_idx");
    expect(migration).toContain("delivery_tracking_consents_employee_idempotency_idx");
  });

  it("keeps consent writes behind service-role RPCs and private delivery RLS", () => {
    expect(migration).toContain("erp_private.can_read_delivery_job");
    expect(migration).toContain("delivery_tracking_grant_consent");
    expect(migration).toContain("delivery_tracking_revoke_consent");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("tracking_consent_granted");
    expect(migration).toContain("tracking_consent_revoked");
  });
});
