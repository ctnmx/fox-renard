import { beforeEach, describe, expect, test } from "vitest";
import {
  authorization,
  routeSheet,
  startTestApi,
  type TestApi,
  veloSheet,
  type WidgetPage,
} from "./harness";

let api: TestApi;

beforeEach(async () => {
  api = await startTestApi();
});

function postComment({
  page = routeSheet,
  origin = page.origin,
  browserToken,
  displayName,
  text,
}: {
  page?: WidgetPage;
  origin?: string;
  browserToken?: string;
  displayName: string;
  text: string;
}) {
  return api.client.v1.sites[":siteId"].pages[":pageKey"].comments.$post(
    {
      param: { siteId: page.siteId, pageKey: page.pageKey },
      header: authorization(browserToken),
      json: { displayName, text },
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

  return {
    get browserToken() {
      return browserToken;
    },

    async post(displayName: string, text: string) {
      const response = await postComment({ browserToken, displayName, text });
      if (response.status !== 201) {
        throw new Error(`Expected the Comment to post, got ${response.status}`);
      }
      const posted = await response.json();
      browserToken = posted.browserToken;
      return posted;
    },

    loadWidget() {
      return api.loadWidget({ browserToken });
    },
  };
}

/** Each Comment's body, as a Visitor reads it. */
function bodiesOf(comments: { body: unknown[] }[]) {
  return comments.map((comment) => comment.body);
}

describe("a Guest posts a Comment", () => {
  test("a Comment posted with a display name is published to every Visitor of the Page", async () => {
    await api.loadWidget();

    const posted = await postComment({
      displayName: "Marie Dupont",
      text: "Superbe boucle, faite en juin.",
    });

    expect(posted.status).toBe(201);
    expect((await api.loadWidget()).comments).toEqual([
      {
        id: expect.any(String),
        author: { displayName: "Marie Dupont", initials: "MD" },
        body: [{ type: "text", text: "Superbe boucle, faite en juin." }],
        createdAt: api.clock.now().toISOString(),
      },
    ]);
  });

  test("the browser posts as a Guest Commenter, whose display name its Widget data holds", async () => {
    await api.loadWidget();
    const marie = newBrowser();
    await marie.post("Marie Dupont", "Superbe boucle.");

    expect((await marie.loadWidget()).commenter).toEqual({
      displayName: "Marie Dupont",
    });
    expect((await newBrowser().loadWidget()).commenter).toBeNull();
  });

  test("a browser keeps posting as one Commenter, whose display name is the latest it gave", async () => {
    await api.loadWidget();
    const marie = newBrowser();
    await marie.post("Marie", "Faite en juin.");
    api.clock.advance(60_000);

    await marie.post("Marie D.", "Et refaite en septembre.");

    const { comments, commenter } = await marie.loadWidget();
    expect(commenter).toEqual({ displayName: "Marie D." });
    expect(comments.map((comment) => comment.author)).toEqual([
      { displayName: "Marie D.", initials: "MD" },
      { displayName: "Marie D.", initials: "MD" },
    ]);
  });

  test("a Commenter exists within one Site only", async () => {
    await api.loadWidget();
    const marie = newBrowser();
    await marie.post("Marie Dupont", "Superbe boucle.");

    const elsewhere = await api.loadWidget({
      page: veloSheet,
      browserToken: marie.browserToken,
    });

    expect(elsewhere.commenter).toBeNull();
  });

  test("Comments are listed newest first", async () => {
    await api.loadWidget();
    await newBrowser().post("Marie", "Première.");
    api.clock.advance(60_000);
    await newBrowser().post("Paul", "Deuxième.");

    const { comments } = await api.loadWidget();

    expect(comments.map((comment) => comment.author.displayName)).toEqual([
      "Paul",
      "Marie",
    ]);
  });
});

describe("a Comment is plain text", () => {
  test("its line breaks and HTML stay as written, and its URLs become links", async () => {
    await api.loadWidget();

    await newBrowser().post(
      "Marie",
      "Trace ici : https://www.rectoverso.co/traces/aiguille.gpx.\n<b>Pas de balisage</b> (voir https://fr.wikipedia.org/wiki/Mont_Aiguille_(Vercors)).",
    );

    expect(bodiesOf((await api.loadWidget()).comments)).toEqual([
      [
        { type: "text", text: "Trace ici : " },
        { type: "link", url: "https://www.rectoverso.co/traces/aiguille.gpx" },
        { type: "text", text: ".\n<b>Pas de balisage</b> (voir " },
        {
          type: "link",
          url: "https://fr.wikipedia.org/wiki/Mont_Aiguille_(Vercors)",
        },
        { type: "text", text: ")." },
      ],
    ]);
  });

  test("its surrounding blank space is trimmed and its line endings unified", async () => {
    await api.loadWidget();

    await newBrowser().post(
      "  Marie   Dupont ",
      "\r\n  Superbe.\r\nÀ refaire.  \n",
    );

    const [comment] = (await api.loadWidget()).comments;
    expect(comment?.author.displayName).toBe("Marie Dupont");
    expect(comment?.body).toEqual([
      { type: "text", text: "Superbe.\nÀ refaire." },
    ]);
  });

  test("a Comment of 5,000 characters is published", async () => {
    await api.loadWidget();

    await newBrowser().post("Marie", "é".repeat(5000));

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

    const response = await postComment({
      displayName: "Marie",
      text: "Superbe boucle.",
      ...request,
    });

    expect(response.status).toBe(status);
    expect((await api.loadWidget()).comments).toEqual([]);
  });
});
