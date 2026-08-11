import { describe, expect, it } from "vitest";
import { initializeOpenNextCloudflareContext } from "../cloudflare/open-next-context";

const contextSymbol = Symbol.for("__cloudflare-context__");

describe("OpenNext Cloudflare context", () => {
  it("initializes immutable Worker bindings for custom entrypoints", () => {
    const scope = globalThis as Record<symbol, unknown>;
    const previous = scope[contextSymbol];
    try {
      delete scope[contextSymbol];
      initializeOpenNextCloudflareContext({ DB: { binding: "d1" }, CLOUDFLARE_INTEGRATION_SECRET: "test-secret" });
      expect(scope[contextSymbol]).toMatchObject({
        env: { DB: { binding: "d1" }, CLOUDFLARE_INTEGRATION_SECRET: "test-secret" }
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
      scope[contextSymbol] = { env: { DB: { binding: "stale-d1" } }, requestId: "must-not-survive" };
      initializeOpenNextCloudflareContext(activeBindings);
      expect(scope[contextSymbol]).toEqual({ env: activeBindings });
    } finally {
      if (previous === undefined) delete scope[contextSymbol];
      else scope[contextSymbol] = previous;
    }
  });
});
