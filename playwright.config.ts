import { defineConfig } from "@playwright/test";

const viewports = [320, 375, 390, 768, 1024, 1280, 1440, 1920];

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: /authenticated-ux\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "output/playwright-report" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  },
  projects: viewports.map((width) => ({
    name: "chromium-" + width,
    use: { browserName: "chromium", viewport: { width, height: width < 768 ? 844 : 1000 } }
  })),
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: "npm run dev",
    url: "http://127.0.0.1:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
