import { describe, expect, it } from "vitest";
import {
  getCloudflareRequestEnvironment,
  runWithCloudflareRequestEnvironment
} from "../cloudflare/request-context";

describe("Cloudflare request context", () => {
  it("keeps Worker bindings scoped to the active asynchronous request", async () => {
    expect(getCloudflareRequestEnvironment()).toBeUndefined();

    const environment = await runWithCloudflareRequestEnvironment(
      { CLOUDFLARE_INTEGRATION_SECRET: "test-secret", DB: { binding: "d1" } },
      async () => {
        await Promise.resolve();
        return getCloudflareRequestEnvironment();
      }
    );

    expect(environment).toMatchObject({
      CLOUDFLARE_INTEGRATION_SECRET: "test-secret",
      DB: { binding: "d1" }
    });
    expect(getCloudflareRequestEnvironment()).toBeUndefined();
  });
});
