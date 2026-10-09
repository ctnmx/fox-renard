// The local demo: Fox Renard on an in-memory database seeded with Recto Verso,
// and a route sheet that embeds the Widget. Seam 2 tests run against it.
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
import { Hono } from "hono";
import { apiOrigin, siteOrigin } from "./addresses";

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

const foxRenard = new Hono()
  .get("/widget.js", async (c) =>
    c.body(await readFile(widgetScript), 200, {
      "Content-Type": "text/javascript; charset=utf-8",
    }),
  )
  .route("/", createApp(core));

const siteFolder = new URL("../site/", import.meta.url);

const routeSheetSite = new Hono()
  .get("/", async (c) => {
    const html = await readFile(
      new URL("route-sheet.html", siteFolder),
      "utf8",
    );
    return c.html(
      html
        .replaceAll("{{API_ORIGIN}}", apiOrigin)
        .replaceAll("{{SITE_ID}}", rectoVerso.siteId),
    );
  })
  .get("/:stylesheet{[a-z-]+\\.css}", async (c) =>
    c.body(
      await readFile(new URL(c.req.param("stylesheet"), siteFolder)),
      200,
      { "Content-Type": "text/css; charset=utf-8" },
    ),
  );

serve({ fetch: foxRenard.fetch, port: Number(new URL(apiOrigin).port) });
serve({ fetch: routeSheetSite.fetch, port: Number(new URL(siteOrigin).port) });
console.log(`Route sheet on ${siteOrigin}, API and Widget on ${apiOrigin}`);
