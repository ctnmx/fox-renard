import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";
import { routeSheet, startTestApi, type TestApi } from "./harness";

const otherRouteSheet = {
  ...routeSheet,
  pageKey: "article-gorges-de-la-bourne",
  url: "https://www.rectoverso.co/article/gorges-de-la-bourne",
  title: "Gorges de la Bourne",
};

let api: TestApi;

beforeEach(async () => {
  api = await startTestApi();
});

describe("a Commenter Replies to a Comment", () => {
  test("a Reply to a top-level Comment is listed under that Comment", async () => {
    await api.loadWidget();
    const { comment } = await api
      .newBrowser()
      .post("Marie Dupont", "Superbe boucle, faite en juin.");
    api.clock.advance(60_000);

    const reply = await api
      .newBrowser()
      .post("Paul", "Le passage du Pas de l'Aiguille est-il équipé ?", {
        replyTo: comment.id,
      });

    const listedReply = {
      id: expect.any(String),
      commenter: { displayName: "Paul", initials: "P" },
      body: [
        {
          type: "text",
          text: "Le passage du Pas de l'Aiguille est-il équipé ?",
        },
      ],
      createdAt: api.clock.now().toISOString(),
    };
    expect(reply.comment).toEqual(listedReply);
    expect((await api.loadWidget()).comments).toEqual([
      { ...comment, replies: [listedReply] },
    ]);
  });

  test("a Reply to a Reply is attached to the same top-level Comment, and starts with an @mention of the answered Commenter", async () => {
    await api.loadWidget();
    const marie = api.newBrowser();
    const { comment } = await marie.post("Marie Dupont", "Superbe boucle.");
    api.clock.advance(60_000);
    const paulsReply = await api
      .newBrowser()
      .post("Paul Martin", "Le Pas de l'Aiguille est-il équipé ?", {
        replyTo: comment.id,
      });
    api.clock.advance(60_000);

    await marie.post("Marie Dupont", "Oui, avec des câbles.", {
      replyTo: paulsReply.comment.id,
    });

    const [topLevel, ...others] = (await api.loadWidget()).comments;
    expect(others).toEqual([]);
    expect(
      topLevel?.replies.map(({ commenter, body }) => [commenter, body]),
    ).toEqual([
      [
        { displayName: "Paul Martin", initials: "PM" },
        [{ type: "text", text: "Le Pas de l'Aiguille est-il équipé ?" }],
      ],
      [
        { displayName: "Marie Dupont", initials: "MD" },
        [{ type: "text", text: "@Paul Martin Oui, avec des câbles." }],
      ],
    ]);
  });
});

describe("a Reply is listed in the conversation's order", () => {
  test("Replies are listed oldest first, under top-level Comments listed newest first", async () => {
    await api.loadWidget();
    const marie = await api.newBrowser().post("Marie", "Faite en juin.");
    api.clock.advance(60_000);
    const jeanne = await api.newBrowser().post("Jeanne", "Faite en mai.");
    for (const [displayName, replyTo] of [
      ["Paul", marie],
      ["Luc", jeanne],
      ["Léa", marie],
    ] as const) {
      api.clock.advance(60_000);
      await api.newBrowser().post(displayName, "Avec quelle carte ?", {
        replyTo: replyTo.comment.id,
      });
    }

    const { comments } = await api.loadWidget();

    expect(
      comments.map(({ commenter, replies }) => [
        commenter.displayName,
        replies.map((reply) => reply.commenter.displayName),
      ]),
    ).toEqual([
      ["Jeanne", ["Luc"]],
      ["Marie", ["Paul", "Léa"]],
    ]);
  });
});

describe("a Reply is refused and publishes nothing", () => {
  test.each([
    ["to a Comment that does not exist", () => randomUUID(), 404],
    [
      "to a Comment on another Page",
      async () => {
        await api.loadWidget({ page: otherRouteSheet });
        const { comment } = await api
          .newBrowser()
          .post("Paul", "Belle sortie.", { page: otherRouteSheet });
        return comment.id;
      },
      404,
    ],
    ["to something that is not a Comment id", () => "1", 400],
  ])("%s", async (_, answered, status) => {
    await api.loadWidget();
    const marie = api.newBrowser();
    await marie.post("Marie", "Superbe boucle.");

    const response = await api.postComment({
      browserToken: marie.browserToken,
      displayName: "Marie D.",
      text: "Merci !",
      replyTo: await answered(),
    });

    expect(response.status).toBe(status);
    expect(
      (await marie.loadWidget()).comments.map(({ commenter, replies }) => ({
        commenter,
        replies,
      })),
    ).toEqual([
      { commenter: { displayName: "Marie", initials: "M" }, replies: [] },
    ]);
  });
});
