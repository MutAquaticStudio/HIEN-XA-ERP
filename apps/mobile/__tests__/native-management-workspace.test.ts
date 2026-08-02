type NodeFileSystem = {
  readFileSync: (path: string, encoding: "utf8") => string;
};
type NodePath = {
  join: (...paths: string[]) => string;
};

declare const process: { cwd: () => string };
declare const require: (moduleName: string) => unknown;

const { readFileSync } = require("node:fs") as NodeFileSystem;
const { join } = require("node:path") as NodePath;

const workspacePath = join(process.cwd(), "components", "native-management-workspace.tsx");
const source = readFileSync(workspacePath, "utf8");

describe("native management workspace", () => {
  it("keeps management operations native without a WebView, bridge, or browser fallback", () => {
    const forbiddenBoundaries = [
      /\breact-native-webview\b/,
      /\bSecureErpWebView\b/,
      /\bexpo-web-browser\b/,
      /\bcreateWebBridge\b/,
      /\bLinking\.openURL\b/,
      /\/api\/mobile\/bridge\b/,
      /\/api\/mobile\/management\/operations\b/
    ];

    for (const boundary of forbiddenBoundaries) expect(source).not.toMatch(boundary);
  });

  it("uses bounded module APIs instead of a generic management command endpoint", () => {
    const expectedPaths = [
      "/api/mobile/catalog",
      "/api/mobile/sales",
      "/api/mobile/procurement",
      "/api/mobile/inventory/overview",
      "/api/mobile/delivery/overview",
      "/api/mobile/receivables",
      "/api/mobile/payables",
      "/api/mobile/cash",
      "/api/mobile/workforce",
      "/api/mobile/import",
      "/api/mobile/audit",
      "/api/mobile/reporting",
      "/api/mobile/admin"
    ];

    const navigationSource = readFileSync(join(process.cwd(), "lib", "role-navigation.ts"), "utf8");
    for (const path of expectedPaths) expect(navigationSource).toContain(`path: "${path}"`);
    expect(source).toMatch(/nativeErpGet<ModulePayload>\(session, active\.path\)/);
    expect(source).toMatch(/nativeErpPost<\{ summary: string \}>\(session, path,/);
  });

  it("keeps review and explicit confirmation steps for sales, procurement, delivery, and import", () => {
    expect(source).toContain('<ReviewSheet');
    expect(source).toContain("idempotencyKey: createNativeIdempotencyKey");
    expect(source).toContain("expectedVersion: version");

    expect(source).toContain('module === "sales"');
    expect(source).toContain('`/api/mobile/sales/${id}`');
    expect(source).toContain('label="Xem lại và xác nhận"');

    expect(source).toContain('module === "procurement"');
    expect(source).toContain('`/api/mobile/procurement/${id}`');

    expect(source).toContain('module === "delivery"');
    expect(source).toContain('"/api/mobile/delivery/workflow"');
    expect(source).toContain('"start_loading"');
    expect(source).toContain('"dispatch"');

    expect(source).toContain('module === "import"');
    expect(source).toContain('`/api/mobile/import/${id}`');
    expect(source).toContain('"resolveIssue"');
  });

  it("filters sensitive modules by both role and module grant", () => {
    const navigationSource = readFileSync(join(process.cwd(), "lib", "role-navigation.ts"), "utf8");
    expect(navigationSource).toContain("module.roles.includes(role)");
    expect(navigationSource).toContain("grants.has(module.id)");
    expect(source).toContain("getNativeModulesForSession(session.user.role, session.user.moduleIds)");
  });

  it("opens each allowed module as a nested native screen with a 48px back action", () => {
    expect(source).toContain("if (!activeId) return");
    expect(source).toContain('label="Về danh sách nghiệp vụ"');
    expect(source).toContain("setActiveId(module.id)");
    expect(source).toContain("directoryBack: { alignSelf: \"flex-start\", minHeight: 48 }");
  });

  it("keeps native admin invites bounded, reviewed, and free of invitation secrets", () => {
    const adminWorkflow = source.slice(source.indexOf("function AdminWorkflow"), source.indexOf("function UnavailableWorkflow"));

    expect(adminWorkflow).toContain('action: "invite"');
    expect(adminWorkflow).toContain('nativeErpPost<{ summary?: string }>(session, "/api/mobile/admin"');
    expect(adminWorkflow).toContain("expectedRevision: payload.revision");
    expect(adminWorkflow).toContain("reauthPassword: values.reauthPassword");
    expect(adminWorkflow).toContain('idempotencyKey: createNativeIdempotencyKey("mobile-admin")');
    expect(adminWorkflow).toContain("setReview({ title:");

    expect(source).toContain('const inviteRoleOptions = ["accountant", "sales", "warehouse", "dispatcher", "supervisor", "viewer"]');
    for (const unsafeRole of ["owner", "administrator", "driver", "worker", "customer", "supplier"]) {
      expect(source.slice(source.indexOf("const inviteRoleOptions"), source.indexOf("function reportSummary"))).not.toContain(`"${unsafeRole}"`);
    }

    expect(adminWorkflow).toContain("nativeErpPost<{ summary?: string }>");
    expect(adminWorkflow).toContain("result.summary");
    for (const forbiddenInviteSecret of [/\binvitationToken\b/i, /\binviteToken\b/i, /\binviteUrl\b/i, /\bactivation(?:Url|Link)\b/i, /\btemporaryPassword\b/i, /\bpasswordResponse\b/i]) {
      expect(adminWorkflow).not.toMatch(forbiddenInviteSecret);
    }
    for (const forbiddenBoundary of [/\breact-native-webview\b/, /\bSecureErpWebView\b/, /\bexpo-web-browser\b/, /\bLinking\.openURL\b/, /\/api\/mobile\/bridge\b/]) {
      expect(adminWorkflow).not.toMatch(forbiddenBoundary);
    }
  });
});
