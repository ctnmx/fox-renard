import { apiOrigin, siteOrigin } from "@fox-renard/demo/addresses";
import { defineConfig, devices } from "@playwright/test";

/**
 * The deployment the smoke check loads the route sheet against. Without one,
 * Seam 3 runs the Worker locally on the demo's API origin.
 */
const deployment = process.env.FOX_RENARD_API_ORIGIN;

/** The PostgreSQL that Hyperdrive's binding reaches when the Worker runs locally. */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!deployment && !testDatabaseUrl) {
  throw new Error(
    "Seam 3 runs the Worker on PostgreSQL: set TEST_DATABASE_URL, such as postgres://postgres:postgres@localhost:5432/postgres.",
  );
}

/** Starts the Worker in workerd, as Cloudflare runs it. */
const worker = {
  command: [
    "wrangler dev",
    `--port ${new URL(apiOrigin).port}`,
    "--test-scheduled",
    "--show-interactive-dev-session=false",
    "--var FINGERPRINT_SECRET:seam-3-fingerprint-secret",
    // Seam 3 sends no email.
    "--var BREVO_API_KEY:seam-3-sends-no-email",
  ].join(" "),
  url: `${apiOrigin}/widget.js`,
  env: {
    CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
      testDatabaseUrl ?? "",
    WRANGLER_SEND_METRICS: "false",
  },
  reuseExistingServer: !process.env.CI,
};

export default defineConfig({
  testDir: "tests",
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  globalSetup: deployment ? undefined : "./tests/global-setup.ts",
  use: {
    baseURL: siteOrigin,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    ...(deployment ? [] : [worker]),
    {
      command: "pnpm --filter @fox-renard/demo route-sheet",
      url: siteOrigin,
      env: { FOX_RENARD_API_ORIGIN: deployment ?? apiOrigin },
      reuseExistingServer: !process.env.CI,
    },
  ],
});
