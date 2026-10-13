import {
  type CommentSort,
  createCore,
  magicLinkParameter,
  type Vote,
} from "@fox-renard/core";
import {
  ControllableClock,
  EmailOutbox,
  FixedFingerprintSecret,
  InMemoryPhotoStore,
  magicLinkIn,
  StubBotCheck,
} from "@fox-renard/core/fakes";
import {
  createStore,
  type Database,
  rectoVerso,
  type SiteSeed,
  seed,
  seedSite,
} from "@fox-renard/db";
import {
  createPgliteDatabase,
  databaseHolds,
  emptyDatabase,
} from "@fox-renard/db/pglite";
import { testClient } from "hono/testing";
import { createApp } from "../src";

export { rectoVerso };

/**
 * Tests tell the client IP in this header, as Cloudflare does in its own
 * header in production.
 */
export const clientIpHeader = "Test-Client-Ip";

/** A second Organization's Site, to show that Sites stay apart. */
export const anotherSite = {
  name: "Carnets de vélo",
  organizationId: "6c0f8f43-4f4b-4b8e-9a51-0d2b8f6f0c11",
  siteId: "a3e1c2d4-5b6f-4a7b-8c9d-0e1f2a3b4c5d",
  allowedDomains: ["velo.example"],
  reactionSet: {
    prompt: "Cette sortie vous tente ?",
    options: [
      {
        id: "0f5e9a4c-2d3b-4c6a-8e7f-1a2b3c4d5e6f",
        pictoEmoji: "🚲",
        label: "Je pédale",
      },
    ],
  },
} as const satisfies SiteSeed;

/** A Page as the Widget embedded on it reports it. */
export interface WidgetPage {
  siteId: string;
  origin: string;
  pageKey: string;
  url: string;
  title: string;
}

export const routeSheet: WidgetPage = {
  siteId: rectoVerso.siteId,
  origin: "https://www.rectoverso.co",
  pageKey: "article-tour-du-mont-aiguille",
  url: "https://www.rectoverso.co/article/tour-du-mont-aiguille",
  title: "Tour du Mont Aiguille",
};

export const veloSheet: WidgetPage = {
  siteId: anotherSite.siteId,
  origin: "https://velo.example",
  pageKey: "sortie-vercors",
  url: "https://velo.example/sortie-vercors",
  title: "Sortie dans le Vercors",
};

export type OptionLabel =
  (typeof rectoVerso.reactionSet.options)[number]["label"];

/** The id of one of Recto Verso's Reaction Options. */
export function optionId(label: OptionLabel): string {
  const option = rectoVerso.reactionSet.options.find(
    (option) => option.label === label,
  );
  if (!option) throw new Error(`No Reaction Option labeled ${label}`);
  return option.id;
}

const anyClientIp = "198.51.100.20";

/** The header a browser sends once the API has issued it a token. */
export function authorization(browserToken: string | undefined) {
  return browserToken ? { authorization: `Bearer ${browserToken}` } : {};
}

// Creating a database takes about a second and emptying one a few
// milliseconds, so a test file's tests share one database, emptied for each.
let database: Promise<Database> | undefined;

/**
 * Seam 1: the HTTP API, called in-process against PGlite with the real
 * migrations, the Recto Verso seed and another Site. The fakes stand in for
 * the outside world so tests can drive and observe it.
 */
