import { beforeEach, describe, expect, test } from "vitest";
import {
  consoleOrigin,
  rectoVerso,
  routeSheet,
  startTestApi,
  type TestApi,
  veloSheet,
} from "./harness";

let api: TestApi;

beforeEach(async () => {
  api = await startTestApi();
  await api.loadWidget();
});

describe("Members are emailed every new Comment", () => {
  test("each new Comment puts one email per Member of its Site in the outbox, as the Site via Fox Renard", async () => {
    await api.loadWidget({ page: veloSheet });

    await api.newBrowser().post("Marie", "Superbe boucle.");

    expect(api.emailsTo("membre@example.com")).toEqual([
      {
        to: "membre@example.com",
        senderName: "Recto Verso via Fox Renard",
        subject: "Nouveau commentaire de Marie sur Recto Verso",
        text: expect.stringContaining("Superbe boucle."),
      },
    ]);
    expect(api.emailsTo("membre@velo.example")).toEqual([]);
  });

  test("the email names the Page, and links to its Comments on the console", async () => {
    await api.newBrowser().post("Marie", "Superbe boucle.");

    const [email] = api.emailsTo("membre@example.com");
    expect(email?.text).toContain("« Tour du Mont Aiguille »");
    expect(email?.text).toContain(
      `${consoleOrigin}/?site=${rectoVerso.siteId}&status=published&page=${routeSheet.pageKey}`,
    );
  });

  test("a Reply and a Pending Comment are emailed too, the Pending one as awaiting approval", async () => {
    const { comment } = await api.newBrowser().post("Marie", "Superbe boucle.");

    await api.newBrowser().post("Paul", "Merci !", { replyTo: comment.id });
    await api
      .newBrowser()
      .post("Jeanne", "Mes photos : https://photos.example/aiguille");

    const [, reply, pending] = api.emailsTo("membre@example.com");
    expect(reply).toMatchObject({
      subject: "Nouvelle réponse de Paul sur Recto Verso",
      text: expect.stringContaining("Merci !"),
    });
    expect(pending).toMatchObject({
      subject: "Commentaire en attente de Jeanne sur Recto Verso",
      text: expect.stringMatching(
        `${consoleOrigin}/\\?site=.+&status=pending&page=`,
      ),
    });
  });

  test("a Comment posts even when its Members' email cannot be sent", async () => {
    api.outbox.delivers = false;

    const posted = await api.newBrowser().tryPost("Marie", "Superbe boucle.");

    expect(posted.status).toBe(201);
  });
});
