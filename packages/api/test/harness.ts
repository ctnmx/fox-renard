import {
  type CommentSort,
  createCore,
  type ListedStatus,
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
  signInLinkIn,
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
import type { WidgetData } from "../src/client";

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

/** A top-level Comment as the Widget shows it, never a deleted Comment's placeholder. */
type ShownComment = Exclude<WidgetData["comments"][number], { deleted: true }>;

/**
 * A Page's top-level Comments as the Widget lists them, for tests that delete
 * nothing: a deleted Comment's placeholder among them fails the test.
 */
export function shownComments({
  comments,
}: Pick<WidgetData, "comments">): ShownComment[] {
  return comments.map((comment) => {
    if ("deleted" in comment) {
      throw new Error(
        `Comment ${comment.id} is a deleted Comment's placeholder`,
      );
    }
    return comment;
  });
}

/** A Page as the Widget embedded on it reports it. */
export interface WidgetPage {
  siteId: string;
  origin: string;
  pageKey: string;
  url: string;
  title: string;
}

/** Which of a Site's Comments the console lists. */
interface CommentFilter {
  /** Recto Verso's, unless told otherwise. */
  siteId?: string;
  status: ListedStatus;
  /** The Page whose Comments to list, or all Pages when left out. */
  pageKey?: string;
}

/** Fails unless the console's request did what it asked. */
function expectDone(response: Response, what: string) {
  if (response.status !== 204) {
    throw new Error(`Expected to ${what}, got ${response.status}`);
  }
}

/** Where a browser posts a Comment, and what it asks for. */
interface PostOptions {
  page?: WidgetPage;
  /** The id of the Comment this one Replies to. */
  replyTo?: string;
  /** The email the Commenter gives to be sent a magic link. */
  email?: string;
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

/** Where the console answers, for the links Fox Renard emails Members. */
export const consoleOrigin = "https://console.foxrenard.test";

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
    consoleOrigin,
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

  /** The emails sent to `address`, oldest first. */
  function emailsTo(address: string) {
    return outbox.sent.filter(({ to }) => to === address);
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

  /** The sign-in link in the latest email sent to a Member at `address`. */
  function signInLinkTo(address: string): string {
    const email = outbox.sent.findLast(({ to }) => to === address);
    const link = email && signInLinkIn(email.text);
    if (!link) throw new Error(`No sign-in link was sent to ${address}`);
    return link;
  }

  /**
   * A Member's browser on the console. Like a browser, it keeps the session
   * cookie the API sets, and sends it back with each request.
   */
  function newConsole() {
    let cookie: string | undefined;

    /** Keeps the cookie a response sets, or forgets it when the response expires it. */
    function keepCookie(response: Response) {
      const setCookie = response.headers.get("Set-Cookie");
      if (!setCookie) return;
      const [pair = ""] = setCookie.split(";");
      cookie = /max-age=0/i.test(setCookie) ? undefined : pair;
    }

    const withCookie = (): { headers: Record<string, string> } => ({
      headers: cookie ? { Cookie: cookie } : {},
    });

    async function trySignIn(link: string) {
      const token = new URLSearchParams(new URL(link).hash.slice(1)).get(
        "token",
      );
      const response = await client.v1.console.sessions.$post(
        { json: { token: token ?? "" } },
        withCookie(),
      );
      keepCookie(response);
      return response;
    }

    async function tryHome() {
      return client.v1.console.home.$get({}, withCookie());
    }

    return {
      /** The session cookie the browser holds, as it sends it. */
      get cookie() {
        return cookie;
      },

      requestSignInLink(email: string) {
        return client.v1.console["sign-in-links"].$post({ json: { email } });
      },

      trySignIn,

      /** Follows a sign-in link, as the console page it opens does. */
      async signIn(link: string) {
        const response = await trySignIn(link);
        if (!response.ok) {
          throw new Error(`Expected to sign in, got ${response.status}`);
        }
      },

      async signOut() {
        const response = await client.v1.console.sessions.current.$delete(
          {},
          withCookie(),
        );
        keepCookie(response);
        return response;
      },

      tryHome,

      /** What the console shows a signed-in Member first: their Organization and its Sites. */
      async home() {
        const response = await tryHome();
        if (response.status !== 200) {
          throw new Error(
            `Expected the console's home, got ${response.status}`,
          );
        }
        return response.json();
      },

      tryComments,

      /** A Site's Comments with one status, newest first, on one Page or all. */
      async comments(filter: CommentFilter) {
        const response = await tryComments(filter);
        if (response.status !== 200) {
          throw new Error(`Expected the Comments, got ${response.status}`);
        }
        return (await response.json()).comments;
      },

      tryPages,

      /** The Pages of a Site that hold Comments, by title, with how many each status holds. */
      async pages(siteId?: string) {
        const response = await tryPages(siteId);
        if (response.status !== 200) {
          throw new Error(`Expected the Pages, got ${response.status}`);
        }
        return (await response.json()).pages;
      },

      tryApprove,
      tryMarkAsSpam,
      tryDelete,

      async approve(commentId: string) {
        expectDone(await tryApprove(commentId), "approve the Comment");
      },

      async markAsSpam(commentId: string) {
        expectDone(await tryMarkAsSpam(commentId), "mark the Comment as spam");
      },

      async delete(commentId: string) {
        expectDone(await tryDelete(commentId), "delete the Comment");
      },
    };

    function tryComments({
      siteId = rectoVerso.siteId,
      status,
      pageKey,
    }: CommentFilter) {
      return client.v1.console.sites[":siteId"].comments.$get(
        { param: { siteId }, query: { status, page: pageKey } },
        withCookie(),
      );
    }

    function tryPages(siteId: string = rectoVerso.siteId) {
      return client.v1.console.sites[":siteId"].pages.$get(
        { param: { siteId } },
        withCookie(),
      );
    }

    function tryApprove(commentId: string) {
      return client.v1.console.comments[":commentId"].approve.$post(
        { param: { commentId } },
        withCookie(),
      );
    }

    function tryMarkAsSpam(commentId: string) {
      return client.v1.console.comments[":commentId"].spam.$post(
        { param: { commentId } },
        withCookie(),
      );
    }

    function tryDelete(commentId: string) {
      return client.v1.console.comments[":commentId"].$delete(
        { param: { commentId } },
        withCookie(),
      );
    }
  }

  /** A console a Member signed in to, by default Recto Verso's Member. */
  async function signedInMember(email = "membre@example.com") {
    const member = newConsole();
    await member.requestSignInLink(email);
    await member.signIn(signInLinkTo(email));
    return member;
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
      { page = routeSheet, replyTo, email }: PostOptions = {},
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

      async post(displayName: string, text: string, options: PostOptions = {}) {
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
    emailsTo,
    magicLinkTo,
    followMagicLink,
    newBrowser,
    signInLinkTo,
    newConsole,
    signedInMember,
    clock,
    outbox,
    photos,
    botCheck,
    fingerprintSecret,
  };
}

export type TestApi = Awaited<ReturnType<typeof startTestApi>>;
