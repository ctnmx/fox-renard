import { beforeEach, describe, expect, test } from "vitest";
import {
  anotherSite,
  optionId,
  routeSheet,
  startTestApi,
  type TestApi,
  veloSheet,
} from "./harness";

let api: TestApi;

beforeEach(async () => {
  api = await startTestApi();
});

/** What a Visitor sees: each Reaction Option's count, by label. */
function countsIn(data: {
  reactionSet: { options: { label: string; count: number }[] };
}): Record<string, number> {
  return Object.fromEntries(
    data.reactionSet.options.map((option) => [option.label, option.count]),
  );
}

describe("a Visitor reacts", () => {
  test("reacting raises that option's count by one", async () => {
    await api.loadWidget();

    const reacted = await api.newBrowser().react("Je l'ai fait !");

    const expected = {
      "Je m'inspire": 0,
      "Je le prépare": 0,
      "Je l'ai fait !": 1,
    };
    expect(countsIn(reacted)).toEqual(expected);
    expect(countsIn(await api.loadWidget())).toEqual(expected);
  });

  test("the Widget data tells each browser which Reaction Option it holds", async () => {
    await api.loadWidget();
    const anna = api.newBrowser();
    await anna.react("Je le prépare");

    expect((await anna.loadWidget()).reaction).toEqual({
      optionId: optionId("Je le prépare"),
    });
    expect((await api.newBrowser().loadWidget()).reaction).toBeNull();
  });

  test("changing the Reaction lowers the old option by one and raises the new one by one", async () => {
    await api.loadWidget();
    const anna = api.newBrowser();
    await anna.react("Je le prépare");
    await api.newBrowser().react("Je le prépare");

    const changed = await anna.react("Je l'ai fait !");

    const expected = {
      "Je m'inspire": 0,
      "Je le prépare": 1,
      "Je l'ai fait !": 1,
    };
    expect(countsIn(changed)).toEqual(expected);
    expect(changed.reaction).toEqual({ optionId: optionId("Je l'ai fait !") });
    expect(countsIn(await api.loadWidget())).toEqual(expected);
  });

  test("removing the Reaction lowers its option's count by one", async () => {
    await api.loadWidget();
    const anna = api.newBrowser();
    await anna.react("Je m'inspire");
    await api.newBrowser().react("Je m'inspire");

    const removed = await anna.react(null);

    expect(countsIn(removed)).toMatchObject({ "Je m'inspire": 1 });
    expect(removed.reaction).toBeNull();
    expect((await anna.loadWidget()).reaction).toBeNull();
  });

  test("the same browser never counts twice on one Page", async () => {
    await api.loadWidget();
    const anna = api.newBrowser();
    await anna.react("Je m'inspire");
    const firstToken = anna.browserToken;

    await anna.react("Je m'inspire");
    // Two taps racing each other still leave one Reaction.
    await Promise.all([
      anna.react("Je le prépare"),
      anna.react("Je m'inspire"),
    ]);

    expect(anna.browserToken).toBe(firstToken);
    const counts = countsIn(await api.loadWidget());
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
    await api.loadWidget();

    const response = await api.putReaction({
      optionId: optionId("Je m'inspire"),
      ...request,
    });

    expect(response.status).toBe(status);
    expect(countsIn(await api.loadWidget())).toEqual({
      "Je m'inspire": 0,
      "Je le prépare": 0,
      "Je l'ai fait !": 0,
    });
  });
});

describe("a browser token", () => {
  test("issued for one Site is not recognized on another Site", async () => {
    await api.loadWidget();
    const anna = api.newBrowser();
    await anna.react("Je l'ai fait !");

    await api.loadWidget({ page: veloSheet });
    const response = await api.putReaction({
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

describe("abuse limits on reacting", () => {
  const hour = 60 * 60 * 1000;

  /** Reacts from `count` new browsers on one client IP. */
  async function reactFromNewBrowsers(count: number, clientIp: string) {
    for (let i = 0; i < count; i++) {
      await api.newBrowser({ clientIp }).react("Je l'ai fait !");
    }
  }

  test("a browser can react 50 times, then is refused", async () => {
    await api.loadWidget();
    const anna = api.newBrowser();
    for (let i = 0; i < 50; i++) {
      await anna.react(i % 2 === 0 ? "Je le prépare" : "Je m'inspire");
    }

    expect((await anna.tryReact("Je l'ai fait !")).status).toBe(429);
    expect(countsIn(await api.loadWidget())).toEqual({
      "Je m'inspire": 1,
      "Je le prépare": 0,
      "Je l'ai fait !": 0,
    });
  });

  test.each([
    ["an IPv4 address", "203.0.113.7", "203.0.113.7", "203.0.113.8"],
    // An IPv6 subscriber holds a whole /64, so it counts as one network.
    [
      "an IPv6 /64",
      "2001:db8:1:2::7",
      "2001:db8:1:2:ffff:ffff:ffff:ffff",
      "2001:db8:1:3::7",
    ],
  ])(
    "%s can react 100 times a day, whichever browsers it uses",
    async (_, clientIp, sameNetwork, otherNetwork) => {
      await api.loadWidget();
      await reactFromNewBrowsers(100, clientIp);

      const refused = await api
        .newBrowser({ clientIp: sameNetwork })
        .tryReact("Je l'ai fait !");
      expect(refused.status).toBe(429);
      expect(countsIn(await api.loadWidget())).toMatchObject({
        "Je l'ai fait !": 100,
      });

      const elsewhere = await api
        .newBrowser({ clientIp: otherNetwork })
        .tryReact("Je l'ai fait !");
      expect(elsewhere.status).toBe(200);
    },
  );

  test("a network's fingerprint rotates daily, so its limit starts over at midnight UTC", async () => {
    await api.loadWidget();
    const clientIp = "203.0.113.7";
    await reactFromNewBrowsers(100, clientIp);

    const now = api.clock.now();
    const midnight = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
    );
    api.clock.advance(midnight - now.getTime() - 1);
    expect(
      (await api.newBrowser({ clientIp }).tryReact("Je m'inspire")).status,
    ).toBe(429);

    api.clock.advance(1);
    expect(
      (await api.newBrowser({ clientIp }).tryReact("Je m'inspire")).status,
    ).toBe(200);
  });

  test("what abuse limits remember, fingerprints included, is erased within 24 hours", async () => {
    await api.loadWidget();
    const anna = api.newBrowser();
    for (let i = 0; i < 50; i++) await anna.react("Je m'inspire");

    // Each hit keeps a fingerprint with its browser, so the browser's limit
    // lifts only once its hits, fingerprints included, are erased.
    api.clock.advance(22 * hour);
    expect((await anna.tryReact("Je le prépare")).status).toBe(429);

    api.clock.advance(1 * hour);
    expect((await anna.tryReact("Je le prépare")).status).toBe(200);
  });
});
