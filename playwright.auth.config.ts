import { defineConfig } from "@playwright/test";

const viewports = [390, 768, 1440];

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /authenticated-ux\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: true,
  retries: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "output/playwright-auth-report" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  },
  projects: viewports.map((width) => ({
    name: `authenticated-${width}`,
    use: { browserName: "chromium", viewport: { width, height: width < 768 ? 844 : 1000 } }
  }))
});
