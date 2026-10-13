import { randomUUID } from "node:crypto";
import { createClient } from "@fox-renard/api/client";
import { rectoVerso } from "@fox-renard/db";
import { apiOrigin, siteOrigin } from "@fox-renard/demo/addresses";
import { expect, type Page, test } from "@playwright/test";

// Seam 3: the Worker as Cloudflare runs it, with Hyperdrive, its secrets and
// its schedule, driven from the demo route sheet. Tests tagged @smoke also run
// against each deployment, where they only load the Widget.

const prompt = "Alors, cet itinéraire ?";

async function scrollToWidget(page: Page) {
  const widget = page.locator("fox-renard-widget");
  await widget.scrollIntoViewIfNeeded();
  return widget;
}

/**
 * A network of its own, as Cloudflare reports a client's IP address: abuse
 * limits remember a network for 23 hours, across runs of Seam 3.
 */
function newNetwork() {
  const hextet = () => Math.floor(Math.random() * 0x10000).toString(16);
  return `2001:db8:${hextet()}:${hextet()}::1`;
}

test("the Widget shows Recto Verso's Reaction Set", { tag: "@smoke" }, async ({
  page,
}) => {
  // The one Page the smoke check adds to each deployment.
  await page.goto("/article/smoke-check");
  const widget = await scrollToWidget(page);

  await expect(
    widget.getByRole("group", { name: prompt }).getByRole("button"),
  ).toHaveText([
    /💡\s*Je m'inspire/,
    /🎒\s*Je le prépare/,
    /🏁\s*Je l'ai fait !/,
  ]);
});

test("a Visitor's Reaction still counts after a reload", async ({ page }) => {
  // A route sheet of its own, so its counts start at zero.
  await page.goto(`/article/seam-3-${randomUUID()}`);
  let widget = await scrollToWidget(page);
  const option = () => widget.getByRole("button", { name: "Je le prépare" });

  await option().click();
  await expect(option()).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  widget = await scrollToWidget(page);
  await expect(option()).toHaveAttribute("aria-pressed", "true");
  await expect(option()).toContainText("1");
});

test("a Guest's Comment posts, its bot check solved in the Worker's ALTCHA", async ({
  page,
}) => {
  await page.goto(`/article/seam-3-${randomUUID()}`);
  const widget = await scrollToWidget(page);

  await widget.getByRole("textbox", { name: "Ton nom" }).fill("Marie");
  await widget
    .getByRole("textbox", { name: "Ton commentaire" })
    .fill("Superbe boucle.");
  await widget.getByRole("button", { name: "Publier" }).click();

  await expect(widget.getByRole("article")).toContainText("Superbe boucle.");
});

test("abuse limits count each network Cloudflare reports apart", async () => {
  const client = createClient(apiOrigin);
  const onPage = client.v1.sites[":siteId"].pages[":pageKey"];
  const param = {
    siteId: rectoVerso.siteId,
    pageKey: `article-seam-3-${randomUUID()}`,
  };
  const [{ id: optionId }] = rectoVerso.reactionSet.options;
  const fromNetwork = (clientIp: string) => ({
    headers: { Origin: siteOrigin, "CF-Connecting-IP": clientIp },
  });

  // Loading the Widget creates the Page.
  const firstSight = await onPage.widget.$get(
    {
      param,
      query: { url: `${siteOrigin}/article/seam-3`, title: "Seam 3" },
      header: {},
    },
    fromNetwork(newNetwork()),
  );
  expect(firstSight.status).toBe(200);

  /** A new browser reacts, then takes its Reaction back, and so on; the status of each request. */
  async function reactRepeatedly(clientIp: string, times: number) {
    const statuses: number[] = [];
    let browserToken: string | undefined;
    for (let i = 0; i < times; i++) {
      const response = await onPage.reaction.$put(
        {
          param,
          header: browserToken
            ? { authorization: `Bearer ${browserToken}` }
            : {},
          json: { optionId: i % 2 === 0 ? optionId : null },
        },
        fromNetwork(clientIp),
      );
      statuses.push(response.status);
      if (response.status === 200) {
        ({ browserToken } = await response.json());
      }
    }
    return statuses;
  }

  // A network may react 100 times while remembered, a browser 50 times.
  const office = newNetwork();
  const fifty = Array<number>(50).fill(200);
  expect(await reactRepeatedly(office, 50)).toEqual(fifty);
  expect(await reactRepeatedly(office, 50)).toEqual(fifty);
  expect(await reactRepeatedly(office, 1)).toEqual([429]);

  expect(await reactRepeatedly(newNetwork(), 1)).toEqual([200]);
});

test("the hourly Cron Trigger runs the erasure without failing", async ({
  request,
}) => {
  // wrangler dev fires the Cron Trigger as Cloudflare does every hour.
  const cronTrigger = await request.get(
    `${apiOrigin}/cdn-cgi/local/scheduled?cron=${encodeURIComponent("0 * * * *")}`,
  );

  expect(cronTrigger.status()).toBe(200);
});
