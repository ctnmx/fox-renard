import { beforeEach, describe, expect, test } from "vitest";
import { rectoVerso, startTestApi, type TestApi } from "./harness";

let api: TestApi;

beforeEach(async () => {
  api = await startTestApi();
});

function requestWidget({
  origin = "https://www.rectoverso.co",
  siteId = rectoVerso.siteId,
  pageKey = "article-tour-du-mont-aiguille",
  url = "https://www.rectoverso.co/article/tour-du-mont-aiguille",
  title = "Tour du Mont Aiguille",
}: {
  /** `null` sends no `Origin` header. */
  origin?: string | null;
  siteId?: string;
  pageKey?: string;
  url?: string;
  title?: string;
} = {}) {
  return api.client.v1.sites[":siteId"].pages[":pageKey"].widget.$get(
    { param: { siteId, pageKey }, query: { url, title }, header: {} },
    { headers: origin === null ? {} : { Origin: origin } },
  );
}

async function pageOf(response: Awaited<ReturnType<typeof requestWidget>>) {
  if (response.status !== 200) {
    throw new Error(`Expected the Widget data, got ${response.status}`);
  }
  return (await response.json()).page;
}

describe("Widget data for a Page", () => {
  test("an unknown Page Key from an Allowed Domain creates the Page and returns the Reaction Set with zero counts, no Reaction and no Comments", async () => {
    const response = await requestWidget();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      page: {
        id: expect.any(String),
        key: "article-tour-du-mont-aiguille",
        url: "https://www.rectoverso.co/article/tour-du-mont-aiguille",
        title: "Tour du Mont Aiguille",
      },
      reactionSet: {
        prompt: "Alors, cet itinéraire ?",
        options: [
          {
            id: expect.any(String),
            picto: { type: "emoji", emoji: "💡" },
            label: "Je m'inspire",
            count: 0,
          },
          {
            id: expect.any(String),
            picto: { type: "emoji", emoji: "🎒" },
            label: "Je le prépare",
            count: 0,
          },
          {
            id: expect.any(String),
            picto: { type: "emoji", emoji: "🏁" },
            label: "Je l'ai fait !",
            count: 0,
          },
        ],
      },
      reaction: null,
      commenter: null,
      comments: [],
    });
  });

  test("repeating the request returns the same Page", async () => {
    const first = await requestWidget();
    const again = await requestWidget({ origin: "https://rectoverso.co" });

    expect(again.status).toBe(200);
    expect(await pageOf(again)).toEqual(await pageOf(first));
  });

  test.each([
    ["a domain that is not allowed", "https://copycat.example"],
    ["a subdomain not itself allowed", "https://blog.rectoverso.co"],
    ["a request not saying which domain it comes from", null],
  ])("%s is refused and creates nothing", async (_, origin) => {
    const refused = await requestWidget({
      origin,
      url: "https://copycat.example/tour-du-mont-aiguille",
      title: "Copie",
    });
    expect(refused.status).toBe(403);

    // Had the refused request created the Page, its URL and title would stick.
    expect(await pageOf(await requestWidget())).toMatchObject({
      url: "https://www.rectoverso.co/article/tour-du-mont-aiguille",
      title: "Tour du Mont Aiguille",
    });
  });

  test("an unknown Site is not found", async () => {
    const response = await requestWidget({
      siteId: "00000000-0000-4000-8000-000000000000",
    });

    expect(response.status).toBe(404);
  });

  test("a Page URL that is not a web address is rejected", async () => {
    const response = await requestWidget({ url: "javascript:alert(1)" });

    expect(response.status).toBe(400);
  });

  test("an overly long Page title is shortened rather than refused", async () => {
    const page = await pageOf(
      await requestWidget({ title: "Tour ".repeat(200) }),
    );

    expect(page.title).toHaveLength(500);
  });
});
