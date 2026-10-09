import { beforeEach, describe, expect, test } from "vitest";
import { anotherSite, rectoVerso, startTestApi, type TestApi } from "./harness";

let api: TestApi;

beforeEach(async () => {
  api = await startTestApi();
});

type OptionLabel = (typeof rectoVerso.reactionSet.options)[number]["label"];

/** A Page as the Widget embedded on it reports it. */
interface WidgetPage {
  siteId: string;
  origin: string;
  pageKey: string;
  url: string;
  title: string;
}

const routeSheet: WidgetPage = {
  siteId: rectoVerso.siteId,
  origin: "https://www.rectoverso.co",
  pageKey: "article-tour-du-mont-aiguille",
  url: "https://www.rectoverso.co/article/tour-du-mont-aiguille",
  title: "Tour du Mont Aiguille",
};

function optionId(label: OptionLabel): string {
  const option = rectoVerso.reactionSet.options.find(
    (option) => option.label === label,
  );
  if (!option) throw new Error(`No Reaction Option labelled ${label}`);
  return option.id;
}

/** What a Visitor sees: each Reaction Option's count, by label. */
function countsIn(data: {
  reactionSet: { options: { label: string; count: number }[] };
}): Record<string, number> {
  return Object.fromEntries(
    data.reactionSet.options.map((option) => [option.label, option.count]),
  );
}

function authorization(browserToken: string | undefined) {
  return browserToken ? { authorization: `Bearer ${browserToken}` } : {};
}

/** Loads the Widget on a Page, which creates the Page on first sight. */
async function loadWidget({
  page = routeSheet,
  browserToken,
}: {
  page?: WidgetPage;
  browserToken?: string;
} = {}) {
  const response = await api.client.v1.sites[":siteId"].pages[
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
  browserToken,
  optionId,
}: {
  page?: WidgetPage;
  origin?: string;
  browserToken?: string;
  optionId: string | null;
}) {
  return api.client.v1.sites[":siteId"].pages[":pageKey"].reaction.$put(
    {
      param: { siteId: page.siteId, pageKey: page.pageKey },
      header: authorization(browserToken),
      json: { optionId },
    },
    { headers: { Origin: origin } },
  );
}

/**
 * A Visitor's browser on the route sheet. Like the Widget, it keeps the
 * browser token the API hands it and sends it back with every request.
 */
function newBrowser() {
  let browserToken: string | undefined;

  async function tryReact(label: OptionLabel | null) {
    const response = await putReaction({
      browserToken,
      optionId: label === null ? null : optionId(label),
    });
    if (response.status !== 200) return { status: response.status };
    const reacted = await response.json();
    browserToken = reacted.browserToken;
    return { status: response.status, reacted };
  }

  return {
    get browserToken() {
      return browserToken;
    },

    tryReact,

    async react(label: OptionLabel | null) {
      const { status, reacted } = await tryReact(label);
      if (!reacted)
        throw new Error(`Expected the Reaction to count, got ${status}`);
      return reacted;
    },

    loadWidget() {
      return loadWidget({ browserToken });
    },
  };
}

describe("a Visitor reacts", () => {
  test("reacting raises that option's count by one", async () => {
    await loadWidget();

    const reacted = await newBrowser().react("Je l'ai fait !");

    const expected = {
      "Je m'inspire": 0,
      "Je le prépare": 0,
      "Je l'ai fait !": 1,
    };
    expect(countsIn(reacted)).toEqual(expected);
    expect(countsIn(await loadWidget())).toEqual(expected);
  });

  test("the Widget data tells each browser which Reaction Option it holds", async () => {
    await loadWidget();
    const anna = newBrowser();
    await anna.react("Je le prépare");

    expect((await anna.loadWidget()).reaction).toEqual({
      optionId: optionId("Je le prépare"),
    });
    expect((await newBrowser().loadWidget()).reaction).toBeNull();
  });

  test("changing the Reaction lowers the old option by one and raises the new one by one", async () => {
    await loadWidget();
    const anna = newBrowser();
    await anna.react("Je le prépare");
    await newBrowser().react("Je le prépare");

    const changed = await anna.react("Je l'ai fait !");

    const expected = {
      "Je m'inspire": 0,
      "Je le prépare": 1,
      "Je l'ai fait !": 1,
    };
    expect(countsIn(changed)).toEqual(expected);
    expect(changed.reaction).toEqual({ optionId: optionId("Je l'ai fait !") });
    expect(countsIn(await loadWidget())).toEqual(expected);
  });

  test("removing the Reaction lowers its option's count by one", async () => {
    await loadWidget();
    const anna = newBrowser();
    await anna.react("Je m'inspire");
    await newBrowser().react("Je m'inspire");

    const removed = await anna.react(null);

    expect(countsIn(removed)).toMatchObject({ "Je m'inspire": 1 });
    expect(removed.reaction).toBeNull();
    expect((await anna.loadWidget()).reaction).toBeNull();
  });

  test("the same browser never counts twice on one Page", async () => {
    await loadWidget();
    const anna = newBrowser();
    await anna.react("Je m'inspire");
    const firstToken = anna.browserToken;

    await anna.react("Je m'inspire");
    // Two taps racing each other still leave one Reaction.
    await Promise.all([
      anna.react("Je le prépare"),
      anna.react("Je m'inspire"),
    ]);

    expect(anna.browserToken).toBe(firstToken);
    const counts = countsIn(await loadWidget());
    expect(Object.values(counts).reduce((sum, count) => sum + count)).toBe(1);
  });
});

describe("a Reaction is refused and changes nothing", () => {
  test.each([
    [
      "from a domain that is not allowed",
      { origin: "https://copycat.example" },
      403,
    ],
    [
      "on a Page no Widget has loaded",
      { page: { ...routeSheet, pageKey: "article-inconnu" } },
      404,
    ],
    [
      "for an option of another Site's Reaction Set",
      { optionId: anotherSite.reactionSet.options[0].id },
      422,
    ],
    ["for an option id that is not one", { optionId: "💡" }, 400],
  ])("%s", async (_, request, status) => {
    await loadWidget();

    const response = await putReaction({
      optionId: optionId("Je m'inspire"),
      ...request,
    });

    expect(response.status).toBe(status);
    expect(countsIn(await loadWidget())).toEqual({
      "Je m'inspire": 0,
      "Je le prépare": 0,
      "Je l'ai fait !": 0,
    });
  });
});

describe("a browser token", () => {
  test("issued for one Site is not recognised on another Site", async () => {
    await loadWidget();
    const anna = newBrowser();
    await anna.react("Je l'ai fait !");

    const veloSheet: WidgetPage = {
      siteId: anotherSite.siteId,
      origin: "https://velo.example",
      pageKey: "sortie-vercors",
      url: "https://velo.example/sortie-vercors",
      title: "Sortie dans le Vercors",
    };
    await loadWidget({ page: veloSheet });
    const response = await putReaction({
      page: veloSheet,
      browserToken: anna.browserToken,
      optionId: anotherSite.reactionSet.options[0].id,
    });

    expect(response.status).toBe(200);
    const reacted = await response.json();
    expect(reacted).toMatchObject({ browserToken: expect.any(String) });
    expect(reacted).not.toMatchObject({ browserToken: anna.browserToken });
  });
});
