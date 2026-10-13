// The Cloudflare adapter: the Worker that runs Fox Renard in production.
import { createApp } from "@fox-renard/api";
import { createBrevoEmailSender } from "@fox-renard/brevo";
import { type BotCheck, createCore, type PhotoStore } from "@fox-renard/core";
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
}

function notWiredYet(piece: string) {
  return () => Promise.reject(new Error(`${piece} is not wired yet.`));
}

// Core uses neither yet: #12 wires an R2 bucket for Photos, and #9 the ALTCHA
// key for the bot check.
const photos: PhotoStore = {
  put: notWiredYet("The Photo store (#12)"),
  get: notWiredYet("The Photo store (#12)"),
  delete: notWiredYet("The Photo store (#12)"),
};
const botCheck: BotCheck = { verify: notWiredYet("The bot check (#9)") };

/** Core on Cloudflare's adapters, with a database connection that `close` ends. */
function openCore(env: Env) {
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
    botCheck,
    fingerprintSecret: { current: async () => env.FINGERPRINT_SECRET },
  });
  return { core, close: database.close };
}

export default {
  async fetch(request, env, ctx) {
    const { core, close } = openCore(env);
    try {
      // Cloudflare tells the client's IP address in CF-Connecting-IP.
      return await createApp(core, { getConnInfo }).fetch(request, env, ctx);
    } finally {
      ctx.waitUntil(close());
    }
  },

  // Every hour, so no fingerprint outlives 24 hours (ADR-0006), and an email
  // nobody verified goes within an hour of its magic link expiring.
  async scheduled(_controller, env) {
    const { core, close } = openCore(env);
    try {
      await core.eraseExpired();
    } finally {
      await close();
    }
  },
} satisfies ExportedHandler<Env>;
