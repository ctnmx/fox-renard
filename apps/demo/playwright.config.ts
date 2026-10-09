import { defineConfig, devices } from "@playwright/test";
import { siteOrigin } from "./src/addresses";

export default defineConfig({
  testDir: "tests",
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: siteOrigin,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm start",
    url: siteOrigin,
    reuseExistingServer: !process.env.CI,
  },
});
