import type { BrowserLink, Page, Store, Vote } from "@fox-renard/core";
import {
  and,
  count,
  desc,
  eq,
  gt,
  isNotNull,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { Database } from "./database";
import {
  commenters,
  comments,
  magicLinks,
  pages,
  rateLimitHits,
  reactions,
  spentBotChallenges,
  visitors,
  votes,
} from "./schema";

/** Links a browser to a Commenter, bringing the Comments of a Guest that is still one. */
async function linkBrowser(
  db: Database,
  { visitorId, commenterId, absorbedCommenterId }: BrowserLink,
): Promise<void> {
  if (absorbedCommenterId) {
    const [guest] = await db
      .select({ id: commenters.id })
      .from(commenters)
      .where(
        and(
          eq(commenters.id, absorbedCommenterId),
          isNull(commenters.verifiedAt),
        ),
      )
      .for("update");
    if (guest) {
      await db
        .update(comments)
        .set({ commenterId })
        .where(eq(comments.commenterId, guest.id));
      await db.delete(commenters).where(eq(commenters.id, guest.id));
    }
  }
  await db
    .update(visitors)
    .set({ commenterId })
    .where(eq(visitors.id, visitorId));
}

export function createStore(db: Database): Store {
  const commenterColumns = {
    id: commenters.id,
    displayName: commenters.displayName,
    verified: isNotNull(commenters.verifiedAt).mapWith(Boolean),
  };

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

  /** How many Visitors hold `vote` on the Comment of the row being read. */
  function countOf(vote: Vote) {
    return sql<number>`(select count(*) from ${votes} where ${votes.commentId} = ${comments.id} and ${votes.direction} = ${vote})`.mapWith(
      Number,
    );
  }

  function selectComments() {
    return db
      .select({
        id: comments.id,
        commenter: {
          id: commenters.id,
          verified: commenterColumns.verified,
        },
        displayName: comments.displayName,
        topLevelCommentId: comments.topLevelCommentId,
        text: comments.text,
        status: comments.status,
        createdAt: comments.createdAt,
        voteCounts: { up: countOf("up"), down: countOf("down") },
      })
      .from(comments)
      .innerJoin(commenters, eq(commenters.id, comments.commenterId))
      .$dynamic();
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
        columns: { id: true, name: true },
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
        name: site.name,
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
            .select({
              optionId: reactions.optionId,
              verified: reactions.verified,
            })
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

    async setReaction(pageId, visitorId, reaction) {
      const ofVisitorOnPage = and(
        eq(reactions.pageId, pageId),
        eq(reactions.visitorId, visitorId),
      );
      if (reaction === null) {
        await db.delete(reactions).where(ofVisitorOnPage);
        return;
      }
      // The primary key keeps one Reaction per Visitor and Page, even when
      // two requests from one browser race.
      await db
        .insert(reactions)
        .values({ pageId, visitorId, ...reaction })
        .onConflictDoUpdate({
          target: [reactions.pageId, reactions.visitorId],
          set: reaction,
        });
    },

    async findCommenter(visitorId) {
      const [commenter] = await db
        .select(commenterColumns)
        .from(visitors)
        .innerJoin(commenters, eq(commenters.id, visitors.commenterId))
        .where(eq(visitors.id, visitorId));
      return commenter ?? null;
    },

    async createCommenter({ siteId, visitorId, displayName }) {
      return db.transaction(async (tx) => {
        const [commenter] = await tx
          .insert(commenters)
          .values({ siteId, displayName })
          .returning(commenterColumns);
        if (!commenter) throw new Error("The Commenter could not be created");
        await tx
          .update(visitors)
          .set({ commenterId: commenter.id })
          .where(eq(visitors.id, visitorId));
        return commenter;
      });
    },

    async renameCommenter(commenterId, displayName) {
      await db
        .update(commenters)
        .set({ displayName })
        .where(eq(commenters.id, commenterId));
    },

    async createMagicLink(link) {
      await db.insert(magicLinks).values(link);
    },

    async takeMagicLink(siteId, tokenHash) {
      const [link] = await db
        .delete(magicLinks)
        .where(
          and(
            eq(magicLinks.siteId, siteId),
            eq(magicLinks.tokenHash, tokenHash),
          ),
        )
        .returning();
      return link ?? null;
    },

    async findVerifiedCommenter(siteId, email) {
      const [commenter] = await db
        .select(commenterColumns)
        .from(commenters)
        .where(
          and(
            eq(commenters.siteId, siteId),
            eq(commenters.email, email),
            isNotNull(commenters.verifiedAt),
          ),
        );
      return commenter ?? null;
    },

    async countMagicLinks(siteId, email, at) {
      const [working] = await db
        .select({ count: count() })
        .from(magicLinks)
        .where(
          and(
            eq(magicLinks.siteId, siteId),
            eq(magicLinks.email, email),
            gt(magicLinks.expiresAt, at),
          ),
        );
      return working?.count ?? 0;
    },

    async eraseMagicLinks(cutoff) {
      await db.delete(magicLinks).where(lte(magicLinks.expiresAt, cutoff));
    },

    async verifyCommenter({ email, at, ...link }) {
      return db.transaction(async (tx) => {
        // A magic link asked for before its Commenter was verified another
        // way must not verify them again.
        const [guest] = await tx
          .update(commenters)
          .set({ email, verifiedAt: at })
          .where(
            and(
              eq(commenters.id, link.commenterId),
              isNull(commenters.verifiedAt),
            ),
          )
          .returning({ id: commenters.id });
        if (!guest) return false;
        await tx
          .update(visitors)
          .set({ commenterId: null })
          .where(eq(visitors.commenterId, guest.id));
        await tx.delete(magicLinks).where(eq(magicLinks.commenterId, guest.id));
        await linkBrowser(tx, link);
        return true;
      });
    },

    async linkBrowser(link) {
      await db.transaction((tx) => linkBrowser(tx, link));
    },

    async createComment(comment) {
      const [created] = await db
        .insert(comments)
        .values(comment)
        .returning({ id: comments.id });
      if (!created) throw new Error("The Comment could not be created");
      return created;
    },

    async findComment(pageId, commentId) {
      const [comment] = await selectComments().where(
        and(eq(comments.pageId, pageId), eq(comments.id, commentId)),
      );
      return comment ?? null;
    },

    async listComments(pageId) {
      return selectComments()
        .where(eq(comments.pageId, pageId))
        .orderBy(desc(comments.createdAt), desc(comments.id));
    },

    async findVotes(pageId, visitorId) {
      const held = await db
        .select({
          commentId: votes.commentId,
          vote: votes.direction,
          verified: votes.verified,
        })
        .from(votes)
        .innerJoin(comments, eq(comments.id, votes.commentId))
        .where(
          and(eq(comments.pageId, pageId), eq(votes.visitorId, visitorId)),
        );
      return new Map(
        held.map(({ commentId, ...cast }) => [commentId, cast] as const),
      );
    },

    async setVote(commentId, visitorId, cast) {
      const ofVisitorOnComment = and(
        eq(votes.commentId, commentId),
        eq(votes.visitorId, visitorId),
      );
      if (cast === null) {
        await db.delete(votes).where(ofVisitorOnComment);
        return;
      }
      // The primary key keeps one Vote per Visitor and Comment, even when
      // two requests from one browser race.
      await db
        .insert(votes)
        .values({
          commentId,
          visitorId,
          direction: cast.vote,
          verified: cast.verified,
        })
        .onConflictDoUpdate({
          target: [votes.commentId, votes.visitorId],
          set: { direction: cast.vote, verified: cast.verified },
        });
    },

    async recordRateLimitHit(hit) {
      await db.insert(rateLimitHits).values(hit);
    },

    async countRateLimitHits({ siteId, action, fingerprint, visitorId }) {
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
          and(
            eq(rateLimitHits.siteId, siteId),
            eq(rateLimitHits.action, action),
            or(ofFingerprint, ofVisitor),
          ),
        );
      return counts ?? { byFingerprint: 0, byVisitor: 0 };
    },

    async eraseRateLimitHits(cutoff) {
      await db.delete(rateLimitHits).where(lte(rateLimitHits.at, cutoff));
    },

    async spendBotChallenge(challenge) {
      const spent = await db
        .insert(spentBotChallenges)
        .values(challenge)
        .onConflictDoNothing()
        .returning({ id: spentBotChallenges.id });
      return spent.length > 0;
    },

    async eraseSpentBotChallenges(cutoff) {
      await db
        .delete(spentBotChallenges)
        .where(lte(spentBotChallenges.expiresAt, cutoff));
    },
  };
}
