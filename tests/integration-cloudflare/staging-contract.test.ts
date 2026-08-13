import { describe, expect, it } from "vitest";
import { requireCloudflareIntegrationEnvironment } from "../../src/server/testing/cloudflare-integration-environment";

describe("Cloudflare staging release gate", () => {
  it("checks D1 CAS, replay protection, private R2, Queue and reconciliation", async () => {
    const environment = requireCloudflareIntegrationEnvironment();
    const response = await fetch(`${environment.baseUrl}/api/internal/integration/cloudflare`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erp-integration-secret": environment.secret
      },
      body: JSON.stringify({ runId: `contract-${Date.now().toString(36)}` })
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      cas: "passed",
      idempotencyReplay: "passed",
      r2PrivateRoundTrip: "passed",
      queueEnqueue: "passed",
      reconciliation: 0
    });
  });
});
