import { describe, expect, it } from "vitest";
import { requireCloudflareIntegrationEnvironment } from "../src/server/testing/cloudflare-integration-environment";

const valid = {
  ERP_RUN_CLOUDFLARE_INTEGRATION_TESTS: "1",
  ERP_TEST_CLOUDFLARE_CONFIRMATION: "UAT-REM",
  CLOUDFLARE_STAGING_BASE_URL: "https://uat.example.test",
  CLOUDFLARE_PRODUCTION_BASE_URL: "https://app.hienxavlxd.com",
  CLOUDFLARE_INTEGRATION_SECRET: "s".repeat(32),
  CLOUDFLARE_STAGING_D1_ID: "staging-d1",
  CLOUDFLARE_PRODUCTION_D1_ID: "production-d1",
  CLOUDFLARE_STAGING_R2_BUCKET: "staging-r2",
  CLOUDFLARE_PRODUCTION_R2_BUCKET: "production-r2",
  CLOUDFLARE_STAGING_QUEUE: "staging-queue",
  CLOUDFLARE_PRODUCTION_QUEUE: "production-queue"
};

describe("Cloudflare integration environment guard", () => {
  it("accepts isolated staging bindings", () => {
    expect(requireCloudflareIntegrationEnvironment(valid)).toMatchObject({ baseUrl: "https://uat.example.test" });
  });

  it.each([
    ["CLOUDFLARE_STAGING_D1_ID", "CLOUDFLARE_PRODUCTION_D1_ID"],
    ["CLOUDFLARE_STAGING_R2_BUCKET", "CLOUDFLARE_PRODUCTION_R2_BUCKET"],
    ["CLOUDFLARE_STAGING_QUEUE", "CLOUDFLARE_PRODUCTION_QUEUE"]
  ])("rejects a staging binding shared with production", (stagingName, productionName) => {
    expect(() => requireCloudflareIntegrationEnvironment({
      ...valid,
      [stagingName]: valid[productionName as keyof typeof valid]
    })).toThrow("must be different");
  });

  it("rejects the production hostname", () => {
    expect(() => requireCloudflareIntegrationEnvironment({
      ...valid,
      CLOUDFLARE_STAGING_BASE_URL: "https://app.hienxavlxd.com"
    })).toThrow("different from production host");
  });

  it("requires an explicitly separate staging production URL", () => {
    expect(() => requireCloudflareIntegrationEnvironment({
      ...valid,
      CLOUDFLARE_PRODUCTION_BASE_URL: "https://uat.example.test"
    })).toThrow("different from production host");
  });
});
