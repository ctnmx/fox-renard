import type { Core } from "@fox-renard/core";
import { zValidator } from "@hono/zod-validator";
import { Hono, type ValidationTargets } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";

function validate<
  Target extends keyof ValidationTargets,
  Schema extends z.ZodType,
>(target: Target, schema: Schema) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) return c.json({ error: "invalid_request" }, 400);
  });
}

/** The domain of the page making a cross-origin request, from its `Origin` header. */
function requestingDomain(origin: string | undefined): string | null {
  if (!origin || !URL.canParse(origin)) return null;
  return new URL(origin).hostname;
}

// Public endpoints carry no credentials and refuse other domains themselves,
// so any page may read what they answer.
const publicCors = cors();

export function createApp(core: Core) {
  return new Hono().use("/v1/*", publicCors).get(
    "/v1/sites/:siteId/pages/:pageKey/widget",
    validate(
      "param",
      z.object({ siteId: z.uuid(), pageKey: z.string().min(1).max(200) }),
    ),
    validate(
      "query",
      z.object({
        url: z.url({ protocol: /^https?$/ }).max(2048),
        title: z.string().max(500),
      }),
    ),
    async (c) => {
      const { siteId, pageKey } = c.req.valid("param");
      const { url, title } = c.req.valid("query");
      const origin = c.req.header("Origin");
      c.header("Vary", "Origin");

      const result = await core.loadWidget({
        siteId,
        domain: requestingDomain(origin),
        pageKey,
        url,
        title,
      });
      switch (result.outcome) {
        case "site-not-found":
          return c.json({ error: "site_not_found" }, 404);
        case "domain-not-allowed":
          return c.json({ error: "domain_not_allowed" }, 403);
        case "loaded": {
          const { page, reactionSet } = result;
          return c.json({ page, reactionSet }, 200);
        }
      }
    },
  );
}

export type App = ReturnType<typeof createApp>;
