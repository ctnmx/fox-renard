import type { CommentSort } from "@fox-renard/core";
import { beforeEach, describe, expect, test } from "vitest";
import { startTestApi, type TestApi } from "./harness";

let api: TestApi;

beforeEach(async () => {
  api = await startTestApi();
});

/** Each top-level Comment's display name, in the order the Widget data lists them. */
function displayNamesIn(data: {
  comments: { commenter: { displayName: string } }[];
}) {
  return data.comments.map(({ commenter }) => commenter.displayName);
}

/**
 * Four top-level Comments posted a minute apart, oldest first, whose scores
 * are 2, 0 (one up, one down), -1 and 0 (no Vote).
 */
async function postScoredComments() {
  await api.loadWidget();
  const scores = [
    ["Marie", ["up", "up"]],
    ["Paul", ["up", "down"]],
    ["Jeanne", ["down"]],
    ["Luc", []],
  ] as const;
  for (const [displayName, votes] of scores) {
    const { comment } = await api
      .newBrowser()
      .post(displayName, "Superbe boucle.");
    for (const vote of votes) await api.newBrowser().vote(comment.id, vote);
    api.clock.advance(60_000);
  }
}

describe("Comments are sorted", () => {
  test("Top, the default, orders top-level Comments by score, ups minus downs, then newest first", async () => {
    await postScoredComments();

    const top = ["Marie", "Luc", "Paul", "Jeanne"];
    expect(displayNamesIn(await api.loadWidget())).toEqual(top);
    expect(displayNamesIn(await api.loadWidget({ sort: "top" }))).toEqual(top);
  });

  test.each([
    ["newest", ["Luc", "Jeanne", "Paul", "Marie"]],
    ["oldest", ["Marie", "Paul", "Jeanne", "Luc"]],
  ] as const)(
    "%s orders top-level Comments by date, whatever their score",
    async (sort, order) => {
      await postScoredComments();

      expect(displayNamesIn(await api.loadWidget({ sort }))).toEqual(order);
    },
  );

  test.each(["top", "newest", "oldest"] as const)(
    "Replies stay oldest first under their top-level Comment, whatever their score, when sorting by %s",
    async (sort) => {
      await api.loadWidget();
      const { comment } = await api
        .newBrowser()
        .post("Marie", "Superbe boucle.");
      for (const [displayName, vote] of [
        ["Paul", "down"],
        ["Léa", "up"],
      ] as const) {
        api.clock.advance(60_000);
        const { comment: reply } = await api
          .newBrowser()
          .post(displayName, "Équipé ?", { replyTo: comment.id });
        await api.newBrowser().vote(reply.id, vote);
      }

      const [topLevel] = (await api.loadWidget({ sort })).comments;

      expect(
        topLevel?.replies.map(({ commenter }) => commenter.displayName),
      ).toEqual(["Paul", "Léa"]);
    },
  );

  test("an order that is not one of the three is refused", async () => {
    await expect(
      api.loadWidget({ sort: "best" as CommentSort }),
    ).rejects.toThrow("got 400");
  });
});
