import type { Core } from "@fox-renard/core";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono, type ValidationTargets } from "hono";
import type { GetConnInfo } from "hono/conninfo";
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

/** The status each of Core's refusals answers with. */
const refusals = {
  "site-not-found": 404,
  "domain-not-allowed": 403,
  "page-not-found": 404,
  "comment-not-found": 404,
  "reaction-option-not-found": 422,
  "invalid-display-name": 422,
  "empty-comment": 422,
  "comment-too-long": 422,
  "rate-limited": 429,
} as const;

/** Answers a refusal with its status and an error code such as `site_not_found`. */
function refuse(c: Context, outcome: keyof typeof refusals) {
  return c.json({ error: outcome.replaceAll("-", "_") }, refusals[outcome]);
}

export interface Platform {
  /** Tells the client's IP address, which only the platform knows. */
  getConnInfo: GetConnInfo;
}

export function createApp(core: Core, { getConnInfo }: Platform) {
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
          sort: z.enum(["top", "newest", "oldest"]).default("top"),
        }),
      ),
      validate("header", browserTokenHeader),
      async (c) => {
        const { siteId, pageKey } = c.req.valid("param");
        const { url, title, sort } = c.req.valid("query");
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
          sort,
        });
        if (result.outcome !== "loaded") return refuse(c, result.outcome);
        const { page, reactionSet, reaction, commenter, comments } = result;
        return c.json(
          { page, reactionSet, reaction, commenter, comments },
          200,
        );
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
          clientIp: getConnInfo(c).remote.address ?? null,
          optionId,
        });
        if (result.outcome !== "reacted") return refuse(c, result.outcome);
        const { reactionSet, reaction } = result;
        return c.json(
          { browserToken: result.browserToken, reactionSet, reaction },
          200,
        );
      },
    )
    .post(
      "/v1/sites/:siteId/pages/:pageKey/comments",
      validate("param", pageParams),
      validate("header", browserTokenHeader),
      validate(
        "json",
        z.object({
          displayName: z.string().max(1000),
          text: z.string().max(20_000),
          replyTo: z.uuid().optional(),
        }),
      ),
      async (c) => {
        const { siteId, pageKey } = c.req.valid("param");
        const { authorization: browserToken } = c.req.valid("header");
        const { displayName, text, replyTo } = c.req.valid("json");

        const result = await core.postComment({
          siteId,
          domain: requestingDomain(c.req.header("Origin")),
          pageKey,
          browserToken: browserToken ?? null,
          displayName,
          text,
          replyTo: replyTo ?? null,
        });
        if (result.outcome !== "posted") return refuse(c, result.outcome);
        const { commenter, comment, topLevelCommentId } = result;
        return c.json(
          {
            browserToken: result.browserToken,
            commenter,
            comment,
            topLevelCommentId,
          },
          201,
        );
      },
    )
    .put(
      "/v1/sites/:siteId/pages/:pageKey/comments/:commentId/vote",
      validate("param", pageParams.extend({ commentId: z.uuid() })),
      validate("header", browserTokenHeader),
      validate("json", z.object({ vote: z.enum(["up", "down"]).nullable() })),
      async (c) => {
        const { siteId, pageKey, commentId } = c.req.valid("param");
        const { authorization: browserToken } = c.req.valid("header");
        const { vote } = c.req.valid("json");

        const result = await core.vote({
          siteId,
          domain: requestingDomain(c.req.header("Origin")),
          pageKey,
          browserToken: browserToken ?? null,
          clientIp: getConnInfo(c).remote.address ?? null,
          commentId,
          vote,
        });
        if (result.outcome !== "voted") return refuse(c, result.outcome);
        const { voteCounts, vote: held } = result;
        return c.json(
          { browserToken: result.browserToken, voteCounts, vote: held },
          200,
        );
      },
    );
}

export type App = ReturnType<typeof createApp>;
