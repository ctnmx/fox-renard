import type { Page, Store } from "@fox-renard/core";
import { and, eq } from "drizzle-orm";
import type { Database } from "./database";
import { pages } from "./schema";

export function createStore(db: Database): Store {
  const pageColumns = {
    id: pages.id,
    key: pages.key,
    url: pages.url,
    title: pages.title,
  };

  async function findPage(siteId: string, key: string) {
    const [page] = await db
      .select(pageColumns)
      .from(pages)
      .where(and(eq(pages.siteId, siteId), eq(pages.key, key)));
    return page;
  }

  async function insertPage(siteId: string, page: Omit<Page, "id">) {
    const [inserted] = await db
      .insert(pages)
      .values({ siteId, ...page })
      .onConflictDoNothing({ target: [pages.siteId, pages.key] })
      .returning(pageColumns);
    return inserted;
  }

  return {
    async findSite(siteId) {
      const site = await db.query.sites.findFirst({
        columns: { id: true },
        where: (sites, { eq }) => eq(sites.id, siteId),
        with: {
          allowedDomains: { columns: { domain: true } },
          reactionSet: {
            columns: { prompt: true },
            with: {
              options: {
                orderBy: (options, { asc }) => [asc(options.position)],
              },
            },
          },
        },
      });
      if (!site?.reactionSet) return null;

      return {
        id: site.id,
        allowedDomains: site.allowedDomains.map(({ domain }) => domain),
        reactionSet: {
          prompt: site.reactionSet.prompt,
          options: site.reactionSet.options.map((option) => ({
            id: option.id,
            picto: { type: "emoji", emoji: option.pictoEmoji },
            label: option.label,
          })),
        },
      };
    },

    async findOrCreatePage(siteId, page) {
      // A concurrent first load may insert the Page between our two queries,
      // in which case the insert does nothing and the Page is read again.
      const found =
        (await findPage(siteId, page.key)) ??
        (await insertPage(siteId, page)) ??
        (await findPage(siteId, page.key));
      if (!found) throw new Error(`Page ${page.key} could not be created`);
      return found;
    },
  };
}
