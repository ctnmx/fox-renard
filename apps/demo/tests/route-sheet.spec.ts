import { expect, type Page, test } from "@playwright/test";

const prompt = "Alors, cet itinéraire ?";

async function scrollToWidget(page: Page) {
  const widget = page.locator("fox-renard-widget");
  await widget.scrollIntoViewIfNeeded();
  return widget;
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
