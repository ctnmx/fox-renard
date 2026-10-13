import { readFile } from "node:fs/promises";
import { rectoVerso } from "@fox-renard/db";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { siteOrigin } from "./addresses";

const siteFolder = new URL("../site/", import.meta.url);

/**
 * Serves Recto Verso's route sheets on `siteOrigin`, each embedding the Widget
 * from `apiOrigin`: the local demo or a deployment of Fox Renard.
 */
export function serveRouteSheet(apiOrigin: string): void {
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
    fetch: routeSheetSite.fetch,
    port: Number(new URL(siteOrigin).port),
  });
}
