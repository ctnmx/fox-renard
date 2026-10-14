import { randomUUID } from "node:crypto";
import type { Email } from "@fox-renard/core";
import { magicLinkIn } from "@fox-renard/core/fakes";
import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { apiOrigin, siteOrigin } from "../src/addresses";

const prompt = "Alors, cet itinéraire ?";

async function scrollToWidget(page: Page) {
  const widget = page.locator("fox-renard-widget");
  await widget.scrollIntoViewIfNeeded();
  return widget;
}

/** The magic link in the latest email the demo's outbox sent to `address`. */
async function magicLinkTo(request: APIRequestContext, address: string) {
  const outbox = await request.get(`${apiOrigin}/outbox`);
  const sent: Email[] = await outbox.json();
  const email = sent.findLast(({ to }) => to === address);
  const link = email && magicLinkIn(email.text);
  if (!link) throw new Error(`No magic link was sent to ${address}`);
  return link;
}

test.describe("the Widget on a route sheet", () => {
  test("shows the prompt and the three Reaction Options intact despite the page's hostile CSS", async ({
    page,
  }) => {
    await page.goto("/");
    const widget = await scrollToWidget(page);

    // innerText applies text-transform, so an inherited `uppercase` would show.
    const reactionSet = widget.getByRole("group", { name: prompt });
    await expect(widget.getByText(prompt)).toBeVisible();
    await expect(widget.getByText(prompt)).toHaveText(prompt, {
      useInnerText: true,
    });

    const options = reactionSet.getByRole("button");
    await expect(options).toHaveText(
      [
        /💡\s*Je m'inspire\s*0/,
        /🎒\s*Je le prépare\s*0/,
        /🏁\s*Je l'ai fait !\s*0/,
      ],
      { useInnerText: true },
    );
    for (const option of await options.all()) {
      await expect(option).toBeVisible();
      await expect(option).not.toHaveCSS("color", "rgba(0, 0, 0, 0)");
      await expect(option).toHaveCSS("letter-spacing", "normal");
    }
  });

  test("loads only when the Visitor scrolls near it", async ({ page }) => {
    const widgetDataRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/widget?")) {
        widgetDataRequests.push(request.url());
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(widgetDataRequests).toEqual([]);

    const widget = await scrollToWidget(page);
    await expect(widget.getByText(prompt)).toBeVisible();
    expect(widgetDataRequests).toHaveLength(1);
  });

  test("uses the route sheet's font", async ({ page }) => {
    await page.goto("/");
    const widget = await scrollToWidget(page);
    const siteFont = await page
      .locator("body")
      .evaluate((body) => getComputedStyle(body).fontFamily);

    await expect(widget.getByText(prompt)).toHaveCSS("font-family", siteFont);
    for (const option of await widget.getByRole("button").all()) {
      await expect(option).toHaveCSS("font-family", siteFont);
    }
  });

  test("reaches every Reaction Option from the keyboard, with a visible focus", async ({
    page,
  }) => {
    await page.goto("/");
    const widget = await scrollToWidget(page);
    const options = widget
      .getByRole("group", { name: prompt })
      .getByRole("button");
    await expect(options).toHaveCount(3);

    // The last link of the route sheet before the Widget.
    await page.getByRole("link", { name: "Télécharger la trace GPX" }).focus();
    for (const option of await options.all()) {
      await page.keyboard.press("Tab");
      await expect(option).toBeFocused();
      await expect(option).toHaveCSS("outline-style", "solid");
    }
  });

  test("links discreetly to Fox Renard", async ({ page }) => {
    await page.goto("/");
    const widget = await scrollToWidget(page);

    const poweredBy = widget.getByRole("link", {
      name: "Propulsé par Fox Renard",
    });
    await expect(poweredBy).toBeVisible();
    await expect(poweredBy).toHaveAttribute("href", "https://foxrenard.com");
  });
});

