import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createAltchaBotCheck } from "@fox-renard/altcha";
import { createApp } from "@fox-renard/api";
import { createCore } from "@fox-renard/core";
import {
  EmailOutbox,
  FixedFingerprintSecret,
  InMemoryPhotoStore,
} from "@fox-renard/core/fakes";
import { createStore, seed } from "@fox-renard/db";
import { createPgliteDatabase } from "@fox-renard/db/pglite";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono } from "hono";
import { apiOrigin } from "./addresses";
import { serveRouteSheet } from "./route-sheet";

/**
 * Starts the local demo: Fox Renard on an in-memory database seeded with
 * Recto Verso, and a route sheet that embeds the Widget.
 */
export async function startDemo(): Promise<void> {
  const db = await createPgliteDatabase();
  await seed(db, { memberEmail: "membre@example.com" });

  const outbox = new EmailOutbox();
  const core = createCore({
    store: createStore(db),
    clock: { now: () => new Date() },
    email: outbox,
    photos: new InMemoryPhotoStore(),
    // The real bot check, so that Seam 2 drives the Widget's solver.
    botCheck: createAltchaBotCheck({ hmacKey: "demo-altcha-key" }),
    fingerprintSecret: new FixedFingerprintSecret(),
  });

  // Like the platform in production, erase what has expired every hour:
  // fingerprints (ADR-0006), magic links with their emails, and the bot
  // check's spent challenges.
  setInterval(
    () => core.eraseExpired().catch(console.error),
    60 * 60 * 1000,
  ).unref();

  const widgetScript = fileURLToPath(
    import.meta.resolve("@fox-renard/widget/widget.js"),
  );

  const apiAndWidgetScript = new Hono()
    .get("/widget.js", async (c) =>
      c.body(await readFile(widgetScript), 200, {
        "Content-Type": "text/javascript; charset=utf-8",
      }),
    )
    // The emails Fox Renard sent, so that Seam 2 can follow a magic link.
    .get("/outbox", (c) => c.json(outbox.sent))
    .route("/", createApp(core, { getConnInfo }));

  serve({
    fetch: apiAndWidgetScript.fetch,
    port: Number(new URL(apiOrigin).port),
  });
  serveRouteSheet(apiOrigin);
}
