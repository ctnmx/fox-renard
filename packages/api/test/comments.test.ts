import { beforeEach, describe, expect, test } from "vitest";
import { routeSheet, startTestApi, type TestApi, veloSheet } from "./harness";

let api: TestApi;

beforeEach(async () => {
  api = await startTestApi();
});

/** Each Comment's body, as a Visitor reads it. */
function bodiesOf(comments: { body: unknown[] }[]) {
  return comments.map((comment) => comment.body);
}

describe("a Guest posts a Comment", () => {
  test("a Comment posted with a display name is published to every Visitor of the Page", async () => {
    await api.loadWidget();

    const posted = await api.postComment({
      displayName: "Marie Dupont",
      text: "Superbe boucle, faite en juin.",
    });

    expect(posted.status).toBe(201);
    expect((await api.loadWidget()).comments).toEqual([
      {
        id: expect.any(String),
        commenter: { displayName: "Marie Dupont", initials: "MD" },
        body: [{ type: "text", text: "Superbe boucle, faite en juin." }],
        createdAt: api.clock.now().toISOString(),
        replies: [],
      },
    ]);
  });

  test("the browser posts as a Guest Commenter, whose display name its Widget data holds", async () => {
    await api.loadWidget();
    const marie = api.newBrowser();
    await marie.post("Marie Dupont", "Superbe boucle.");

    expect((await marie.loadWidget()).commenter).toEqual({
      displayName: "Marie Dupont",
    });
    expect((await api.newBrowser().loadWidget()).commenter).toBeNull();
  });

  test("a browser keeps posting as one Commenter, whose display name is the latest it gave", async () => {
    await api.loadWidget();
    const marie = api.newBrowser();
    await marie.post("Marie", "Faite en juin.");
    api.clock.advance(60_000);

    await marie.post("Marie D.", "Et refaite en septembre.");

    const { comments, commenter } = await marie.loadWidget();
    expect(commenter).toEqual({ displayName: "Marie D." });
    expect(comments.map((comment) => comment.commenter)).toEqual([
      { displayName: "Marie D.", initials: "MD" },
      { displayName: "Marie D.", initials: "MD" },
    ]);
  });

  test("a Commenter exists within one Site only: a new display name on one Site leaves the other Site's Commenter as it was", async () => {
    await api.loadWidget();
    await api.loadWidget({ page: veloSheet });
    const marie = api.newBrowser();
    await marie.post("Marie", "Superbe boucle.");
    await marie.post("Marie", "Belle sortie.", { page: veloSheet });

    await marie.post("Marie D.", "À refaire à vélo.", { page: veloSheet });

    const onRectoVerso = await marie.loadWidget();
    expect(onRectoVerso.commenter).toEqual({ displayName: "Marie" });
    expect(onRectoVerso.comments.map(({ commenter }) => commenter)).toEqual([
      { displayName: "Marie", initials: "M" },
    ]);
  });

  test("Comments are listed newest first", async () => {
    await api.loadWidget();
    await api.newBrowser().post("Marie", "Première.");
    api.clock.advance(60_000);
    await api.newBrowser().post("Paul", "Deuxième.");

    const { comments } = await api.loadWidget();

    expect(comments.map((comment) => comment.commenter.displayName)).toEqual([
      "Paul",
      "Marie",
    ]);
  });
});

describe("a Comment is plain text", () => {
  test("its line breaks and HTML stay as written, and its URLs become links", async () => {
    await api.loadWidget();

    await api
      .newBrowser()
      .post(
        "Marie",
        "Trace ici : https://www.rectoverso.co/traces/aiguille.gpx.\n<b>Pas de balisage</b> (voir https://fr.wikipedia.org/wiki/Mont_Aiguille_(Vercors)).",
      );

    expect(bodiesOf((await api.loadWidget()).comments)).toEqual([
      [
        { type: "text", text: "Trace ici : " },
        {
          type: "link",
          url: "https://www.rectoverso.co/traces/aiguille.gpx",
          text: "https://www.rectoverso.co/traces/aiguille.gpx",
        },
        { type: "text", text: ".\n<b>Pas de balisage</b> (voir " },
        {
          type: "link",
          url: "https://fr.wikipedia.org/wiki/Mont_Aiguille_(Vercors)",
          text: "https://fr.wikipedia.org/wiki/Mont_Aiguille_(Vercors)",
        },
        { type: "text", text: ")." },
      ],
    ]);
  });

  test("a web address starting with www. becomes a link too, shown as written", async () => {
    await api.loadWidget();

    await api.newBrowser().post("Marie", "Cartes sur www.ign.fr, pas sur www.");

    expect(bodiesOf((await api.loadWidget()).comments)).toEqual([
      [
        { type: "text", text: "Cartes sur " },
        { type: "link", url: "https://www.ign.fr", text: "www.ign.fr" },
        { type: "text", text: ", pas sur www." },
      ],
    ]);
  });

  test("its surrounding blank space is trimmed and its line endings unified", async () => {
    await api.loadWidget();

    await api
      .newBrowser()
      .post("  Marie   Dupont ", "\r\n  Superbe.\r\nÀ refaire.  \n");

    const [comment] = (await api.loadWidget()).comments;
    expect(comment?.commenter.displayName).toBe("Marie Dupont");
    expect(comment?.body).toEqual([
      { type: "text", text: "Superbe.\nÀ refaire." },
    ]);
  });

  test("a Comment of 5,000 characters is published", async () => {
    await api.loadWidget();

    await api.newBrowser().post("Marie", "é".repeat(5000));

    expect((await api.loadWidget()).comments).toHaveLength(1);
  });
});

describe("a Comment is refused and publishes nothing", () => {
  test.each([
    ["over 5,000 characters", { text: "é".repeat(5001) }, 422],
    ["with no text", { text: " \n " }, 422],
    ["with no display name", { displayName: "   " }, 422],
    [
      "with a display name over 50 characters",
      { displayName: "M".repeat(51) },
      422,
    ],
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
  ])("%s", async (_, request, status) => {
    await api.loadWidget();

    const response = await api.postComment({
      displayName: "Marie",
      text: "Superbe boucle.",
      ...request,
    });

    expect(response.status).toBe(status);
    expect((await api.loadWidget()).comments).toEqual([]);
  });
});
