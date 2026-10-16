import { readFileSync } from "node:fs";
import type { HyvorExport } from "@fox-renard/core";
import { beforeEach, describe, expect, test } from "vitest";
import {
  anotherSite,
  routeSheet,
  shownComments,
  startTestApi,
  type TestApi,
  type WidgetPage,
} from "./harness";

/** A Hyvor Talk JSON export, modelled on https://hyvor.com/talk/docs/export. */
const hyvorExport: HyvorExport = JSON.parse(
  readFileSync(
    new URL("./fixtures/hyvor-export.json", import.meta.url),
    "utf8",
  ),
);

let api: TestApi;

beforeEach(async () => {
  api = await startTestApi();
});

describe("only a Member of the Site imports into it", () => {
  test("a signed-out request imports nothing", async () => {
    const response = await api
      .newConsole()
      .tryImportHyvor({ conversations: [] });

    expect(response.status).toBe(401);
  });

  test("a Member cannot import into another Organization's Site", async () => {
    const member = await api.signedInMember();

    const response = await member.tryImportHyvor({
      siteId: anotherSite.siteId,
      conversations: [],
    });

    expect(response.status).toBe(404);
  });

  test("the Site's Member imports the export", async () => {
    const member = await api.signedInMember();

    expect(await member.importHyvor(hyvorExport)).toEqual({
      imported: 7,
      skipped: 3,
      alreadyPresent: 0,
    });
  });
});

const lacBlanc: WidgetPage = {
  ...routeSheet,
  pageKey: "article-lac-blanc",
  url: "https://www.rectoverso.co/article/lac-blanc",
  title: "Lac Blanc",
};

/** A Comment imported from Hyvor, as Visitors read it. */
function imported(
  displayName: string,
  text: string,
  createdAt: string,
  { pending = false } = {},
) {
  return {
    id: expect.any(String),
    commenter: {
      displayName,
      initials: expect.any(String),
      verified: false,
    },
    body: expect.arrayContaining([]),
    text,
    createdAt: new Date(createdAt).toISOString(),
    voteCounts: { up: 0, down: 0 },
    vote: null,
    pending,
    photos: [],
  };
}

/** A Comment as the Widget shows it, with its body read back as plain text. */
function asRead<T extends { body: { text: string }[] }>(comment: T) {
  return { ...comment, text: comment.body.map(({ text }) => text).join("") };
}

describe("imported Comments appear on their Pages with their original dates", () => {
  test("a published conversation shows its Replies, deeper chains attached under the top-level Comment with an @mention", async () => {
    await api.loadWidget();
    const member = await api.signedInMember();

    await member.importHyvor(hyvorExport);

    const [conversation, ...others] = shownComments(await api.loadWidget());
    if (!conversation) throw new Error("Expected the imported conversation");
    expect(others).toEqual([]);
    expect({
      ...asRead(conversation),
      replies: conversation.replies.map(asRead),
    }).toEqual({
      ...imported(
        "Marie Dupont",
        "Superbe boucle, faite en juin.\nDépart tôt conseillé\u00a0: il fait chaud & sec !",
        "2025-06-14T18:20:00Z",
      ),
      replies: [
        imported(
          "Paul Martin",
          "Merci ! Le Pas de l’Aiguille est-il équipé ?",
          "2025-06-15T08:05:00Z",
        ),
        imported(
          "Marie Dupont",
          "@Paul Martin Oui, des câbles.\nPrévoir des gants.",
          "2025-06-15T12:40:00Z",
        ),
        // It answered a Reply that was deleted on Hyvor.
        imported(
          "Paul Martin",
          "@Lucie > Message retiré.\nDommage, c'était utile.",
          "2025-06-22T11:30:00Z",
        ),
      ],
    });
  });

  test("a Page known before the import keeps its title, and a new one gets Hyvor's URL and title", async () => {
    await api.loadWidget();
    const member = await api.signedInMember();

    await member.importHyvor(hyvorExport);

    expect(
      (await member.pages()).map(({ key, title }) => ({ key, title })),
    ).toEqual([
      { key: lacBlanc.pageKey, title: "Lac Blanc | Recto Verso" },
      { key: routeSheet.pageKey, title: "Tour du Mont Aiguille" },
    ]);
    const { page } = await api.loadWidget({ page: lacBlanc });
    expect(page).toEqual({
      id: expect.any(String),
      key: lacBlanc.pageKey,
      url: lacBlanc.url,
      title: "Lac Blanc | Recto Verso",
    });
  });

  test("a deleted top-level Comment leaves a placeholder for the Reply that survives it, and links stay readable", async () => {
    const member = await api.signedInMember();

    await member.importHyvor(hyvorExport);

    const { comments } = await api.loadWidget({ page: lacBlanc });
    expect(comments).toEqual([
      expect.objectContaining({
        commenter: expect.objectContaining({ displayName: "Jean" }),
        body: [
          {
            type: "text",
            text: "Faite avec des enfants de 8 ans :\n- 3 h aller\n- pique-nique au lac",
          },
        ],
        createdAt: new Date("2025-07-03T16:45:00Z").toISOString(),
      }),
      {
        id: expect.any(String),
        deleted: true,
        createdAt: new Date("2025-07-01T07:00:00Z").toISOString(),
        replies: [
          expect.objectContaining({
            commenter: expect.objectContaining({
              displayName: "Claire Bernard",
            }),
            body: [
              { type: "text", text: "Voir aussi la fiche hiver (" },
              {
                type: "link",
                url: "https://www.rectoverso.co/article/lac-blanc-hiver",
                text: "https://www.rectoverso.co/article/lac-blanc-hiver",
              },
              { type: "text", text: ")." },
            ],
          }),
        ],
      },
    ]);
  });

  test("a pending Comment awaits approval, and spam and deleted Comments are absent", async () => {
    const member = await api.signedInMember();

    await member.importHyvor(hyvorExport);

    expect(await member.comments({ status: "pending" })).toEqual([
      expect.objectContaining({
        commenter: { displayName: "Jean", verified: false },
        text: "Mes photos : https://photos.example/aiguille",
        createdAt: new Date("2025-06-20T10:00:00Z").toISOString(),
        reply: false,
      }),
    ]);
    expect(await member.comments({ status: "spam" })).toEqual([]);
    const published = await member.comments({ status: "published" });
    expect(published.map(({ text }) => text)).not.toContainEqual(
      expect.stringMatching(/Achetez|Message retiré\.$|Parking payant/),
    );
    expect(await api.databaseHolds("Achetez")).toBe(false);
    expect(await api.databaseHolds("Parking payant")).toBe(false);
  });
});

