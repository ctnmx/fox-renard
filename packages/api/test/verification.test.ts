import { beforeEach, describe, expect, test } from "vitest";
import { routeSheet, startTestApi, type TestApi } from "./harness";

let api: TestApi;

beforeEach(async () => {
  api = await startTestApi();
});

describe("a Guest verifies their email by magic link", () => {
  test("giving an email with a Comment sends one magic link to the Page, as the Site via Fox Renard", async () => {
    await api.loadWidget();

    await api
      .newBrowser()
      .post("Marie", "Superbe boucle.", { email: "marie@example.com" });

    expect(api.outbox.sent).toEqual([
      {
        to: "marie@example.com",
        senderName: "Recto Verso via Fox Renard",
        subject: expect.any(String),
        text: expect.stringContaining(
          `${routeSheet.url}#fox-renard-magic-link=`,
        ),
      },
    ]);
  });

  test("following the link makes the Commenter verified, with the badge on all their Comments", async () => {
    await api.loadWidget();
    const marie = api.newBrowser();
    await marie.post("Marie", "Faite en juin.");
    api.clock.advance(60_000);
    await marie.post("Marie", "Et refaite en septembre.", {
      email: "marie@example.com",
    });
    api.clock.advance(60_000);
    await api.newBrowser().post("Paul", "Faite en mai.");

    const followed = await marie.followMagicLink(
      api.magicLinkTo("marie@example.com"),
    );

    expect(followed.commenter).toEqual({
      displayName: "Marie",
      verified: true,
    });
    const { commenter, comments } = await marie.loadWidget();
    expect(commenter).toEqual({ displayName: "Marie", verified: true });
    expect(comments.map((comment) => comment.commenter)).toEqual([
      { displayName: "Paul", initials: "P", verified: false },
      { displayName: "Marie", initials: "M", verified: true },
      { displayName: "Marie", initials: "M", verified: true },
    ]);
  });
});
