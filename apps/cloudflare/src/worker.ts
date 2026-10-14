// The Cloudflare adapter: the Worker that runs Fox Renard in production.
import { createAltchaBotCheck } from "@fox-renard/altcha";
import { createApp } from "@fox-renard/api";
import { createBrevoEmailSender } from "@fox-renard/brevo";
import { createCore, type PhotoStore } from "@fox-renard/core";
import { createStore } from "@fox-renard/db";
import { connectPostgres } from "@fox-renard/db/postgres";
import { getConnInfo } from "@hono/cloudflare-workers";

/** What Cloudflare gives the Worker: the bindings and vars of wrangler.jsonc, and its secrets. */
interface Env {
  HYPERDRIVE: Hyperdrive;
  /** The secret Core derives each day's fingerprint secret from (ADR-0006). */
  FINGERPRINT_SECRET: string;
  BREVO_API_KEY: string;
  /** The address on Fox Renard's sender subdomain that every email comes from. */
  EMAIL_SENDER_ADDRESS: string;
  /** The secret that signs the bot check's challenges. */
  ALTCHA_HMAC_KEY: string;
  /**
   * Where the console answers, for the links emailed to Members. Previews
   * leave it unset: they serve the console on their own address.
   */
  CONSOLE_ORIGIN?: string;
}

function notWiredYet(piece: string) {
  return () => Promise.reject(new Error(`${piece} is not wired yet.`));
}

// Core stores no Photo yet: #12 wires an R2 bucket for them.
const photos: PhotoStore = {
  put: notWiredYet("The Photo store (#12)"),
  get: notWiredYet("The Photo store (#12)"),
  delete: notWiredYet("The Photo store (#12)"),
};

/** Core on Cloudflare's adapters, with a database connection that `close` ends. */
function openCore(env: Env, consoleOrigin: string) {
  // A Worker cannot share a connection between requests; Hyperdrive pools
  // the connections to the database instead.
  const database = connectPostgres(env.HYPERDRIVE.connectionString);
  const core = createCore({
    store: createStore(database.db),
    clock: { now: () => new Date() },
    email: createBrevoEmailSender({
      apiKey: env.BREVO_API_KEY,
      senderAddress: env.EMAIL_SENDER_ADDRESS,
    }),
    photos,
    botCheck: createAltchaBotCheck({ hmacKey: env.ALTCHA_HMAC_KEY }),
    fingerprintSecret: { current: async () => env.FINGERPRINT_SECRET },
    consoleOrigin,
  });
  return { core, close: database.close };
}

export default {
  async fetch(request, env, ctx) {
    // Cloudflare routes a request to the Worker by its host, so the host is
    // always one of the Worker's own, which also serve the console.
    const { core, close } = openCore(
      env,
      env.CONSOLE_ORIGIN ?? new URL(request.url).origin,
    );
    try {
      // Cloudflare tells the client's IP address in CF-Connecting-IP.
      return await createApp(core, { getConnInfo }).fetch(request, env, ctx);
    } finally {
      ctx.waitUntil(close());
    }
  },

  // Every hour, so no fingerprint outlives 24 hours (ADR-0006), an email
  // nobody verified goes within an hour of its magic link expiring, and the
  // bot check forgets the challenges that expired.
  async scheduled(_controller, env) {
    // The erasure emails nobody, so it needs no console origin.
    const { core, close } = openCore(env, env.CONSOLE_ORIGIN ?? "");
    try {
      await core.eraseExpired();
    } finally {
      await close();
    }
  },
} satisfies ExportedHandler<Env>;
