import { randomUUID } from "node:crypto";
import type { Vote } from "@fox-renard/core";
import { beforeEach, describe, expect, test } from "vitest";
import { routeSheet, startTestApi, type TestApi } from "./harness";

let api: TestApi;

/** The Vote a browser holds on each Comment its Widget data lists, by Comment id. */
function votesIn(data: { comments: { id: string; vote: string | null }[] }) {
  return Object.fromEntries(data.comments.map(({ id, vote }) => [id, vote]));
}

beforeEach(async () => {
  api = await startTestApi();
});

describe("a Visitor votes on a Comment", () => {
  test("a thumbs-up raises the Comment's up count by one, for every Visitor of the Page", async () => {
    await api.loadWidget();
    const { comment } = await api.newBrowser().post("Marie", "Superbe boucle.");

    const voted = await api.newBrowser().vote(comment.id, "up");

    expect(voted.voteCounts).toEqual({ up: 1, down: 0 });
    expect((await api.loadWidget()).comments).toMatchObject([
      { id: comment.id, voteCounts: { up: 1, down: 0 } },
    ]);
  });

  test("the Widget data tells each browser which Vote it holds on each Comment", async () => {
    await api.loadWidget();
    const { comment: marie } = await api
      .newBrowser()
      .post("Marie", "Faite en juin.");
    const { comment: paul } = await api
      .newBrowser()
      .post("Paul", "Faite en mai.");
    const anna = api.newBrowser();
    await anna.vote(marie.id, "up");
    await anna.vote(paul.id, "down");

    expect(votesIn(await anna.loadWidget())).toEqual({
      [marie.id]: "up",
      [paul.id]: "down",
    });
    expect(votesIn(await api.newBrowser().loadWidget())).toEqual({
      [marie.id]: null,
      [paul.id]: null,
    });
  });

  test("switching from up to down moves the browser's Vote from one count to the other", async () => {
    await api.loadWidget();
    const { comment } = await api.newBrowser().post("Marie", "Superbe boucle.");
    const anna = api.newBrowser();
    await anna.vote(comment.id, "up");
    await api.newBrowser().vote(comment.id, "up");

    const switched = await anna.vote(comment.id, "down");

    expect(switched).toMatchObject({
      voteCounts: { up: 1, down: 1 },
      vote: "down",
    });
    expect((await api.loadWidget()).comments[0]?.voteCounts).toEqual({
      up: 1,
      down: 1,
    });
  });

  test("withdrawing the Vote lowers its count by one", async () => {
    await api.loadWidget();
    const { comment } = await api.newBrowser().post("Marie", "Superbe boucle.");
    const anna = api.newBrowser();
    await anna.vote(comment.id, "down");
    await api.newBrowser().vote(comment.id, "down");

    const withdrawn = await anna.vote(comment.id, null);

    expect(withdrawn).toMatchObject({
      voteCounts: { up: 0, down: 1 },
      vote: null,
    });
    expect(votesIn(await anna.loadWidget())).toEqual({ [comment.id]: null });
  });

  test("the same browser never counts twice on one Comment, and needs no name or email", async () => {
    await api.loadWidget();
    const { comment } = await api.newBrowser().post("Marie", "Superbe boucle.");
    const anna = api.newBrowser();
    await anna.vote(comment.id, "up");
    const firstToken = anna.browserToken;

    await anna.vote(comment.id, "up");
    // Two taps racing each other still leave one Vote.
    await Promise.all([
      anna.vote(comment.id, "down"),
      anna.vote(comment.id, "up"),
    ]);

    expect(anna.browserToken).toBe(firstToken);
    expect(
      (await api.loadWidget()).comments.map(
        ({ voteCounts }) => voteCounts.up + voteCounts.down,
      ),
    ).toEqual([1]);
    expect((await anna.loadWidget()).commenter).toBeNull();
  });

  test("a Visitor votes on a Reply as on any Comment", async () => {
    await api.loadWidget();
    const { comment } = await api.newBrowser().post("Marie", "Superbe boucle.");
    const { comment: reply } = await api
      .newBrowser()
      .post("Paul", "Équipé ?", { replyTo: comment.id });
    const anna = api.newBrowser();

    await anna.vote(reply.id, "up");

    const [topLevel] = (await anna.loadWidget()).comments;
    expect(topLevel).toMatchObject({
      voteCounts: { up: 0, down: 0 },
      vote: null,
      replies: [{ id: reply.id, voteCounts: { up: 1, down: 0 }, vote: "up" }],
    });
  });
});