test("a Reply dated before its top-level Comment still sits under it", async () => {
  const member = await api.signedInMember();
  const [marie, paul] = hyvorExport.comments;
  if (!marie || !paul) throw new Error("The fixture has too few Comments");

  await member.importHyvor({
    ...hyvorExport,
    comments: [
      marie,
      { ...paul, created_at: marie.created_at - 60, parent: marie },
    ],
  });

  expect(shownComments(await api.loadWidget())).toEqual([
    expect.objectContaining({
      commenter: expect.objectContaining({ displayName: "Marie Dupont" }),
      replies: [
        expect.objectContaining({
          commenter: expect.objectContaining({ displayName: "Paul Martin" }),
        }),
      ],
    }),
  ]);
});

describe("the import can run again", () => {
  test("a second run creates nothing new", async () => {
    const member = await api.signedInMember();
    await member.importHyvor(hyvorExport);
    const before = {
      routeSheet: await api.loadWidget(),
      lacBlanc: await api.loadWidget({ page: lacBlanc }),
      pending: await member.comments({ status: "pending" }),
    };

    expect(await member.importHyvor(hyvorExport, { maxComments: 50 })).toEqual({
      imported: 0,
      skipped: 3,
      alreadyPresent: 7,
    });
    expect({
      routeSheet: await api.loadWidget(),
      lacBlanc: await api.loadWidget({ page: lacBlanc }),
      pending: await member.comments({ status: "pending" }),
    }).toEqual(before);
  });

  test("a later export adds only the Comments posted in between, under the conversations already imported", async () => {
    const member = await api.signedInMember();
    await member.importHyvor(hyvorExport);
    const [marie] = hyvorExport.comments;
    if (!marie) throw new Error("The fixture has no Comments");
    const later: HyvorExport = {
      ...hyvorExport,
      comments: [
        ...hyvorExport.comments,
        {
          ...marie,
          id: 1011,
          created_at: Date.parse("2026-10-01T09:00:00Z") / 1000,
          body_html: "<p>Refaite cet automne, toujours aussi belle.</p>",
          parent: marie,
        },
      ],
    };

    expect(await member.importHyvor(later)).toEqual({
      imported: 1,
      skipped: 3,
      alreadyPresent: 7,
    });
    const [conversation] = shownComments(await api.loadWidget());
    expect(conversation?.replies.at(-1)).toMatchObject({
      commenter: { displayName: "Marie Dupont" },
      body: [
        { type: "text", text: "Refaite cet automne, toujours aussi belle." },
      ],
    });
  });
});

describe("the import brings Comments only", () => {
  test("no Reaction or Vote count is imported", async () => {
    const member = await api.signedInMember();

    await member.importHyvor(hyvorExport);

    for (const page of [routeSheet, lacBlanc]) {
      const { reactionSet, comments } = await api.loadWidget({ page });
      expect(reactionSet.options.map(({ count }) => count)).toEqual([0, 0, 0]);
      for (const comment of comments) {
        for (const shown of [comment, ...comment.replies]) {
          if ("voteCounts" in shown) {
            expect(shown.voteCounts).toEqual({ up: 0, down: 0 });
          }
        }
      }
    }
  });

  test("nobody is emailed about imported Comments", async () => {
    const member = await api.signedInMember();
    const sent = api.outbox.sent.length;

    await member.importHyvor(hyvorExport);

    expect(api.outbox.sent.length).toBe(sent);
  });
});

describe("imported authors are Guests", () => {
  test("imported authors are unverified, and the emails of authors with nothing imported are not kept", async () => {
    const member = await api.signedInMember();

    await member.importHyvor(hyvorExport);

    const commenters = [
      ...(await member.comments({ status: "published" })),
      ...(await member.comments({ status: "pending" })),
    ].map(({ commenter }) => commenter);
    expect(new Set(commenters.map(({ verified }) => verified))).toEqual(
      new Set([false]),
    );
    // No API shows a Guest's email yet, so a test can only tell that the
    // emails of authors with nothing imported are not kept. Verification by
    // magic link will show the others.
    expect(await api.databaseHolds("lucie@example.org")).toBe(false);
    expect(await api.databaseHolds("promo@spam.example")).toBe(false);
  });

  test("no IP address from the export is kept (ADR-0006)", async () => {
    const member = await api.signedInMember();

    await member.importHyvor(hyvorExport);

    expect(await api.databaseHolds("203.0.113.7")).toBe(false);
  });
});
