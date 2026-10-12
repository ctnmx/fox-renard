import { beforeEach, describe, expect, test } from "vitest";
import {
  anotherSite,
  routeSheet,
  startTestApi,
  type TestApi,
  veloSheet,
} from "./harness";

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

describe("a magic link works once, for an hour", () => {
  const hour = 60 * 60 * 1000;

  test("a used link is refused, and links nothing", async () => {
    await api.loadWidget();
    const marie = api.newBrowser();
    await marie.post("Marie", "Superbe boucle.", {
      email: "marie@example.com",
    });
    const link = api.magicLinkTo("marie@example.com");
    await marie.followMagicLink(link);

    const paul = api.newBrowser();
    const again = await paul.tryFollowMagicLink(link);

    expect(again.status).toBe(410);
    expect((await paul.loadWidget()).commenter).toBeNull();
  });

  test("a link works until its hour is up, then is refused, leaving its Commenter a Guest", async () => {
    await api.loadWidget();
    const marie = api.newBrowser();
    const paul = api.newBrowser();
    await marie.post("Marie", "Superbe boucle.", {
      email: "marie@example.com",
    });
    await paul.post("Paul", "Faite en mai.", { email: "paul@example.com" });

    api.clock.advance(hour - 1);
    await marie.followMagicLink(api.magicLinkTo("marie@example.com"));
    api.clock.advance(1);
    const expired = await paul.tryFollowMagicLink(
      api.magicLinkTo("paul@example.com"),
    );

    expect(expired.status).toBe(410);
    expect((await paul.loadWidget()).commenter).toEqual({
      displayName: "Paul",
      verified: false,
    });
  });
});

describe("only a browser that followed a magic link acts as the Verified Commenter", () => {
  test("a link opened in another browser links that browser, whose Comments then show the badge", async () => {
    await api.loadWidget();
    const laptop = api.newBrowser();
    await laptop.post("Marie", "Superbe boucle.", {
      email: "marie@example.com",
    });
    const phone = api.newBrowser();

    await phone.followMagicLink(api.magicLinkTo("marie@example.com"));
    api.clock.advance(60_000);
    await phone.post("Marie", "Et le retour par les Pellas.");

    const { commenter, comments } = await phone.loadWidget();
    expect(commenter).toEqual({ displayName: "Marie", verified: true });
    expect(comments.map((comment) => comment.commenter.verified)).toEqual([
      true,
      true,
    ]);
  });

  test("the browser that asked for a link it did not follow keeps nothing of the Verified Commenter", async () => {
    await api.loadWidget();
    const laptop = api.newBrowser();
    await laptop.post("Marie", "Superbe boucle.", {
      email: "marie@example.com",
    });
    await api
      .newBrowser()
      .followMagicLink(api.magicLinkTo("marie@example.com"));

    expect((await laptop.loadWidget()).commenter).toBeNull();
    api.clock.advance(60_000);
    await laptop.post("Marie", "Posté depuis le portable.");
    expect(
      (await api.loadWidget()).comments.map(({ commenter }) => commenter),
    ).toEqual([
      { displayName: "Marie", initials: "M", verified: false },
      { displayName: "Marie", initials: "M", verified: true },
    ]);
  });
});

describe("a Verified Commenter links another browser", () => {
  /** A browser whose Commenter, Marie, verified marie@example.com. */
  async function verifiedMarie() {
    const laptop = api.newBrowser();
    await laptop.post("Marie", "Superbe boucle.", {
      email: "marie@example.com",
    });
    await laptop.followMagicLink(api.magicLinkTo("marie@example.com"));
    api.clock.advance(60_000);
    return laptop;
  }

  test("verifying an email already verified on the Site links the browser to that Verified Commenter, with the Comments it posted", async () => {
    await api.loadWidget();
    const laptop = await verifiedMarie();
    const phone = api.newBrowser();
    await phone.post("Marie D.", "Refaite en septembre.", {
      email: "Marie@Example.com",
    });

    await phone.followMagicLink(api.magicLinkTo("marie@example.com"));

    const { commenter, comments } = await phone.loadWidget();
    expect(commenter).toMatchObject({ verified: true });
    expect(comments.map((comment) => comment.commenter)).toEqual([
      { displayName: "Marie D.", initials: "MD", verified: true },
      { displayName: "Marie", initials: "M", verified: true },
    ]);
    // Both browsers post as one Commenter, so a new name given on one
    // prefills the other.
    await laptop.post("Marie Dupont", "Et une troisième fois.");
    expect((await phone.loadWidget()).commenter).toEqual({
      displayName: "Marie Dupont",
      verified: true,
    });
  });

  test("following a link someone else asked for with your email leaves their Comments theirs", async () => {
    await api.loadWidget();
    const laptop = await verifiedMarie();
    const stranger = api.newBrowser();
    await stranger.post("Marie", "Un commentaire qui n'est pas d'elle.", {
      email: "marie@example.com",
    });

    await laptop.followMagicLink(api.magicLinkTo("marie@example.com"));

    expect((await stranger.loadWidget()).commenter).toEqual({
      displayName: "Marie",
      verified: false,
    });
    expect(
      (await api.loadWidget()).comments.map(
        ({ commenter }) => commenter.verified,
      ),
    ).toEqual([false, true]);
  });
});

describe("a Commenter exists within one Site only (ADR-0005)", () => {
  test("the same email on another Site gets a magic link of its own, which verifies a separate Commenter there", async () => {
    await api.loadWidget();
    await api.loadWidget({ page: veloSheet });
    const marie = api.newBrowser();
    await marie.post("Marie", "Superbe boucle.", {
      email: "marie@example.com",
    });
    await marie.followMagicLink(api.magicLinkTo("marie@example.com"));

    await marie.post("Marie", "Belle sortie.", {
      page: veloSheet,
      email: "marie@example.com",
    });

    expect(api.outbox.sent.at(-1)).toMatchObject({
      to: "marie@example.com",
      senderName: "Carnets de vélo via Fox Renard",
      text: expect.stringContaining(`${veloSheet.url}#fox-renard-magic-link=`),
    });
    expect((await marie.loadWidget({ page: veloSheet })).commenter).toEqual({
      displayName: "Marie",
      verified: false,
    });

    await marie.followMagicLink(api.magicLinkTo("marie@example.com"), {
      page: veloSheet,
    });
    expect((await marie.loadWidget({ page: veloSheet })).commenter).toEqual({
      displayName: "Marie",
      verified: true,
    });
    await marie.post("Marie D.", "À refaire.", { page: veloSheet });
    expect((await marie.loadWidget()).commenter).toEqual({
      displayName: "Marie",
      verified: true,
    });
  });

  test("a magic link works only on the Site that sent it", async () => {
    await api.loadWidget();
    await api.newBrowser().post("Marie", "Superbe boucle.", {
      email: "marie@example.com",
    });

    const elsewhere = await api.followMagicLink({
      link: api.magicLinkTo("marie@example.com"),
      siteId: anotherSite.siteId,
      origin: veloSheet.origin,
    });

    expect(elsewhere.status).toBe(410);
  });
});
