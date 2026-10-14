import { beforeEach, describe, expect, test } from "vitest";
import { startTestApi, type TestApi } from "./harness";

const second = 1000;
const minute = 60 * second;

let api: TestApi;

beforeEach(async () => {
  api = await startTestApi();
  await api.loadWidget();
});

describe("bots are stopped without a puzzle", () => {
  test("a Comment whose bot check fails is refused, and nothing is posted", async () => {
    api.botCheck.passes = false;

    const response = await api.postComment({
      displayName: "Robot",
      text: "Achetez nos chaussures.",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "bot_check_failed" });
    expect(await api.databaseHolds("Robot")).toBe(false);
  });

  test("a Comment whose honeypot field is filled in is refused, and nothing is posted", async () => {
    const response = await api.postComment({
      honeypot: "https://chaussures.example",
      displayName: "Robot",
      text: "Achetez nos chaussures.",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "bot_check_failed" });
    expect(await api.databaseHolds("Robot")).toBe(false);
  });

  test("a Comment posted within 3 seconds of its challenge is refused, and posts once they have passed", async () => {
    const { challenge } = await api.botChallenge();
    const comment = {
      botCheck: api.botCheck.solve(challenge),
      displayName: "Marie",
      text: "Superbe boucle.",
    };

    api.clock.advance(2_999);
    const tooSoon = await api.postComment(comment);
    expect(tooSoon.status).toBe(422);
    expect(await tooSoon.json()).toEqual({ error: "posted_too_soon" });
    expect((await api.loadWidget()).comments).toEqual([]);

    api.clock.advance(1);
    expect((await api.postComment(comment)).status).toBe(201);
  });

  test("a solved challenge posts one Comment only", async () => {
    const botCheck = await api.solvedBotCheck();
    await api.postComment({
      botCheck,
      displayName: "Marie",
      text: "Première.",
    });

    const again = await api.postComment({
      botCheck,
      displayName: "Marie",
      text: "Deuxième.",
    });

    expect(again.status).toBe(403);
    expect(await again.json()).toEqual({ error: "bot_check_failed" });
    expect((await api.loadWidget()).comments).toHaveLength(1);
  });

  test("a challenge works within 30 minutes after it was issued", async () => {
    const first = await api.botChallenge();
    const second = await api.botChallenge();
    const post = ({ challenge }: typeof first) =>
      api.postComment({
        botCheck: api.botCheck.solve(challenge),
        displayName: "Marie",
        text: "Superbe boucle.",
      });

    api.clock.advance(30 * minute - 1);
    expect((await post(first)).status).toBe(201);
    api.clock.advance(1);
    const expired = await post(second);

    expect(expired.status).toBe(403);
    expect(await expired.json()).toEqual({ error: "bot_check_failed" });
  });

  test("the hourly erasure forgets the challenges solved before they expired", async () => {
    const { challenge } = await api.botChallenge();
    api.clock.advance(3 * second);
    await api.postComment({
      botCheck: api.botCheck.solve(challenge),
      displayName: "Marie",
      text: "Superbe boucle.",
    });
    api.clock.advance(30 * minute);
    await api.runHourlyErasure();

    expect(await api.databaseHolds(String(challenge.id))).toBe(false);
  });
});

describe("abuse limits on posting", () => {
  test("a browser can post 10 Comments, Replies included, then is refused", async () => {
    const marie = api.newBrowser();
    const { comment } = await marie.post("Marie", "Superbe boucle.");
    for (let i = 0; i < 9; i++) {
      await marie.post("Marie", `Précision ${i + 1}.`, { replyTo: comment.id });
    }

    expect((await marie.tryPost("Marie", "Une de trop.")).status).toBe(429);
    const [listed] = (await api.loadWidget()).comments;
    expect(listed?.replies).toHaveLength(9);
  });

  test("a network can post 20 Comments, whichever browsers it uses", async () => {
    const office = "203.0.113.7";
    for (let i = 0; i < 20; i++) {
      await api
        .newBrowser({ clientIp: office })
        .post(`Collègue ${i}`, "Faite.");
    }

    const refused = await api
      .newBrowser({ clientIp: office })
      .tryPost("Paul", "Un de trop.");
    expect(refused.status).toBe(429);
    expect((await api.loadWidget()).comments).toHaveLength(20);

    const elsewhere = await api
      .newBrowser({ clientIp: "203.0.113.8" })
      .tryPost("Paul", "Ailleurs.");
    expect(elsewhere.status).toBe(201);
  });
});

describe("a Guest's Comment with a link waits for a Member's approval", () => {
  const withLink = "Mes photos du tour : https://photos.example/aiguille";

  test("it is Pending: hidden from other Visitors, and listed for its Commenter's browser with a pending marker", async () => {
    const marie = api.newBrowser();

    const { comment } = await marie.post("Marie", withLink);

    expect(comment.pending).toBe(true);
    expect((await api.newBrowser().loadWidget()).comments).toEqual([]);
    expect((await marie.loadWidget()).comments).toMatchObject([
      { id: comment.id, pending: true },
    ]);
  });

  test("a Guest's Reply with a link waits too, under a Comment everyone sees", async () => {
    const paul = api.newBrowser();
    const { comment } = await paul.post("Paul", "Le pas est-il équipé ?");
    const marie = api.newBrowser();

    await marie.post("Marie", withLink, { replyTo: comment.id });

    const [seenByPaul] = (await paul.loadWidget()).comments;
    expect(seenByPaul).toMatchObject({ pending: false, replies: [] });
    const [seenByMarie] = (await marie.loadWidget()).comments;
    expect(seenByMarie?.replies).toMatchObject([{ pending: true }]);
  });

  test("a Comment without a link, or a Verified Commenter's, is published", async () => {
    const marie = api.newBrowser();
    await marie.post("Marie", "Superbe boucle.", {
      email: "marie@example.com",
    });
    await marie.followMagicLink(api.magicLinkTo("marie@example.com"));

    await marie.post("Marie", withLink);

    expect((await api.newBrowser().loadWidget()).comments).toMatchObject([
      { pending: false },
      { pending: false },
    ]);
  });
});
