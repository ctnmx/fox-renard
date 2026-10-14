import { beforeEach, describe, expect, test } from "vitest";
import {
  rectoVerso,
  routeSheet,
  startTestApi,
  type TestApi,
  type WidgetPage,
} from "./harness";

const minute = 60 * 1000;

const withLink = "Mes photos du tour : https://photos.example/aiguille";

const otherSheet: WidgetPage = {
  ...routeSheet,
  pageKey: "article-lac-blanc",
  url: "https://www.rectoverso.co/article/lac-blanc",
  title: "Lac Blanc",
};

let api: TestApi;

beforeEach(async () => {
  api = await startTestApi();
  await api.loadWidget();
  await api.loadWidget({ page: otherSheet });
});

describe("a Member lists their Site's Comments", () => {
  test("Comments are listed newest first, by status and by Page", async () => {
    const marie = api.newBrowser();
    const { comment: published } = await marie.post("Marie", "Superbe boucle.");
    api.clock.advance(minute);
    const { comment: pending } = await marie.post("Marie", withLink);
    api.clock.advance(minute);
    const { comment: elsewhere } = await api
      .newBrowser()
      .post("Paul", "Belle balade.", { page: otherSheet });
    const member = await api.signedInMember();

    expect(await member.comments({ status: "published" })).toEqual([
      {
        id: elsewhere.id,
        page: { key: otherSheet.pageKey, title: "Lac Blanc" },
        commenter: { displayName: "Paul", verified: false },
        text: "Belle balade.",
        createdAt: api.clock.now().toISOString(),
        reply: false,
      },
      expect.objectContaining({ id: published.id }),
    ]);
    expect(
      await member.comments({
        status: "published",
        pageKey: routeSheet.pageKey,
      }),
    ).toEqual([expect.objectContaining({ id: published.id })]);
    expect(await member.comments({ status: "pending" })).toEqual([
      expect.objectContaining({ id: pending.id, text: withLink }),
    ]);
    expect(await member.comments({ status: "spam" })).toEqual([]);
  });

  test("the console offers the Pages that hold Comments, by title, with how many Comments each status holds", async () => {
    const marie = api.newBrowser();
    await marie.post("Marie", "Superbe boucle.");
    await marie.post("Marie", withLink);
    const { comment: spam } = await api
      .newBrowser()
      .post("Paul", "Achetez.", { page: otherSheet });
    await api.loadWidget({
      page: { ...routeSheet, pageKey: "article-sans-commentaire" },
    });
    const member = await api.signedInMember();
    await member.markAsSpam(spam.id);

    expect(await member.pages()).toEqual([
      {
        key: otherSheet.pageKey,
        title: "Lac Blanc",
        counts: { published: 0, pending: 0, spam: 1 },
      },
      {
        key: routeSheet.pageKey,
        title: "Tour du Mont Aiguille",
        counts: { published: 1, pending: 1, spam: 0 },
      },
    ]);
  });
});

describe("a Member moderates Comments", () => {
  test("approving a Pending Comment makes it visible in the Widget", async () => {
    const { comment } = await api.newBrowser().post("Marie", withLink);
    const member = await api.signedInMember();

    await member.approve(comment.id);

    expect((await api.newBrowser().loadWidget()).comments).toMatchObject([
      { id: comment.id, pending: false },
    ]);
    expect(await member.comments({ status: "pending" })).toEqual([]);
    expect(await member.comments({ status: "published" })).toEqual([
      expect.objectContaining({ id: comment.id }),
    ]);
  });

  test("marking a Comment as spam removes it from the Widget, its Commenter's included, and lists it under Spam", async () => {
    const marie = api.newBrowser();
    const { comment } = await marie.post("Marie", "Achetez nos chaussures.");
    const member = await api.signedInMember();

    await member.markAsSpam(comment.id);

    expect((await api.newBrowser().loadWidget()).comments).toEqual([]);
    expect((await marie.loadWidget()).comments).toEqual([]);
    expect(await member.comments({ status: "spam" })).toEqual([
      expect.objectContaining({ id: comment.id }),
    ]);
    expect(await member.comments({ status: "published" })).toEqual([]);
  });

  test("a Comment marked as spam by mistake is approved back", async () => {
    const { comment } = await api.newBrowser().post("Marie", "Superbe boucle.");
    const member = await api.signedInMember();
    await member.markAsSpam(comment.id);

    await member.approve(comment.id);

    expect((await api.loadWidget()).comments).toMatchObject([
      { id: comment.id },
    ]);
  });
});

