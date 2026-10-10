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

  return {
    client,
    loadWidget,
    clock,
    outbox,
    photos,
    botCheck,
    fingerprintSecret,
  };
}

export type TestApi = Awaited<ReturnType<typeof startTestApi>>;
