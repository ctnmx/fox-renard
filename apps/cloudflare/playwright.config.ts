import { apiOrigin, siteOrigin } from "@fox-renard/demo/addresses";
import { defineConfig, devices } from "@playwright/test";

/**
 * The deployment the smoke check loads the route sheet against, and its
 * console against FOX_RENARD_CONSOLE_ORIGIN when it answers elsewhere.
 * Without one, Seam 3 runs the Worker locally on the demo's API origin.
 */
const deploymentOrigin = process.env.FOX_RENARD_API_ORIGIN;

/** The PostgreSQL that Hyperdrive's binding reaches when the Worker runs locally. */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!deploymentOrigin && !testDatabaseUrl) {
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
    // Brevo refuses this key, so Seam 3 sends no email: a Member's email
    // about a new Comment fails, and the Comment posts all the same.
    "--var BREVO_API_KEY:seam-3-sends-no-email",
    "--var ALTCHA_HMAC_KEY:seam-3-altcha-key",
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
  globalSetup: deploymentOrigin ? undefined : "./tests/global-setup.ts",
  use: {
    baseURL: siteOrigin,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    ...(deploymentOrigin ? [] : [worker]),
    {
      command: "pnpm --filter @fox-renard/demo route-sheet",
      url: siteOrigin,
      env: { FOX_RENARD_API_ORIGIN: deploymentOrigin ?? apiOrigin },
      reuseExistingServer: !process.env.CI,
    },
  ],
});
