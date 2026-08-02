import { describe, expect, it } from "vitest";
import { assertProductionPersistenceConfigured } from "../src/modules/operations/demo-store";

describe("production persistence guard", () => {
  it("fails closed when a production deployment has no Supabase server configuration", () => {
    expect(() => assertProductionPersistenceConfigured({ NODE_ENV: "production" })).toThrow(
      "Production requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  });

  it("allows a configured production deployment and local file-backed development", () => {
    expect(() => assertProductionPersistenceConfigured({
      NODE_ENV: "production",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role"
    })).not.toThrow();
    expect(() => assertProductionPersistenceConfigured({ NODE_ENV: "development" })).not.toThrow();
    expect(() => assertProductionPersistenceConfigured({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" })).not.toThrow();
  });
});