export async function startTestApi() {
  database ??= createPgliteDatabase();
  const db = await database;
  await emptyDatabase(db);
  await seed(db, { memberEmail: "membre@example.com" });
  await seedSite(db, anotherSite, { memberEmail: "membre@velo.example" });

  const clock = new ControllableClock();
  const outbox = new EmailOutbox();
  const photos = new InMemoryPhotoStore();
  const botCheck = new StubBotCheck();
  const fingerprintSecret = new FixedFingerprintSecret();

  const core = createCore({
    store: createStore(db),
    clock,
    email: outbox,
    photos,
    botCheck,
    fingerprintSecret,
  });
  const app = createApp(core, {
    getConnInfo: (c) => ({
      remote: { address: c.req.header(clientIpHeader) },
    }),
  });

  const client = testClient(app);

  /** Loads the Widget on a Page, which creates the Page on first sight. */
  async function loadWidget({
    page = routeSheet,
    browserToken,
    sort,
  }: {
    page?: WidgetPage;
    browserToken?: string;
    sort?: CommentSort;
  } = {}) {
    const response = await client.v1.sites[":siteId"].pages[
      ":pageKey"
    ].widget.$get(
      {
        param: { siteId: page.siteId, pageKey: page.pageKey },
        query: { url: page.url, title: page.title, sort },
        header: authorization(browserToken),
      },
      { headers: { Origin: page.origin } },
    );
    if (response.status !== 200) {
      throw new Error(`Expected the Widget data, got ${response.status}`);
    }
    return response.json();
  }

  function putReaction({
    page = routeSheet,
    origin = page.origin,
    clientIp = anyClientIp,
    browserToken,
    optionId,
  }: {
    page?: WidgetPage;
    origin?: string;
    clientIp?: string;
    browserToken?: string;
    optionId: string | null;
  }) {
    return client.v1.sites[":siteId"].pages[":pageKey"].reaction.$put(
      {
        param: { siteId: page.siteId, pageKey: page.pageKey },
        header: authorization(browserToken),
        json: { optionId },
      },
      { headers: { Origin: origin, [clientIpHeader]: clientIp } },
    );
  }

  /** A bot check's challenge, as the Widget asks for one before posting. */
  async function botChallenge({ page = routeSheet } = {}) {
    const response = await client.v1.sites[":siteId"]["bot-challenge"].$get(
      { param: { siteId: page.siteId } },
      { headers: { Origin: page.origin } },
    );
    if (response.status !== 200) {
      throw new Error(`Expected a bot check challenge, got ${response.status}`);
    }
    return response.json();
  }

  /**
   * A solution to a new challenge, as the Widget sends with a Comment once
   * the time the challenge asks for has passed.
   */
  async function solvedBotCheck({ page = routeSheet } = {}) {
    const { challenge, postableIn } = await botChallenge({ page });
    clock.advance(postableIn);
    return botCheck.solve(challenge);
  }

  async function postComment({
    page = routeSheet,
    origin = page.origin,
    clientIp = anyClientIp,
    browserToken,
    botCheck: solution,
    honeypot,
    displayName,
    text,
    replyTo,
    email,
  }: {
    page?: WidgetPage;
    origin?: string;
    clientIp?: string;
    browserToken?: string;
    /** The solution to a bot check's challenge, by default a new one solved. */
    botCheck?: string;
    /** The field the Widget hides, which only a bot fills in. */
    honeypot?: string;
    displayName: string;
    text: string;
    /** The id of the Comment this one Replies to. */
    replyTo?: string;
    /** The email the Commenter gives to be sent a magic link. */
    email?: string;
  }) {
    return client.v1.sites[":siteId"].pages[":pageKey"].comments.$post(
      {
        param: { siteId: page.siteId, pageKey: page.pageKey },
        header: authorization(browserToken),
        json: {
          botCheck: solution ?? (await solvedBotCheck({ page })),
          honeypot,
          displayName,
          text,
          replyTo,
          email,
        },
      },
      { headers: { Origin: origin, [clientIpHeader]: clientIp } },
    );
  }

  /** The magic link in the latest email sent to `address`. */
  function magicLinkTo(address: string): string {
    const email = outbox.sent.findLast(({ to }) => to === address);
    const link = email && magicLinkIn(email.text);
    if (!link) throw new Error(`No magic link was sent to ${address}`);
    return link;
  }

  /** Follows a magic link from the page it opens, as the Widget there does. */
  function followMagicLink({
    link,
    origin = new URL(link).origin,
    siteId = rectoVerso.siteId,
    browserToken,
  }: {
    link: string;
    origin?: string;
    siteId?: string;
    browserToken?: string;
  }) {
    const token = new URLSearchParams(new URL(link).hash.slice(1)).get(
      magicLinkParameter,
    );
    return client.v1.sites[":siteId"].verifications.$post(
      {
        param: { siteId },
        header: authorization(browserToken),
        json: { token: token ?? "" },
      },
      { headers: { Origin: origin } },
    );
  }

  function putVote({
    page = routeSheet,
    origin = page.origin,
    clientIp = anyClientIp,
    browserToken,
    commentId,
    vote,
  }: {
    page?: WidgetPage;
    origin?: string;
    clientIp?: string;
    browserToken?: string;
    commentId: string;
    vote: Vote | null;
  }) {
    return client.v1.sites[":siteId"].pages[":pageKey"].comments[
      ":commentId"
    ].vote.$put(
      {
        param: { siteId: page.siteId, pageKey: page.pageKey, commentId },
        header: authorization(browserToken),
        json: { vote },
      },
      { headers: { Origin: origin, [clientIpHeader]: clientIp } },
    );
  }

  /**
   * A Visitor's browser. Like the Widget, it keeps the token the API issues
   * it for each Site and sends it back to that Site.
   */
  function newBrowser({ clientIp = anyClientIp } = {}) {
    const browserTokens = new Map<string, string>();

    async function tryReact(
      label: OptionLabel | null,
      { page = routeSheet } = {},
    ) {
      const response = await putReaction({
        page,
        clientIp,
        browserToken: browserTokens.get(page.siteId),
        optionId: label === null ? null : optionId(label),
      });
      if (response.status !== 200) return { status: response.status };
      const reacted = await response.json();
      browserTokens.set(page.siteId, reacted.browserToken);
      return { status: response.status, reacted };
    }

    async function tryVote(
      commentId: string,
      vote: Vote | null,
      { page = routeSheet } = {},
    ) {
      const response = await putVote({
        page,
        clientIp,
        browserToken: browserTokens.get(page.siteId),
        commentId,
        vote,
      });
      if (response.status !== 200) return { status: response.status };
      const voted = await response.json();
      browserTokens.set(page.siteId, voted.browserToken);
      return { status: response.status, voted };
    }

    async function tryPost(
      displayName: string,
      text: string,
      {
        page = routeSheet,
        replyTo,
        email,
      }: { page?: WidgetPage; replyTo?: string; email?: string } = {},
    ) {
      const response = await postComment({
        page,
        clientIp,
        browserToken: browserTokens.get(page.siteId),
        displayName,
        text,
        replyTo,
        email,
      });
      if (response.status !== 201) return { status: response.status };
      const posted = await response.json();
      browserTokens.set(page.siteId, posted.browserToken);
      return { status: response.status, posted };
    }

    /** Opens a magic link in this browser; the Widget on its Page follows it. */
    async function tryFollowMagicLink(
      link: string,
      { page = routeSheet } = {},
    ) {
      const response = await followMagicLink({
        link,
        siteId: page.siteId,
        browserToken: browserTokens.get(page.siteId),
      });
      if (response.status !== 200) return { status: response.status };
      const followed = await response.json();
      browserTokens.set(page.siteId, followed.browserToken);
      return { status: response.status, followed };
    }

    return {
      /** The browser's token for Recto Verso. */
      get browserToken() {
        return browserTokens.get(rectoVerso.siteId);
      },

      tryReact,

      async react(label: OptionLabel | null) {
        const { status, reacted } = await tryReact(label);
        if (!reacted) {
          throw new Error(`Expected the Reaction to count, got ${status}`);
        }
        return reacted;
      },

      tryVote,

      /** Gives, changes or, with `null`, withdraws the browser's Vote on a Comment. */
      async vote(commentId: string, vote: Vote | null) {
        const { status, voted } = await tryVote(commentId, vote);
        if (!voted)
          throw new Error(`Expected the Vote to count, got ${status}`);
        return voted;
      },

      tryPost,

      async post(
        displayName: string,
        text: string,
        options: { page?: WidgetPage; replyTo?: string; email?: string } = {},
      ) {
        const { status, posted } = await tryPost(displayName, text, options);
        if (!posted) {
          throw new Error(`Expected the Comment to post, got ${status}`);
        }
        return posted;
      },

      tryFollowMagicLink,

      async followMagicLink(link: string, { page = routeSheet } = {}) {
        const { status, followed } = await tryFollowMagicLink(link, { page });
        if (!followed) {
          throw new Error(`Expected the magic link to work, got ${status}`);
        }
        return followed;
      },

      loadWidget({
        page = routeSheet,
        sort,
      }: {
        page?: WidgetPage;
        sort?: CommentSort;
      } = {}) {
        return loadWidget({
          page,
          browserToken: browserTokens.get(page.siteId),
          sort,
        });
      },
    };
  }

  return {
    client,
    /** Runs the erasure the platform schedules every hour, as Cloudflare does in production. */
    runHourlyErasure: () => core.eraseExpired(),
    /**
     * Whether any column of any table holds `text`. It names no table, so
     * proving that something is gone survives changes to the schema.
     */
    databaseHolds: (text: string) => databaseHolds(db, text),
    loadWidget,
    putReaction,
    botChallenge,
    solvedBotCheck,
    postComment,
    putVote,
    magicLinkTo,
    followMagicLink,
    newBrowser,
    clock,
    outbox,
    photos,
    botCheck,
    fingerprintSecret,
  };
}

export type TestApi = Awaited<ReturnType<typeof startTestApi>>;
