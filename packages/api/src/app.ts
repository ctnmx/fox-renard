import {
  type Core,
  commentSorts,
  hyvorStatuses,
  listedStatuses,
  voteDirections,
} from "@fox-renard/core";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono, type ValidationTargets } from "hono";
import type { GetConnInfo } from "hono/conninfo";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
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

/**
 * The cookie that holds a Member's console session. Its `__Host-` prefix
 * keeps it on the console's own host, and over HTTPS only.
 */
const sessionCookie = "fox-renard-session";

/** The token of the request's console session, if it has one. */
function sessionTokenOf(c: Context): string | null {
  return getCookie(c, sessionCookie, "host") ?? null;
}

/** A Hyvor Talk Comment as the import tool sends it (ADR-0007). */
const hyvorComment = z.object({
  id: z.number().int().positive(),
  createdAt: z.number().int().nonnegative(),
  status: z.enum(hyvorStatuses),
  bodyHtml: z.string().max(100_000),
  parentId: z.number().int().positive().nullable(),
  author: z.object({
    type: z.enum(["hyvor", "sso"]).nullable(),
    id: z.number().int().nullable(),
    name: z.string().max(1000),
    email: z.string().max(254).nullable(),
  }),
});

/**
 * The Hyvor threads of one import request. The import tool sends a few at a
 * time, so that each request stays within the Worker's CPU limit.
 */
const hyvorImport = z.object({
  threads: z
    .array(
      z.object({
        page: z.object({
          key: z.string().min(1).max(500),
          url: z.url({ protocol: /^https?$/ }).max(2048),
          title: z.string().max(10_000),
        }),
        comments: z.array(hyvorComment).min(1).max(200),
      }),
    )
    .max(100),
});

