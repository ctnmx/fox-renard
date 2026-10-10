import type { Page, Store } from "@fox-renard/core";
import { and, count, eq, lte, or, type SQL, sql } from "drizzle-orm";
import type { Database } from "./database";
import { pages, rateLimitHits, reactions, visitors } from "./schema";

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

    async findPage(siteId, key) {
      return (await findPage(siteId, key)) ?? null;
    },

    async findVisitor(siteId, tokenHash) {
      const [visitor] = await db
        .select({ id: visitors.id })
        .from(visitors)
        .where(
          and(eq(visitors.siteId, siteId), eq(visitors.tokenHash, tokenHash)),
        );
      return visitor ?? null;
    },

    async createVisitor(siteId, tokenHash) {
      const [visitor] = await db
        .insert(visitors)
        .values({ siteId, tokenHash })
        .returning({ id: visitors.id });
      if (!visitor) throw new Error("The Visitor could not be created");
      return visitor;
    },

    async findReactions(pageId, visitorId) {
      const counts = await db
        .select({ optionId: reactions.optionId, count: count() })
        .from(reactions)
        .where(eq(reactions.pageId, pageId))
        .groupBy(reactions.optionId);
      const [reaction] = visitorId
        ? await db
            .select({ optionId: reactions.optionId })
            .from(reactions)
            .where(
              and(
                eq(reactions.pageId, pageId),
                eq(reactions.visitorId, visitorId),
              ),
            )
        : [];
      return {
        counts: new Map(counts.map((row) => [row.optionId, row.count])),
        reaction: reaction ?? null,
      };
    },

    async setReaction(pageId, visitorId, optionId) {
      const ofVisitorOnPage = and(
        eq(reactions.pageId, pageId),
        eq(reactions.visitorId, visitorId),
      );
      if (optionId === null) {
        await db.delete(reactions).where(ofVisitorOnPage);
        return;
      }
      // The primary key keeps one Reaction per Visitor and Page, even when
      // two requests from one browser race.
      await db
        .insert(reactions)
        .values({ pageId, visitorId, optionId })
        .onConflictDoUpdate({
          target: [reactions.pageId, reactions.visitorId],
          set: { optionId },
        });
    },

    async recordRateLimitHit(hit) {
      await db.insert(rateLimitHits).values(hit);
    },

    async countRateLimitHits({ siteId, fingerprint, visitorId }) {
      const ofFingerprint = eq(rateLimitHits.fingerprint, fingerprint);
      const ofVisitor = visitorId
        ? eq(rateLimitHits.visitorId, visitorId)
        : sql`false`;
      const countWhere = (condition: SQL) =>
        sql<number>`count(*) filter (where ${condition})`.mapWith(Number);
      const [counts] = await db
        .select({
          byFingerprint: countWhere(ofFingerprint),
          byVisitor: countWhere(ofVisitor),
        })
        .from(rateLimitHits)
        .where(
          and(eq(rateLimitHits.siteId, siteId), or(ofFingerprint, ofVisitor)),
        );
      return counts ?? { byFingerprint: 0, byVisitor: 0 };
    },

    async eraseRateLimitHits(cutoff) {
      await db.delete(rateLimitHits).where(lte(rateLimitHits.at, cutoff));
    },
  };
}
