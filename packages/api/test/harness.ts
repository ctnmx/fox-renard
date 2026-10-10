import { createCore } from "@fox-renard/core";
import {
  ControllableClock,
  EmailOutbox,
  FixedFingerprintSecret,
  InMemoryPhotoStore,
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
import { createPgliteDatabase, emptyDatabase } from "@fox-renard/db/pglite";
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

  const app = createApp(
    createCore({
      store: createStore(db),
      clock,
      email: outbox,
      photos,
      botCheck,
      fingerprintSecret,
    }),
    {
      getConnInfo: (c) => ({
        remote: { address: c.req.header(clientIpHeader) },
      }),
    },
  );

  const client = testClient(app);

  /** Loads the Widget on a Page, which creates the Page on first sight. */
  async function loadWidget({
    page = routeSheet,
    browserToken,
  }: {
    page?: WidgetPage;
    browserToken?: string;
  } = {}) {
    const response = await client.v1.sites[":siteId"].pages[
      ":pageKey"
    ].widget.$get(
      {
        param: { siteId: page.siteId, pageKey: page.pageKey },
        query: { url: page.url, title: page.title },
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

  function postComment({
    page = routeSheet,
    origin = page.origin,
    browserToken,
    displayName,
    text,
    replyTo,
  }: {
    page?: WidgetPage;
    origin?: string;
    browserToken?: string;
    displayName: string;
    text: string;
    /** The id of the Comment this one Replies to. */
    replyTo?: string;
  }) {
    return client.v1.sites[":siteId"].pages[":pageKey"].comments.$post(
      {
        param: { siteId: page.siteId, pageKey: page.pageKey },
        header: authorization(browserToken),
        json: { displayName, text, replyTo },
      },
      { headers: { Origin: origin } },
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

      async post(
        displayName: string,
        text: string,
        {
          page = routeSheet,
          replyTo,
        }: { page?: WidgetPage; replyTo?: string } = {},
      ) {
        const response = await postComment({
          page,
          browserToken: browserTokens.get(page.siteId),
          displayName,
          text,
          replyTo,
        });
        if (response.status !== 201) {
          throw new Error(
            `Expected the Comment to post, got ${response.status}`,
          );
        }
        const posted = await response.json();
        browserTokens.set(page.siteId, posted.browserToken);
        return posted;
      },

      loadWidget({ page = routeSheet } = {}) {
        return loadWidget({
          page,
          browserToken: browserTokens.get(page.siteId),
        });
      },
    };
  }

  return {
    client,
    loadWidget,
    putReaction,
    postComment,
    newBrowser,
    clock,
    outbox,
    photos,
    botCheck,
    fingerprintSecret,
  };
}

export type TestApi = Awaited<ReturnType<typeof startTestApi>>;
