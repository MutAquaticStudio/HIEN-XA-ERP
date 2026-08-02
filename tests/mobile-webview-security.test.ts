import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

function source(path: string) {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

describe("native-only mobile boundary", () => {
  it("does not ship WebView, bridge routes, or bridge token helpers", () => {
    const mobilePackage = JSON.parse(source("apps/mobile/package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(mobilePackage.dependencies?.["react-native-webview"]).toBeUndefined();
    expect(mobilePackage.devDependencies?.["react-native-webview"]).toBeUndefined();
    expect(existsSync(join(repositoryRoot, "apps/mobile/components/secure-erp-webview.tsx"))).toBe(false);
    expect(existsSync(join(repositoryRoot, "apps/mobile/lib/webview-security.ts"))).toBe(false);
    expect(existsSync(join(repositoryRoot, "src/app/api/mobile/bridge/route.ts"))).toBe(false);
    expect(existsSync(join(repositoryRoot, "src/app/mobile/bridge/route.ts"))).toBe(false);
    expect(source("apps/mobile/lib/api.ts")).not.toContain("createWebBridge");
    expect(source("src/server/identity/auth-context.ts")).not.toContain("createMobileWebBridgeCode");
    expect(source("src/server/identity/session-token.ts")).not.toContain("MobileWebBridge");
  });
});