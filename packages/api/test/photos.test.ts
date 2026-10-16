import { beforeEach, describe, expect, test } from "vitest";
import {
  anotherSite,
  shownComments,
  startTestApi,
  type TestApi,
} from "./harness";
import { jpegPhoto, pngPhoto, webpPhoto } from "./images";

let api: TestApi;

beforeEach(async () => {
  api = await startTestApi();
  await api.loadWidget();
});

/** Marie's browser, linked to her Verified Commenter by a magic link. */
async function verifiedMarie() {
  const marie = api.newBrowser();
  await marie.post("Marie", "Premier passage.", { email: "marie@example.com" });
  await marie.followMagicLink(api.magicLinkTo("marie@example.com"));
  return marie;
}

describe("a Verified Commenter attaches Photos to their Comment", () => {
  test("an attached Photo shows with its Comment, and any page loads it", async () => {
    const marie = await verifiedMarie();
    const { comment } = await marie.post("Marie", "Le Pas de l'Aiguille.");
    const photo = webpPhoto();

    const attached = await marie.attachPhoto(comment.id, photo);

    const shown = shownComments(await api.loadWidget()).find(
      ({ id }) => id === comment.id,
    );
    expect(shown?.photos).toEqual([{ id: attached.id }]);
    const response = await api.getPhoto(attached.id);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array(photo),
    );
  });
});

describe("only a Verified Commenter attaches Photos, to their own fresh Comment", () => {
  test("a Guest is refused", async () => {
    const guest = api.newBrowser();
    const { comment } = await guest.post("Paul", "Belle boucle.");

    const response = await guest.tryAttachPhoto(comment.id, webpPhoto());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "verification_required" });
  });

  test("another Verified Commenter cannot attach to Marie's Comment", async () => {
    const marie = await verifiedMarie();
    const { comment } = await marie.post("Marie", "Le Pas de l'Aiguille.");
    const paul = api.newBrowser();
    await paul.post("Paul", "Salut.", { email: "paul@example.com" });
    await paul.followMagicLink(api.magicLinkTo("paul@example.com"));

    const response = await paul.tryAttachPhoto(comment.id, webpPhoto());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_comment_author" });
  });

  test("a fifth Photo is refused", async () => {
    const marie = await verifiedMarie();
    const { comment } = await marie.post("Marie", "Quatre vues.");
    for (let i = 0; i < 4; i++)
      await marie.attachPhoto(comment.id, webpPhoto());

    const response = await marie.tryAttachPhoto(comment.id, webpPhoto());

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "too_many_photos" });
    const [shown] = shownComments(await api.loadWidget()).filter(
      ({ id }) => id === comment.id,
    );
    expect(shown?.photos).toHaveLength(4);
  });

  test("five Photos sent at once still leave four", async () => {
    const marie = await verifiedMarie();
    const { comment } = await marie.post("Marie", "Cinq vues.");

    const statuses = await Promise.all(
      Array.from(
        { length: 5 },
        async () =>
          (await marie.tryAttachPhoto(comment.id, webpPhoto())).status,
      ),
    );

    expect(statuses.toSorted()).toEqual([201, 201, 201, 201, 422]);
    expect(api.photos.size).toBe(4);
  });

  test("Photos are attached within 15 minutes of posting", async () => {
    const marie = await verifiedMarie();
    const { comment } = await marie.post("Marie", "Vue du sommet.");
    api.clock.advance(15 * 60 * 1000 - 1);
    await marie.attachPhoto(comment.id, webpPhoto());
    api.clock.advance(1);

    const response = await marie.tryAttachPhoto(comment.id, webpPhoto());

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "photo_too_late" });
  });
});