test.describe("Reactions on a route sheet", () => {
  test("a Visitor reacts, still sees their Reaction after a reload, changes it, then removes it", async ({
    page,
  }) => {
    // A route sheet of its own, so its counts start at zero.
    await page.goto(`/article/essai-${randomUUID()}`);
    let widget = await scrollToWidget(page);
    const option = (label: string) =>
      widget.getByRole("button", { name: label });

    await option("Je le prépare").click();
    await expect(option("Je le prépare")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(option("Je le prépare")).toContainText("1");

    await page.reload();
    widget = await scrollToWidget(page);
    await expect(option("Je le prépare")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(option("Je l'ai fait !")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    const background = (label: string) =>
      option(label).evaluate((button) => getComputedStyle(button).background);
    expect(await background("Je le prépare")).not.toBe(
      await background("Je l'ai fait !"),
    );

    await option("Je l'ai fait !").click();
    await expect(option("Je l'ai fait !")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(option("Je le prépare")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(
      widget.getByRole("group", { name: prompt }).getByRole("button"),
    ).toHaveText(
      [/Je m'inspire\s*0/, /Je le prépare\s*0/, /Je l'ai fait !\s*1/],
      { useInnerText: true },
    );

    // Tapping the highlighted option again removes the Reaction.
    await option("Je l'ai fait !").click();
    await expect(option("Je l'ai fait !")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(option("Je l'ai fait !")).toContainText("0");
  });
});

test.describe("Comments on a route sheet", () => {
  test("a Guest posts a Comment, sees it listed, and finds their display name prefilled after a reload", async ({
    page,
  }) => {
    const thirdPartyRequests: string[] = [];
    page.on("request", (request) => {
      const { origin } = new URL(request.url());
      if (origin !== siteOrigin && origin !== apiOrigin) {
        thirdPartyRequests.push(request.url());
      }
    });

    // A route sheet of its own, so it starts with no Comment.
    await page.goto(`/article/essai-${randomUUID()}`);
    let widget = await scrollToWidget(page);
    const displayName = () => widget.getByRole("textbox", { name: "Ton nom" });
    const commentBox = widget.getByRole("textbox", { name: "Ton commentaire" });
    await expect(commentBox).toHaveAttribute(
      "placeholder",
      "Écris ton commentaire",
    );

    await displayName().fill("Marie Dupont");
    await commentBox.fill(
      "Superbe boucle !\n<b>Trace</b> : https://example.com/trace.gpx",
    );
    await widget.getByRole("button", { name: "Publier" }).click();

    const comment = widget.getByRole("article");
    await expect(comment).toHaveCount(1);
    await expect(commentBox).toHaveValue("");
    await expect(comment.getByText("Marie Dupont")).toBeVisible();
    await expect(comment.getByText("MD", { exact: true })).toBeVisible();
    await expect(comment.getByText("à l'instant")).toBeVisible();
    // The line break shows, and the HTML reads as written.
    expect(
      await comment
        .getByText(/Superbe boucle/)
        .evaluate((body: HTMLElement) => body.innerText),
    ).toBe("Superbe boucle !\n<b>Trace</b> : https://example.com/trace.gpx");
    const link = comment.getByRole("link", {
      name: "https://example.com/trace.gpx",
    });
    await expect(link).toHaveAttribute("href", "https://example.com/trace.gpx");
    await expect(link).toHaveAttribute("rel", /\bnofollow\b/);
    await expect(link).toHaveAttribute("rel", /\bugc\b/);

    await page.reload();
    widget = await scrollToWidget(page);
    await expect(displayName()).toHaveValue("Marie Dupont");
    await expect(widget.getByRole("article")).toHaveCount(1);
    expect(thirdPartyRequests).toEqual([]);
  });

  test("a Guest's Comment with a link awaits approval: its Commenter sees it marked, another browser does not", async ({
    page,
    browser,
  }) => {
    // A route sheet of its own, so it starts with no Comment.
    const routeSheet = `/article/essai-${randomUUID()}`;
    await page.goto(routeSheet);
    const widget = await scrollToWidget(page);
    await widget.getByRole("textbox", { name: "Ton nom" }).fill("Marie");
    await widget
      .getByRole("textbox", { name: "Ton commentaire" })
      .fill("Mes photos du tour : https://photos.example/aiguille");
    await widget.getByRole("button", { name: "Publier" }).click();

    await expect(widget.getByRole("status")).toContainText(
      "en attente d'approbation",
    );
    await expect(widget.getByRole("article")).toContainText(
      "En attente d'approbation",
    );

    const elsewhere = await (await browser.newContext()).newPage();
    await elsewhere.goto(routeSheet);
    const otherWidget = await scrollToWidget(elsewhere);
    await expect(otherWidget.getByText(prompt)).toBeVisible();
    await expect(otherWidget.getByRole("article")).toHaveCount(0);
  });

  test("a Comment over the length limit is refused with a message", async ({
    page,
  }) => {
    await page.goto(`/article/essai-${randomUUID()}`);
    const widget = await scrollToWidget(page);

    await widget.getByRole("textbox", { name: "Ton nom" }).fill("Marie");
    await widget
      .getByRole("textbox", { name: "Ton commentaire" })
      .fill("é".repeat(5001));
    await widget.getByRole("button", { name: "Publier" }).click();

    await expect(widget.getByRole("alert")).toHaveText(
      "Ton commentaire est trop long.",
    );
    await expect(widget.getByRole("article")).toHaveCount(0);
  });
});

test.describe("Replies on a route sheet", () => {
  test("a Guest replies to a Comment, its Commenter replies to that Reply, and both Replies sit under the Comment", async ({
    page,
    browser,
  }) => {
    // A route sheet of its own, so it starts with no Comment.
    const routeSheet = `${siteOrigin}/article/essai-${randomUUID()}`;
    await page.goto(routeSheet);
    let marie = await scrollToWidget(page);
    await marie.getByRole("textbox", { name: "Ton nom" }).fill("Marie Dupont");
    await marie
      .getByRole("textbox", { name: "Ton commentaire" })
      .fill("Superbe boucle, faite en juin.");
    await marie.getByRole("button", { name: "Publier" }).click();
    await expect(marie.getByRole("article")).toHaveCount(1);

    // Paul replies from a browser of his own.
    const paulsPage = await (await browser.newContext()).newPage();
    await paulsPage.goto(routeSheet);
    const paul = await scrollToWidget(paulsPage);
    await paul.getByRole("button", { name: "Répondre" }).click();
    const paulsForm = paul.getByRole("form", {
      name: "Répondre à Marie Dupont",
    });
    await expect(
      paulsForm.getByRole("textbox", { name: "Ton nom" }),
    ).toBeFocused();
    await paulsForm
      .getByRole("textbox", { name: "Ton nom" })
      .fill("Paul Martin");
    await paulsForm
      .getByRole("textbox", { name: "Ta réponse" })
      .fill("Le Pas de l'Aiguille est-il équipé ?");
    await paulsForm.getByRole("button", { name: "Publier" }).click();
    await expect(paulsForm).toHaveCount(0);
    await expect(
      paul
        .getByRole("list", { name: "Réponses à Marie Dupont" })
        .getByRole("article"),
    ).toHaveText([/Paul Martin[\s\S]*Le Pas de l'Aiguille est-il équipé \?/]);

    // Marie answers Paul's Reply.
    await page.reload();
    marie = await scrollToWidget(page);
    const replies = marie.getByRole("list", {
      name: "Réponses à Marie Dupont",
    });
    await replies.getByRole("button", { name: "Répondre" }).click();
    const mariesForm = marie.getByRole("form", {
      name: "Répondre à Paul Martin",
    });
    await expect(
      mariesForm.getByRole("textbox", { name: "Ton nom" }),
    ).toHaveValue("Marie Dupont");
    const mariesReply = mariesForm.getByRole("textbox", { name: "Ta réponse" });
    await expect(mariesReply).toBeFocused();
    await mariesReply.fill("Oui, avec des câbles.");
    await mariesForm.getByRole("button", { name: "Publier" }).click();

    await expect(replies.getByRole("article")).toHaveText([
      /Paul Martin[\s\S]*Le Pas de l'Aiguille est-il équipé \?/,
      /Marie Dupont[\s\S]*@Paul Martin Oui, avec des câbles\./,
    ]);
    await expect(marie.getByRole("article")).toHaveCount(3);
  });

  test("a Visitor opens a Reply form from the keyboard and cancels it, back on its Répondre button", async ({
    page,
  }) => {
    await page.goto(`/article/essai-${randomUUID()}`);
    const widget = await scrollToWidget(page);
    await widget.getByRole("textbox", { name: "Ton nom" }).fill("Marie Dupont");
    await widget
      .getByRole("textbox", { name: "Ton commentaire" })
      .fill("Superbe boucle.");
    await widget.getByRole("button", { name: "Publier" }).click();

    const reply = widget.getByRole("article").getByRole("button", {
      name: "Répondre",
    });
    await reply.focus();
    await page.keyboard.press("Enter");
    const form = widget.getByRole("form", { name: "Répondre à Marie Dupont" });
    // The display name is known, so the Reply form opens on its text.
    await expect(
      form.getByRole("textbox", { name: "Ta réponse" }),
    ).toBeFocused();

    await form.getByRole("button", { name: "Annuler" }).click();
    await expect(form).toHaveCount(0);
    await expect(reply).toBeFocused();
  });
});

test.describe("Votes and sorting on a route sheet", () => {
  test("a Visitor votes on a Comment, changes their Vote, and switches between the three sort orders", async ({
    page,
  }) => {
    // A route sheet of its own, so it starts with no Comment.
    await page.goto(`/article/essai-${randomUUID()}`);
    let widget = await scrollToWidget(page);
    for (const text of ["Première.", "Deuxième.", "Troisième."]) {
      await widget.getByRole("textbox", { name: "Ton nom" }).fill("Marie");
      await widget.getByRole("textbox", { name: "Ton commentaire" }).fill(text);
      await widget.getByRole("button", { name: "Publier" }).click();
      await expect(widget.getByText(text)).toBeVisible();
    }
    const comment = (text: string) =>
      widget.getByRole("article").filter({ hasText: text });
    const up = (text: string) =>
      comment(text).getByRole("button", { name: /^Voter pour/ });
    const down = (text: string) =>
      comment(text).getByRole("button", { name: /^Voter contre/ });

    await up("Deuxième.").click();
    await expect(up("Deuxième.")).toHaveAttribute("aria-pressed", "true");
    await expect(up("Deuxième.")).toContainText("1");

    // Voting down moves the Vote.
    await down("Deuxième.").click();
    await expect(down("Deuxième.")).toHaveAttribute("aria-pressed", "true");
    await expect(up("Deuxième.")).toHaveAttribute("aria-pressed", "false");
    await expect(up("Deuxième.")).toContainText("0");
    await expect(down("Deuxième.")).toContainText("1");

    // Top, the default, lists the down-voted Comment last.
    await page.reload();
    widget = await scrollToWidget(page);
    await expect(down("Deuxième.")).toHaveAttribute("aria-pressed", "true");
    const sort = widget.getByRole("combobox", { name: "Trier par" });
    await expect(sort).toHaveValue("top");
    const order = [/Troisième/, /Première/, /Deuxième/];
    await expect(widget.getByRole("article")).toHaveText(order);

    await sort.selectOption({ label: "Plus récents" });
    await expect(widget.getByRole("article")).toHaveText([
      /Troisième/,
      /Deuxième/,
      /Première/,
    ]);

    await sort.selectOption({ label: "Plus anciens" });
    await expect(widget.getByRole("article")).toHaveText([
      /Première/,
      /Deuxième/,
      /Troisième/,
    ]);

    await sort.selectOption({ label: "Top" });
    await expect(widget.getByRole("article")).toHaveText(order);
  });
});

test.describe("Email verification on a route sheet", () => {
  test("a Guest posts with their email, opens the magic link from the outbox, confirms, and sees the verified badge", async ({
    page,
    browser,
    request,
  }) => {
    // A route sheet and an address of their own, as tests share the demo.
    await page.goto(`/article/essai-${randomUUID()}`);
    const email = `marie-${randomUUID()}@example.com`;
    let widget = await scrollToWidget(page);
    await widget.getByRole("textbox", { name: "Ton nom" }).fill("Marie Dupont");
    await widget
      .getByRole("textbox", { name: "Ton email (facultatif)" })
      .fill(email);
    await widget
      .getByRole("textbox", { name: "Ton commentaire" })
      .fill("Superbe boucle, faite en juin.");
    await widget.getByRole("button", { name: "Publier" }).click();

    await expect(widget.getByRole("status")).toHaveText(
      `Un lien de confirmation a été envoyé à ${email}.`,
    );
    const badge = () =>
      widget.getByRole("article").getByRole("img", { name: "Email vérifié" });
    await expect(widget.getByRole("article")).toHaveCount(1);
    await expect(badge()).toHaveCount(0);

    const link = await magicLinkTo(request, email);
    const confirm = { name: "Confirmer mon adresse email" };

    // A mail scanner that opens the link, in a browser of its own, spends
    // nothing: it does not click.
    const scanner = await (await browser.newContext()).newPage();
    await scanner.goto(link);
    await expect(
      scanner.locator("fox-renard-widget").getByRole("button", confirm),
    ).toBeVisible();

    // The email opens the link in a new tab of the same browser. The Widget
    // loads and comes into view without the Visitor scrolling.
    const opened = await page.context().newPage();
    await opened.goto(link);
    widget = opened.locator("fox-renard-widget");
    await expect(widget).toBeInViewport();
    await widget.getByRole("button", confirm).click();

    await expect(widget.getByRole("status")).toHaveText(
      "Ton adresse email est confirmée.",
    );
    await expect(badge()).toBeVisible();
    await expect(widget.getByRole("button", confirm)).toHaveCount(0);
    // The token leaves the address bar, so it is neither reused nor shared.
    expect(opened.url()).not.toContain("fox-renard-magic-link");
    // A Verified Commenter is asked for no email.
    await expect(
      widget.getByRole("textbox", { name: "Ton email (facultatif)" }),
    ).toHaveCount(0);
  });
});
