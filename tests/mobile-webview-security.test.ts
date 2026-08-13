import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

function source(path: string) {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

describe("Web release bridge boundary", () => {
  it("does not ship bridge routes or bridge token helpers", () => {
    expect(existsSync(join(repositoryRoot, "src/app/api/mobile/bridge/route.ts"))).toBe(false);
    expect(existsSync(join(repositoryRoot, "src/app/mobile/bridge/route.ts"))).toBe(false);
    expect(source("src/server/identity/auth-context.ts")).not.toContain("createMobileWebBridgeCode");
    expect(source("src/server/identity/session-token.ts")).not.toContain("MobileWebBridge");
  });
});
