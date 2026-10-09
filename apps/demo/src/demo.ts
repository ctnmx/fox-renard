import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createApp } from "@fox-renard/api";
import { createCore } from "@fox-renard/core";
import {
  EmailOutbox,
  FixedFingerprintSecret,
  InMemoryPhotoStore,
  StubBotCheck,
} from "@fox-renard/core/fakes";
import { createStore, rectoVerso, seed } from "@fox-renard/db";
import { createPgliteDatabase } from "@fox-renard/db/pglite";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono } from "hono";
import { apiOrigin, siteOrigin } from "./addresses";

/**
 * Starts the local demo: Fox Renard on an in-memory database seeded with
 * Recto Verso, and a route sheet that embeds the Widget.
 */
export async function startDemo(): Promise<void> {
  const db = await createPgliteDatabase();
  await seed(db, { memberEmail: "membre@example.com" });

  const core = createCore({
    store: createStore(db),
    clock: { now: () => new Date() },
    email: new EmailOutbox(),
    photos: new InMemoryPhotoStore(),
    botCheck: new StubBotCheck(),
    fingerprintSecret: new FixedFingerprintSecret(),
  });

  const widgetScript = fileURLToPath(
    import.meta.resolve("@fox-renard/widget/widget.js"),
  );

  const apiAndWidgetScript = new Hono()
    .get("/widget.js", async (c) =>
      c.body(await readFile(widgetScript), 200, {
        "Content-Type": "text/javascript; charset=utf-8",
      }),
    )
    .route("/", createApp(core, { getConnInfo }));

  const siteFolder = new URL("../site/", import.meta.url);

  // Like Recto Verso's Webflow template, every route sheet embeds the Widget
  // with the Page Key `article-{slug}`.
  async function routeSheet(slug: string) {
    const html = await readFile(
      new URL("route-sheet.html", siteFolder),
      "utf8",
    );
    return html
      .replaceAll("{{API_ORIGIN}}", apiOrigin)
      .replaceAll("{{SITE_ID}}", rectoVerso.siteId)
      .replaceAll("{{PAGE_KEY}}", `article-${slug}`);
  }

  const routeSheetSite = new Hono()
    .get("/", async (c) => c.html(await routeSheet("le-tour-du-mont-aiguille")))
    .get("/article/:slug{[a-z0-9-]+}", async (c) =>
      c.html(await routeSheet(c.req.param("slug"))),
    )
    .get("/:stylesheet{[a-z-]+\\.css}", async (c) =>
      c.body(
        await readFile(new URL(c.req.param("stylesheet"), siteFolder)),
        200,
        { "Content-Type": "text/css; charset=utf-8" },
      ),
    );

  serve({
    fetch: apiAndWidgetScript.fetch,
    port: Number(new URL(apiOrigin).port),
  });
  serve({
    fetch: routeSheetSite.fetch,
    port: Number(new URL(siteOrigin).port),
  });
}
