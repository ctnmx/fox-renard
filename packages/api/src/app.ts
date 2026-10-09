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

const pageParams = z.object({
  siteId: z.uuid(),
  pageKey: z.string().min(1).max(500),
});

/** The token a browser holds for the Site, sent once the API has issued one. */
const browserTokenHeader = z.object({
  authorization: z
    .string()
    .regex(/^Bearer [\w-]{1,128}$/)
    .transform((value) => value.slice("Bearer ".length))
    .optional(),
});

// Public endpoints carry no credentials and refuse other domains themselves,
// so any page may read what they answer.
const publicCors = cors();

export function createApp(core: Core) {
  return new Hono()
    .use("/v1/*", publicCors)
    .get(
      "/v1/sites/:siteId/pages/:pageKey/widget",
      validate("param", pageParams),
      validate(
        "query",
        z.object({
          url: z.url({ protocol: /^https?$/ }).max(2048),
          title: z.string().max(10_000),
        }),
      ),
      validate("header", browserTokenHeader),
      async (c) => {
        const { siteId, pageKey } = c.req.valid("param");
        const { url, title } = c.req.valid("query");
        const { authorization: browserToken } = c.req.valid("header");
        // Each browser sees its own Reaction.
        c.header("Vary", "Origin, Authorization");

        const result = await core.loadWidget({
          siteId,
          domain: requestingDomain(c.req.header("Origin")),
          pageKey,
          url,
          title,
          browserToken: browserToken ?? null,
        });
        switch (result.outcome) {
          case "site-not-found":
            return c.json({ error: "site_not_found" }, 404);
          case "domain-not-allowed":
            return c.json({ error: "domain_not_allowed" }, 403);
          case "loaded": {
            const { page, reactionSet, reaction } = result;
            return c.json({ page, reactionSet, reaction }, 200);
          }
        }
      },
    )
    .put(
      "/v1/sites/:siteId/pages/:pageKey/reaction",
      validate("param", pageParams),
      validate("header", browserTokenHeader),
      validate("json", z.object({ optionId: z.uuid().nullable() })),
      async (c) => {
        const { siteId, pageKey } = c.req.valid("param");
        const { authorization: browserToken } = c.req.valid("header");
        const { optionId } = c.req.valid("json");

        const result = await core.react({
          siteId,
          domain: requestingDomain(c.req.header("Origin")),
          pageKey,
          browserToken: browserToken ?? null,
          optionId,
        });
        switch (result.outcome) {
          case "site-not-found":
            return c.json({ error: "site_not_found" }, 404);
          case "domain-not-allowed":
            return c.json({ error: "domain_not_allowed" }, 403);
          case "page-not-found":
            return c.json({ error: "page_not_found" }, 404);
          case "reaction-option-not-found":
            return c.json({ error: "reaction_option_not_found" }, 422);
          case "reacted": {
            const { browserToken, reactionSet, reaction } = result;
            return c.json({ browserToken, reactionSet, reaction }, 200);
          }
        }
      },
    );
}

export type App = ReturnType<typeof createApp>;
