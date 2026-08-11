import { describe, expect, it } from "vitest";
import { initializeOpenNextCloudflareContext } from "../cloudflare/open-next-context";

const contextSymbol = Symbol.for("__cloudflare-context__");

describe("OpenNext Cloudflare context", () => {
  it("initializes immutable Worker bindings for custom entrypoints", () => {
    const scope = globalThis as Record<symbol, unknown>;
    const previous = scope[contextSymbol];
    try {
      delete scope[contextSymbol];
      const context = { waitUntil: () => undefined };
      initializeOpenNextCloudflareContext(
        new Request("https://uat.hienxavlxd.com/login"),
        { DB: { binding: "d1" }, CLOUDFLARE_INTEGRATION_SECRET: "test-secret" },
        context
      );
      expect(scope[contextSymbol]).toMatchObject({
        env: { DB: { binding: "d1" }, CLOUDFLARE_INTEGRATION_SECRET: "test-secret" },
        ctx: context
      });
    } finally {
      if (previous === undefined) delete scope[contextSymbol];
      else scope[contextSymbol] = previous;
    }
  });

  it("replaces an outdated binding object without retaining request data", () => {
    const scope = globalThis as Record<symbol, unknown>;
    const previous = scope[contextSymbol];
    try {
      const activeBindings = { DB: { binding: "active-d1" } };
      const activeContext = { waitUntil: () => undefined };
      scope[contextSymbol] = { env: { DB: { binding: "stale-d1" } }, requestId: "must-not-survive" };
      initializeOpenNextCloudflareContext(
        new Request("https://uat.hienxavlxd.com/api/internal/integration/cloudflare"),
        activeBindings,
        activeContext
      );
      expect(scope[contextSymbol]).toEqual({ env: activeBindings, cf: undefined, ctx: activeContext });
    } finally {
      if (previous === undefined) delete scope[contextSymbol];
      else scope[contextSymbol] = previous;
    }
  });
});
