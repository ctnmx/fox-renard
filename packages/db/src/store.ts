import type {
  BrowserLink,
  ListedStatus,
  Page,
  Store,
  Vote,
} from "@fox-renard/core";
import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { Database } from "./database";
import {
  commenters,
  comments,
  consoleSessions,
  magicLinks,
  members,
  organizations,
  pages,
  rateLimitHits,
  reactions,
  signInLinks,
  sites,
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

  const commentColumns = {
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
  };

  function selectComments() {
    return db
      .select(commentColumns)
      .from(comments)
      .innerJoin(commenters, eq(commenters.id, comments.commenterId))
      .$dynamic();
  }

  const memberColumns = {
    id: members.id,
    email: members.email,
    organization: { id: organizations.id, name: organizations.name },
  };

  function selectMembers() {
    return db
      .select(memberColumns)
      .from(members)
      .innerJoin(organizations, eq(organizations.id, members.organizationId))
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

    async findHyvorComments(pageId, hyvorCommentIds) {
      if (hyvorCommentIds.length === 0) return new Map();
      const found = await db
        .select({ id: comments.id, hyvorCommentId: comments.hyvorCommentId })
        .from(comments)
        .where(
          and(
            eq(comments.pageId, pageId),
            inArray(comments.hyvorCommentId, hyvorCommentIds),
          ),
        );
      return new Map(
        found.flatMap(({ id, hyvorCommentId }) =>
          hyvorCommentId === null ? [] : [[hyvorCommentId, id]],
        ),
      );
    },

    async findOrCreateHyvorCommenter({
      siteId,
      hyvorAuthorKey,
      displayName,
      email,
    }) {
      const inserted = db
        .insert(commenters)
        .values({ siteId, hyvorAuthorKey, displayName, email });
      if (hyvorAuthorKey === null) {
        const [created] = await inserted.returning({ id: commenters.id });
        if (!created) throw new Error("The Commenter could not be created");
        return created;
      }
      const [created] = await inserted
        .onConflictDoNothing({
          target: [commenters.siteId, commenters.hyvorAuthorKey],
          where: isNotNull(commenters.hyvorAuthorKey),
        })
        .returning({ id: commenters.id });
      if (created) return created;
      const [found] = await db
        .select({ id: commenters.id })
        .from(commenters)
        .where(
          and(
            eq(commenters.siteId, siteId),
            eq(commenters.hyvorAuthorKey, hyvorAuthorKey),
          ),
        );
      if (!found) throw new Error("The Commenter could not be created");
      return found;
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

    async findMember(email) {
      const [member] = await selectMembers().where(
        sql`lower(${members.email}) = lower(${email})`,
      );
      return member ?? null;
    },

    async createSignInLink(link) {
      await db.insert(signInLinks).values(link);
    },

    async countSignInLinks(memberId, at) {
      const [working] = await db
        .select({ count: count() })
        .from(signInLinks)
        .where(
          and(
            eq(signInLinks.memberId, memberId),
            gt(signInLinks.expiresAt, at),
          ),
        );
      return working?.count ?? 0;
    },

    async takeSignInLink(tokenHash) {
      const [link] = await db
        .delete(signInLinks)
        .where(eq(signInLinks.tokenHash, tokenHash))
        .returning();
      return link ?? null;
    },

    async createConsoleSession(session) {
      await db.insert(consoleSessions).values(session);
    },

    async findConsoleSession(tokenHash) {
      const [session] = await db
        .select({ ...memberColumns, expiresAt: consoleSessions.expiresAt })
        .from(consoleSessions)
        .innerJoin(members, eq(members.id, consoleSessions.memberId))
        .innerJoin(organizations, eq(organizations.id, members.organizationId))
        .where(eq(consoleSessions.tokenHash, tokenHash));
      if (!session) return null;
      const { expiresAt, ...member } = session;
      return { member, expiresAt };
    },

    async deleteConsoleSession(tokenHash) {
      await db
        .delete(consoleSessions)
        .where(eq(consoleSessions.tokenHash, tokenHash));
    },

    async findMemberEmails(siteId) {
      const found = await db
        .select({ email: members.email })
        .from(members)
        .innerJoin(sites, eq(sites.organizationId, members.organizationId))
        .where(eq(sites.id, siteId))
        .orderBy(members.email);
      return found.map(({ email }) => email);
    },

    async eraseSignIns(cutoff) {
      await db.delete(signInLinks).where(lte(signInLinks.expiresAt, cutoff));
      await db
        .delete(consoleSessions)
        .where(lte(consoleSessions.expiresAt, cutoff));
    },

    async listSites(organizationId) {
      return db
        .select({ id: sites.id, name: sites.name })
        .from(sites)
        .where(eq(sites.organizationId, organizationId))
        .orderBy(sites.name);
    },

    async listSiteComments(siteId, { status, pageKey }) {
      const listed = await db
        .select({
          ...commentColumns,
          page: { key: pages.key, title: pages.title },
        })
        .from(comments)
        .innerJoin(commenters, eq(commenters.id, comments.commenterId))
        .innerJoin(pages, eq(pages.id, comments.pageId))
        .where(
          and(
            eq(pages.siteId, siteId),
            eq(comments.status, status),
            pageKey === null ? undefined : eq(pages.key, pageKey),
          ),
        )
        .orderBy(desc(comments.createdAt), desc(comments.id));
      return listed;
    },

    async listCommentedPages(siteId) {
      const countOf = (status: ListedStatus) =>
        sql<number>`count(*) filter (where ${comments.status} = ${status})`.mapWith(
          Number,
        );
      return db
        .select({
          key: pages.key,
          title: pages.title,
          counts: {
            published: countOf("published"),
            pending: countOf("pending"),
            spam: countOf("spam"),
          },
        })
        .from(pages)
        .innerJoin(comments, eq(comments.pageId, pages.id))
        .where(and(eq(pages.siteId, siteId), ne(comments.status, "deleted")))
        .groupBy(pages.id)
        .orderBy(pages.title, pages.key);
    },

    async findOrganizationComment(organizationId, commentId) {
      const [comment] = await selectComments()
        .innerJoin(pages, eq(pages.id, comments.pageId))
        .innerJoin(sites, eq(sites.id, pages.siteId))
        .where(
          and(
            eq(comments.id, commentId),
            eq(sites.organizationId, organizationId),
          ),
        );
      return comment ?? null;
    },

    async setCommentStatus(commentId, status) {
      await db
        .update(comments)
        .set({ status })
        .where(eq(comments.id, commentId));
    },

    async countReplies(commentId) {
      const [replies] = await db
        .select({ count: count() })
        .from(comments)
        .where(eq(comments.topLevelCommentId, commentId));
      return replies?.count ?? 0;
    },

    async deleteComment(commentId) {
      await db.delete(comments).where(eq(comments.id, commentId));
    },

    async leavePlaceholder(commentId) {
      await db.transaction(async (tx) => {
        await tx
          .update(comments)
          .set({ status: "deleted", displayName: "", text: "" })
          .where(eq(comments.id, commentId));
        await tx.delete(votes).where(eq(votes.commentId, commentId));
      });
    },
  };
}