describe("the API keeps only still images without metadata", () => {
  test("a PNG from a browser that cannot make WebP is taken", async () => {
    const marie = await verifiedMarie();
    const { comment } = await marie.post("Marie", "Vue du sommet.");

    const attached = await marie.attachPhoto(comment.id, pngPhoto(), {
      contentType: "image/png",
    });

    const response = await api.getPhoto(attached.id);
    expect(response.headers.get("Content-Type")).toBe("image/png");
  });

  test("a JPEG is refused", async () => {
    const marie = await verifiedMarie();
    const { comment } = await marie.post("Marie", "Vue du sommet.");

    const response = await marie.tryAttachPhoto(comment.id, jpegPhoto, {
      contentType: "image/jpeg",
    });

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "not_a_photo" });
  });

  test("a Photo over 1 MB is refused", async () => {
    const marie = await verifiedMarie();
    const { comment } = await marie.post("Marie", "Vue du sommet.");

    const response = await marie.tryAttachPhoto(
      comment.id,
      webpPhoto({ padTo: 1_000_001 }),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "photo_too_large" });
  });

  test.each([
    [
      "a WebP with EXIF, where GPS positions live",
      webpPhoto({ withExif: true }),
      "image/webp",
    ],
    ["a WebP with XMP", webpPhoto({ withXmp: true }), "image/webp"],
    ["a PNG with EXIF", pngPhoto({ withExif: true }), "image/png"],
    ["a PNG with XMP", pngPhoto({ withXmp: true }), "image/png"],
  ])(
    "%s is refused, and nothing of it is kept",
    async (_, photo, contentType) => {
      const marie = await verifiedMarie();
      const { comment } = await marie.post("Marie", "Vue du sommet.");

      const response = await marie.tryAttachPhoto(comment.id, photo, {
        contentType,
      });

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "photo_has_metadata" });
      expect(api.photos.size).toBe(0);
      const [shown] = shownComments(await api.loadWidget()).filter(
        ({ id }) => id === comment.id,
      );
      expect(shown?.photos).toEqual([]);
    },
  );
});

describe("a Photo shows as long as its Comment does", () => {
  test("a Comment marked as spam has its Photos served to nobody, until a Member approves it", async () => {
    const marie = await verifiedMarie();
    const { comment } = await marie.post("Marie", "Vue du sommet.");
    const photo = await marie.attachPhoto(comment.id, webpPhoto());
    const member = await api.signedInMember();

    await member.markAsSpam(comment.id);
    expect((await api.getPhoto(photo.id)).status).toBe(404);

    await member.approve(comment.id);
    expect((await api.getPhoto(photo.id)).status).toBe(200);
  });

  test("a browser holding a Photo is told it still shows, and once its Comment is deleted, that it is gone", async () => {
    const marie = await verifiedMarie();
    const { comment } = await marie.post("Marie", "Vue du sommet.");
    const photo = await marie.attachPhoto(comment.id, webpPhoto());
    const first = await api.getPhoto(photo.id);
    const tag = first.headers.get("ETag") ?? "";
    expect(first.headers.get("Cache-Control")).toBe("no-cache");

    const unchanged = await api.getPhoto(photo.id, { heldTag: tag });
    expect(unchanged.status).toBe(304);

    await (await api.signedInMember()).delete(comment.id);
    expect((await api.getPhoto(photo.id, { heldTag: tag })).status).toBe(404);
  });

  test("a Photo is served for its own Site only", async () => {
    const marie = await verifiedMarie();
    const { comment } = await marie.post("Marie", "Vue du sommet.");
    const photo = await marie.attachPhoto(comment.id, webpPhoto());

    const response = await api.getPhoto(photo.id, {
      siteId: anotherSite.siteId,
    });

    expect(response.status).toBe(404);
  });

  test("deleting a Comment deletes its Photos from the Photo store", async () => {
    const marie = await verifiedMarie();
    const { comment } = await marie.post("Marie", "Vue du sommet.");
    const photo = await marie.attachPhoto(comment.id, webpPhoto());
    await marie.attachPhoto(comment.id, webpPhoto());
    const member = await api.signedInMember();

    await member.delete(comment.id);

    expect(api.photos.size).toBe(0);
    expect((await api.getPhoto(photo.id)).status).toBe(404);
  });

  test("a deleted Comment that keeps its Replies under a placeholder loses its Photos, and the Replies keep theirs", async () => {
    const marie = await verifiedMarie();
    const { comment } = await marie.post("Marie", "Vue du sommet.");
    const gone = await marie.attachPhoto(comment.id, webpPhoto());
    const { comment: reply } = await marie.post(
      "Marie",
      "Et de l'autre côté.",
      {
        replyTo: comment.id,
      },
    );
    const kept = await marie.attachPhoto(reply.id, webpPhoto());
    const member = await api.signedInMember();

    await member.delete(comment.id);

    expect(api.photos.size).toBe(1);
    expect((await api.getPhoto(gone.id)).status).toBe(404);
    expect((await api.getPhoto(kept.id)).status).toBe(200);
    const [placeholder] = (await api.loadWidget()).comments.filter(
      ({ id }) => id === comment.id,
    );
    expect(placeholder).toMatchObject({
      deleted: true,
      replies: [{ id: reply.id, photos: [{ id: kept.id }] }],
    });
  });
});