describe("a Vote is refused and changes nothing", () => {
  const otherRouteSheet = {
    ...routeSheet,
    pageKey: "article-gorges-de-la-bourne",
    url: "https://www.rectoverso.co/article/gorges-de-la-bourne",
    title: "Gorges de la Bourne",
  };

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
    ["on a Comment that does not exist", { commentId: randomUUID() }, 404],
    [
      "on a Comment of another Page",
      async () => {
        await api.loadWidget({ page: otherRouteSheet });
        const { comment } = await api
          .newBrowser()
          .post("Paul", "Belle sortie.", { page: otherRouteSheet });
        return { commentId: comment.id };
      },
      404,
    ],
    ["on something that is not a Comment id", { commentId: "1" }, 400],
    ["that is neither up nor down", { vote: "pour" as Vote }, 400],
  ])("%s", async (_, request, status) => {
    await api.loadWidget();
    const { comment } = await api.newBrowser().post("Marie", "Superbe boucle.");

    const response = await api.putVote({
      commentId: comment.id,
      vote: "up",
      ...(typeof request === "function" ? await request() : request),
    });

    expect(response.status).toBe(status);
    expect(
      (await api.loadWidget()).comments.map(({ voteCounts }) => voteCounts),
    ).toEqual([{ up: 0, down: 0 }]);
  });
});

describe("abuse limits on voting", () => {
  test("a browser can vote 50 times, then is refused", async () => {
    await api.loadWidget();
    const { comment } = await api.newBrowser().post("Marie", "Superbe boucle.");
    const anna = api.newBrowser();
    for (let i = 0; i < 50; i++) {
      await anna.vote(comment.id, i % 2 === 0 ? "up" : "down");
    }

    expect((await anna.tryVote(comment.id, null)).status).toBe(429);
    expect(votesIn(await anna.loadWidget())).toEqual({ [comment.id]: "down" });
  });

  test("a network can vote 100 times a day, whichever browsers it uses", async () => {
    await api.loadWidget();
    const { comment } = await api.newBrowser().post("Marie", "Superbe boucle.");
    const clientIp = "203.0.113.7";
    for (let i = 0; i < 100; i++) {
      await api.newBrowser({ clientIp }).vote(comment.id, "up");
    }

    const refused = await api
      .newBrowser({ clientIp })
      .tryVote(comment.id, "up");
    expect(refused.status).toBe(429);
    expect((await api.loadWidget()).comments[0]?.voteCounts).toEqual({
      up: 100,
      down: 0,
    });

    const elsewhere = await api
      .newBrowser({ clientIp: "203.0.113.8" })
      .tryVote(comment.id, "up");
    expect(elsewhere.status).toBe(200);
  });

  test("Votes and Reactions each have their own limits", async () => {
    await api.loadWidget();
    const { comment } = await api.newBrowser().post("Marie", "Superbe boucle.");
    const anna = api.newBrowser();
    for (let i = 0; i < 50; i++) {
      await anna.react(i % 2 === 0 ? "Je le prépare" : "Je m'inspire");
    }
    const paul = api.newBrowser();
    for (let i = 0; i < 50; i++) {
      await paul.vote(comment.id, i % 2 === 0 ? "up" : "down");
    }

    expect((await anna.tryVote(comment.id, "up")).status).toBe(200);
    expect((await paul.tryReact("Je l'ai fait !")).status).toBe(200);
  });
});
