import { beforeEach, describe, expect, test } from "vitest";
import { rectoVerso, startTestApi, type TestApi } from "./harness";

let api: TestApi;

beforeEach(async () => {
  api = await startTestApi();
});

function requestWidget({
  origin,
  pageKey = "article-tour-du-mont-aiguille",
  url = "https://www.rectoverso.co/article/tour-du-mont-aiguille",
  title = "Tour du Mont Aiguille",
}: {
  origin: string;
  pageKey?: string;
  url?: string;
  title?: string;
}) {
  return api.client.v1.sites[":siteId"].pages[":pageKey"].widget.$get(
    { param: { siteId: rectoVerso.siteId, pageKey }, query: { url, title } },
    { headers: { Origin: origin } },
  );
}

async function pageOf(response: Awaited<ReturnType<typeof requestWidget>>) {
  if (response.status !== 200) {
    throw new Error(`Expected the Widget data, got ${response.status}`);
  }
  return (await response.json()).page;
}

describe("Widget data for a Page", () => {
  test("an unknown Page Key from an Allowed Domain creates the Page and returns the Reaction Set with zero counts", async () => {
    const response = await requestWidget({ origin: "https://rectoverso.co" });

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
    });
  });

  test("repeating the request returns the same Page", async () => {
    const first = await requestWidget({ origin: "https://rectoverso.co" });
    const again = await requestWidget({ origin: "https://rectoverso.co" });

    expect(again.status).toBe(200);
    expect(await pageOf(again)).toEqual(await pageOf(first));
  });

  test("a domain that is not allowed is refused and creates nothing", async () => {
    const refused = await requestWidget({
      origin: "https://copycat.example",
      url: "https://copycat.example/tour-du-mont-aiguille",
      title: "Copie",
    });
    expect(refused.status).toBe(403);

    // Had the refused request created the Page, its URL and title would stick.
    const allowed = await requestWidget({ origin: "https://rectoverso.co" });
    expect(await pageOf(allowed)).toMatchObject({
      url: "https://www.rectoverso.co/article/tour-du-mont-aiguille",
      title: "Tour du Mont Aiguille",
    });
  });

  test("a subdomain of an Allowed Domain is allowed", async () => {
    const response = await requestWidget({
      origin: "https://www.rectoverso.co",
    });

    expect(response.status).toBe(200);
  });

  test("a domain merely ending like an Allowed Domain is refused", async () => {
    const response = await requestWidget({
      origin: "https://notrectoverso.co",
    });

    expect(response.status).toBe(403);
  });

  test("a request that does not say which domain it comes from is refused", async () => {
    const refused = await api.client.v1.sites[":siteId"].pages[
      ":pageKey"
    ].widget.$get({
      param: {
        siteId: rectoVerso.siteId,
        pageKey: "article-tour-du-mont-aiguille",
      },
      query: { url: "https://copycat.example/", title: "Copie" },
    });
    expect(refused.status).toBe(403);

    // Had the refused request created the Page, its URL and title would stick.
    const allowed = await requestWidget({ origin: "https://rectoverso.co" });
    expect(await pageOf(allowed)).toMatchObject({
      url: "https://www.rectoverso.co/article/tour-du-mont-aiguille",
      title: "Tour du Mont Aiguille",
    });
  });

  test("an unknown Site is not found", async () => {
    const response = await api.client.v1.sites[":siteId"].pages[
      ":pageKey"
    ].widget.$get(
      {
        param: {
          siteId: "00000000-0000-4000-8000-000000000000",
          pageKey: "article-tour-du-mont-aiguille",
        },
        query: {
          url: "https://www.rectoverso.co/article/tour-du-mont-aiguille",
          title: "Tour du Mont Aiguille",
        },
      },
      { headers: { Origin: "https://rectoverso.co" } },
    );

    expect(response.status).toBe(404);
  });

  test("a Page URL that is not a web address is rejected", async () => {
    const response = await requestWidget({
      origin: "https://rectoverso.co",
      url: "javascript:alert(1)",
    });

    expect(response.status).toBe(400);
  });
});