/** The status each of Core's refusals answers with. */
const refusals = {
  "site-not-found": 404,
  "domain-not-allowed": 403,
  "page-not-found": 404,
  "bot-check-failed": 403,
  "posted-too-soon": 422,
  "comment-not-found": 404,
  "reaction-option-not-found": 422,
  "invalid-display-name": 422,
  "empty-comment": 422,
  "comment-too-long": 422,
  "magic-link-invalid": 410,
  "rate-limited": 429,
  "sign-in-link-invalid": 410,
  "signed-out": 401,
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
  /** The client's IP address, which Core only ever hashes (ADR-0006). */
  const clientIpOf = (c: Context) => getConnInfo(c).remote.address ?? null;

  return (
    new Hono()
      .use("/v1/sites/*", publicCors)
      .get(
        "/v1/sites/:siteId/pages/:pageKey/widget",
        validate("param", pageParams),
        validate(
          "query",
          z.object({
            url: z.url({ protocol: /^https?$/ }).max(2048),
            title: z.string().max(10_000),
            sort: z.enum(commentSorts).optional(),
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
            sort: sort ?? null,
          });
          if (result.outcome !== "loaded") return refuse(c, result.outcome);
          const { page, reactionSet, reaction, commenter, comments } = result;
          return c.json(
            {
              page,
              reactionSet,
              reaction,
              commenter,
              sort: result.sort,
              comments,
            },
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
            clientIp: clientIpOf(c),
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
            botCheck: z.string().max(10_000),
            honeypot: z.string().max(1000).optional(),
            displayName: z.string().max(1000),
            text: z.string().max(20_000),
            replyTo: z.uuid().optional(),
            email: z.email().max(254).optional(),
          }),
        ),
        async (c) => {
          const { siteId, pageKey } = c.req.valid("param");
          const { authorization: browserToken } = c.req.valid("header");
          const { botCheck, honeypot, displayName, text, replyTo, email } =
            c.req.valid("json");

          const result = await core.postComment({
            siteId,
            domain: requestingDomain(c.req.header("Origin")),
            pageKey,
            browserToken: browserToken ?? null,
            clientIp: clientIpOf(c),
            botCheck,
            honeypot: honeypot ?? "",
            displayName,
            text,
            replyTo: replyTo ?? null,
            email: email ?? null,
          });
          if (result.outcome !== "posted") return refuse(c, result.outcome);
          const { commenter, magicLinkSent, comment, topLevelCommentId } =
            result;
          return c.json(
            {
              browserToken: result.browserToken,
              commenter,
              magicLinkSent,
              comment,
              topLevelCommentId,
            },
            201,
          );
        },
      )
      .get(
        "/v1/sites/:siteId/bot-challenge",
        validate("param", z.object({ siteId: z.uuid() })),
        async (c) => {
          const result = await core.issueBotChallenge({
            siteId: c.req.valid("param").siteId,
            domain: requestingDomain(c.req.header("Origin")),
          });
          if (result.outcome !== "issued") return refuse(c, result.outcome);
          // Each challenge is solved once only.
          c.header("Cache-Control", "no-store");
          const { challenge, postableIn } = result;
          return c.json({ challenge, postableIn }, 200);
        },
      )
      .post(
        "/v1/sites/:siteId/verifications",
        validate("param", z.object({ siteId: z.uuid() })),
        validate("header", browserTokenHeader),
        validate("json", z.object({ token: z.string().max(128) })),
        async (c) => {
          const { siteId } = c.req.valid("param");
          const { authorization: browserToken } = c.req.valid("header");
          const { token } = c.req.valid("json");

          const result = await core.followMagicLink({
            siteId,
            domain: requestingDomain(c.req.header("Origin")),
            browserToken: browserToken ?? null,
            token,
          });
          if (result.outcome !== "followed") return refuse(c, result.outcome);
          return c.json(
            { browserToken: result.browserToken, commenter: result.commenter },
            200,
          );
        },
      )
      .put(
        "/v1/sites/:siteId/pages/:pageKey/comments/:commentId/vote",
        validate("param", pageParams.extend({ commentId: z.uuid() })),
        validate("header", browserTokenHeader),
        validate("json", z.object({ vote: z.enum(voteDirections).nullable() })),
        async (c) => {
          const { siteId, pageKey, commentId } = c.req.valid("param");
          const { authorization: browserToken } = c.req.valid("header");
          const { vote } = c.req.valid("json");

          const result = await core.vote({
            siteId,
            domain: requestingDomain(c.req.header("Origin")),
            pageKey,
            browserToken: browserToken ?? null,
            clientIp: clientIpOf(c),
            commentId,
            vote,
          });
          if (result.outcome !== "voted") return refuse(c, result.outcome);
          return c.json(
            {
              browserToken: result.browserToken,
              voteCounts: result.voteCounts,
              vote: result.vote,
              verified: result.verified,
            },
            200,
          );
        },
      )
      // The console's endpoints answer the console's own origin only: they
      // allow no other through CORS, and its session cookie goes to no other.
      .use("/v1/console/*", async (c, next) => {
        await next();
        // Each answer belongs to one Member.
        c.header("Cache-Control", "private, no-store");
      })
      .post(
        "/v1/console/sign-in-links",
        validate("json", z.object({ email: z.email().max(254) })),
        async (c) => {
          await core.requestSignInLink(c.req.valid("json"));
          // The same answer whether or not a Member has this address.
          return c.body(null, 202);
        },
      )
      .post(
        "/v1/console/sessions",
        validate("json", z.object({ token: z.string().max(128) })),
        async (c) => {
          const result = await core.signIn(c.req.valid("json"));
          if (result.outcome !== "signed-in") return refuse(c, result.outcome);
          setCookie(c, sessionCookie, result.sessionToken, {
            prefix: "host",
            httpOnly: true,
            sameSite: "Strict",
            expires: result.expiresAt,
          });
          return c.body(null, 204);
        },
      )
      .delete("/v1/console/sessions/current", async (c) => {
        await core.signOut({ sessionToken: sessionTokenOf(c) });
        deleteCookie(c, sessionCookie, { prefix: "host" });
        return c.body(null, 204);
      })
      .get("/v1/console/home", async (c) => {
        const result = await core.consoleHome({
          sessionToken: sessionTokenOf(c),
        });
        if (result.outcome !== "home") return refuse(c, result.outcome);
        const { member, organization, sites } = result;
        return c.json({ member, organization, sites }, 200);
      })
      .get(
        "/v1/console/sites/:siteId/pages",
        validate("param", z.object({ siteId: z.uuid() })),
        async (c) => {
          const result = await core.consolePages({
            sessionToken: sessionTokenOf(c),
            siteId: c.req.valid("param").siteId,
          });
          if (result.outcome !== "listed") return refuse(c, result.outcome);
          return c.json({ pages: result.pages }, 200);
        },
      )
      .get(
        "/v1/console/sites/:siteId/comments",
        validate("param", z.object({ siteId: z.uuid() })),
        validate(
          "query",
          z.object({
            status: z.enum(listedStatuses),
            page: z.string().min(1).max(500).optional(),
          }),
        ),
        async (c) => {
          const { status, page } = c.req.valid("query");
          const result = await core.consoleComments({
            sessionToken: sessionTokenOf(c),
            siteId: c.req.valid("param").siteId,
            status,
            pageKey: page ?? null,
          });
          if (result.outcome !== "listed") return refuse(c, result.outcome);
          return c.json({ comments: result.comments }, 200);
        },
      )
      .post(
        "/v1/console/sites/:siteId/hyvor-import",
        validate("param", z.object({ siteId: z.uuid() })),
        validate("json", hyvorImport),
        async (c) => {
          const result = await core.importHyvor({
            sessionToken: sessionTokenOf(c),
            siteId: c.req.valid("param").siteId,
            threads: c.req.valid("json").threads,
          });
          if (result.outcome !== "imported") return refuse(c, result.outcome);
          const { imported, skipped, alreadyPresent } = result;
          return c.json({ imported, skipped, alreadyPresent }, 200);
        },
      )
      .post(
        "/v1/console/comments/:commentId/approve",
        validate("param", z.object({ commentId: z.uuid() })),
        async (c) => {
          const result = await core.approveComment({
            sessionToken: sessionTokenOf(c),
            commentId: c.req.valid("param").commentId,
          });
          if (result.outcome !== "approved") return refuse(c, result.outcome);
          return c.body(null, 204);
        },
      )
      .post(
        "/v1/console/comments/:commentId/spam",
        validate("param", z.object({ commentId: z.uuid() })),
        async (c) => {
          const result = await core.markAsSpam({
            sessionToken: sessionTokenOf(c),
            commentId: c.req.valid("param").commentId,
          });
          if (result.outcome !== "marked-as-spam") {
            return refuse(c, result.outcome);
          }
          return c.body(null, 204);
        },
      )
      .delete(
        "/v1/console/comments/:commentId",
        validate("param", z.object({ commentId: z.uuid() })),
        async (c) => {
          const result = await core.deleteComment({
            sessionToken: sessionTokenOf(c),
            commentId: c.req.valid("param").commentId,
          });
          if (result.outcome !== "deleted") return refuse(c, result.outcome);
          return c.body(null, 204);
        },
      )
  );
}

export type App = ReturnType<typeof createApp>;
