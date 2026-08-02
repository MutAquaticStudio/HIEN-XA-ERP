import { describe, expect, it } from "vitest";
import { requireIntegrationTestEnvironment } from "../src/server/testing/integration-test-environment";

const validEnvironment = {
  ERP_RUN_INTEGRATION_TESTS: "1",
  ERP_TEST_DATABASE_CONFIRMATION: "hien-xa-staging",
  ERP_TEST_DATABASE_URL: "postgresql://postgres:password@db.abcdefghijklmnopqrst.supabase.co:5432/postgres",
  SUPABASE_TEST_URL: "https://abcdefghijklmnopqrst.supabase.co",
  SUPABASE_TEST_ANON_KEY: "anon",
  SUPABASE_TEST_SERVICE_ROLE_KEY: "service",
  SUPABASE_TEST_PROJECT_REF: "abcdefghijklmnopqrst",
  SUPABASE_PRODUCTION_PROJECT_REF: "zyxwvutsrqponmlkjihg"
};

describe("integration test environment guard", () => {
  it("fails closed until an explicit staging configuration is supplied", () => {
    expect(() => requireIntegrationTestEnvironment({})).toThrow("Integration tests are disabled");
    expect(() => requireIntegrationTestEnvironment({ ERP_RUN_INTEGRATION_TESTS: "1" })).toThrow(
      "ERP_TEST_DATABASE_CONFIRMATION"
    );
  });

  it("rejects a production-looking target even when the confirmation flag is set", () => {
    expect(() => requireIntegrationTestEnvironment({
      ...validEnvironment,
      ERP_TEST_DATABASE_URL: "postgresql://postgres:password@db.production.example:5432/postgres"
    })).toThrow("production-looking");
  });

  it("accepts a dedicated, matching staging target", () => {
    expect(requireIntegrationTestEnvironment(validEnvironment)).toMatchObject({
      projectRef: "abcdefghijklmnopqrst",
      supabaseUrl: validEnvironment.SUPABASE_TEST_URL
    });
  });
});