describe("a Member deletes Comments", () => {
  const question = "Le pas est-il équipé ?";

  test("deleting a Comment without Replies removes it, and what it said", async () => {
    const { comment } = await api.newBrowser().post("Marie", "Superbe boucle.");
    const member = await api.signedInMember();

    await member.delete(comment.id);

    expect((await api.loadWidget()).comments).toEqual([]);
    expect(await member.comments({ status: "published" })).toEqual([]);
    expect(await api.databaseHolds("Superbe boucle.")).toBe(false);
  });

  test("deleting a Comment with Replies leaves a placeholder, which keeps its Replies and nothing it said", async () => {
    const { comment } = await api.newBrowser().post("Marie", question);
    const { comment: reply } = await api
      .newBrowser()
      .post("Paul", "Oui, une main courante.", { replyTo: comment.id });
    const member = await api.signedInMember();

    await member.delete(comment.id);

    expect((await api.loadWidget()).comments).toEqual([
      {
        id: comment.id,
        deleted: true,
        createdAt: comment.createdAt,
        replies: [expect.objectContaining({ id: reply.id })],
      },
    ]);
    expect(await api.databaseHolds(question)).toBe(false);
    expect(await member.comments({ status: "published" })).toEqual([
      expect.objectContaining({ id: reply.id }),
    ]);
  });

  test("deleting a placeholder's last Reply removes the placeholder too", async () => {
    const { comment } = await api.newBrowser().post("Marie", question);
    const { comment: reply } = await api
      .newBrowser()
      .post("Paul", "Oui.", { replyTo: comment.id });
    const member = await api.signedInMember();
    await member.delete(comment.id);

    await member.delete(reply.id);

    expect((await api.loadWidget()).comments).toEqual([]);
    expect(await member.tryDelete(comment.id)).toHaveProperty("status", 404);
  });

  test("a placeholder shows only while a Visitor sees one of its Replies", async () => {
    const { comment } = await api.newBrowser().post("Marie", question);
    const { comment: reply } = await api
      .newBrowser()
      .post("Paul", "Oui.", { replyTo: comment.id });
    const member = await api.signedInMember();
    await member.delete(comment.id);

    await member.markAsSpam(reply.id);

    expect((await api.loadWidget()).comments).toEqual([]);
  });

  test("a deleted Comment, and one marked as spam, take no Reply nor Vote", async () => {
    const marie = api.newBrowser();
    const { comment: deleted } = await marie.post("Marie", question);
    await api.newBrowser().post("Paul", "Oui.", { replyTo: deleted.id });
    const { comment: spam } = await marie.post("Marie", "Achetez.");
    const member = await api.signedInMember();
    await member.delete(deleted.id);
    await member.markAsSpam(spam.id);

    const visitor = api.newBrowser();
    for (const { id } of [deleted, spam]) {
      expect(
        (await visitor.tryPost("Jeanne", "Et alors ?", { replyTo: id })).status,
      ).toBe(404);
      expect((await visitor.tryVote(id, "up")).status).toBe(404);
    }
  });
});

describe("Organizations stay apart", () => {
  test("a Member of another Organization can neither see nor act on Recto Verso's Comments", async () => {
    const { comment } = await api.newBrowser().post("Marie", withLink);
    const stranger = await api.signedInMember("membre@velo.example");

    expect((await stranger.tryComments({ status: "pending" })).status).toBe(
      404,
    );
    expect((await stranger.tryPages()).status).toBe(404);
    for (const act of [
      stranger.tryApprove,
      stranger.tryMarkAsSpam,
      stranger.tryDelete,
    ]) {
      const response = await act(comment.id);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "comment_not_found" });
    }

    const member = await api.signedInMember();
    expect(await member.comments({ status: "pending" })).toEqual([
      expect.objectContaining({ id: comment.id }),
    ]);
    expect((await stranger.home()).sites).toEqual([
      { id: expect.any(String), name: "Carnets de vélo" },
    ]);
  });

  test("a console without a session can neither see nor act on Comments", async () => {
    const { comment } = await api.newBrowser().post("Marie", withLink);
    const signedOut = api.newConsole();

    expect(
      (
        await signedOut.tryComments({
          siteId: rectoVerso.siteId,
          status: "pending",
        })
      ).status,
    ).toBe(401);
    expect((await signedOut.tryApprove(comment.id)).status).toBe(401);
  });
});
