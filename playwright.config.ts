import { defineConfig } from "@playwright/test";

const viewports = [
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
  { width: 375, height: 812 },
  { width: 360, height: 800 }
];

const remoteBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim();

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: /authenticated-ux\.spec\.ts/,
  ...(remoteBaseUrl ? {
    snapshotPathTemplate: "{testDir}/__screenshots__/staging/{projectName}/{testFilePath}/{arg}{ext}"
  } : {}),
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "output/playwright-report" }]],
  use: {
    baseURL: remoteBaseUrl ?? "http://127.0.0.1:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  },
  projects: viewports.map((viewport) => ({
    name: "chromium-" + viewport.width,
    use: { browserName: "chromium", viewport }
  })),
  webServer: remoteBaseUrl ? undefined : {
    command: "npm run dev -- --webpack --hostname 127.0.0.1 --port 3000",
    url: "http://127.0.0.1:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
