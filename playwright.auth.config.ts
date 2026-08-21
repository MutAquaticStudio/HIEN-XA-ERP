import { defineConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";

const remoteBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim();
if (!remoteBaseUrl) {
  const fixtureRoot = join(tmpdir(), `hien-xa-erp-v2-auth-e2e-${process.pid}`);
  Object.assign(process.env, {
    ERP_V2_LOCAL_QA_ROOT: fixtureRoot,
    ERP_SESSION_SECRET: randomBytes(32).toString("base64url"),
    ERP_SESSION_COOKIE_SECURE: "false",
    VLXD_DATA_FILE: join(fixtureRoot, "operations.json"),
    VLXD_IDENTITY_FILE: join(fixtureRoot, "identity.json"),
    VLXD_COMMUNICATION_DATA_FILE: join(fixtureRoot, "communications.json"),
    VLXD_PUSH_DATA_FILE: join(fixtureRoot, "push-notifications.json"),
    VLXD_TRACKING_DATA_FILE: join(fixtureRoot, "delivery-tracking.json"),
    VLXD_ATTACHMENT_DIR: join(fixtureRoot, "attachments")
  });
}
const webServerEnvironment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
);

const viewports = [
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
  { width: 375, height: 812 },
  { width: 360, height: 800 }
];

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/local-auth-global-setup.ts",
  globalTeardown: "./tests/e2e/local-auth-global-teardown.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 1,
  expect: { timeout: remoteBaseUrl ? 30_000 : 5_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "output/playwright-auth-report" }]],
  use: {
    baseURL: remoteBaseUrl ?? "http://127.0.0.1:3100",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  },
  projects: viewports.map((viewport) => ({
    name: `authenticated-${viewport.width}`,
    use: { browserName: "chromium", viewport }
  })),
  webServer: remoteBaseUrl ? undefined : {
    command: "npm run dev -- --webpack --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: false,
    timeout: 120_000,
    env: webServerEnvironment
  }
});
