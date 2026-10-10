import { bodyOf, type CommentSegment, initialsOf } from "./comment-text";
import { hmacSha256Hex, randomHex, sha256Hex } from "./crypto";
import type {
  Comment,
  Commenter,
  Page,
  Reaction,
  ReactionOption,
  Site,
  Visitor,
  Vote,
  VoteCounts,
} from "./model";
import { networkOf } from "./network";
import type { Ports, RateLimitedAction } from "./ports";

/** Where a public request comes from: a Site, and the domain of the page on it. */
interface SiteRequest {
  siteId: string;
  /** The domain of the page the Widget runs on, or `null` when unknown. */
  domain: string | null;
}

/** A browser's request about one Page of a Site. */
interface PageRequest extends SiteRequest {
  pageKey: string;
  /** The token the browser holds for this Site, or `null` when it has none. */
  browserToken: string | null;
}

/** The orders a Visitor can list a Page's top-level Comments in. */
export const commentSorts = ["top", "newest", "oldest"] as const;

export type CommentSort = (typeof commentSorts)[number];

export interface WidgetRequest extends PageRequest {
  url: string;
  title: string;
  /**
   * The order of the top-level Comments, or `null` for the default, Top.
   * Replies stay oldest first.
   */
  sort: CommentSort | null;
}

/** A browser's request that abuse limits count. */
interface RateLimitedRequest extends PageRequest {
  /** Only ever hashed into a fingerprint, and never stored (ADR-0006). */
  clientIp: string | null;
}

export interface ReactionRequest extends RateLimitedRequest {
  /** The Reaction Option the Visitor chooses, or `null` to remove their Reaction. */
  optionId: string | null;
}

export interface CommentRequest extends PageRequest {
  displayName: string;
  text: string;
  /** The Comment this one Replies to, or `null` for a top-level Comment. */
  replyTo: string | null;
}

export interface VoteRequest extends RateLimitedRequest {
  commentId: string;
  /** The Vote the Visitor gives, or `null` to withdraw theirs. */
  vote: Vote | null;
}

export type CountedReactionOption = ReactionOption & { count: number };

export interface CountedReactionSet {
  prompt: string;
  options: CountedReactionOption[];
}

/** What a Page shows a browser of its Reactions. */
interface ReactionsView {
  reactionSet: CountedReactionSet;
  /** The Reaction this browser holds on the Page. */
  reaction: Reaction | null;
}

/** A Comment as Visitors read it. */
export interface CommentView {
  id: string;
  commenter: { displayName: string; initials: string };
  body: CommentSegment[];
  createdAt: Date;
  voteCounts: VoteCounts;
  /** The Vote this browser holds on the Comment. */
  vote: Vote | null;
}

/** A top-level Comment as Visitors read it, with its Replies oldest first. */
export interface TopLevelCommentView extends CommentView {
  replies: CommentView[];
}

/** What a Page shows a browser of its Comments. */
interface CommentsView {
  /** The Commenter this browser posts as, so it never retypes its display name. */
  commenter: Pick<Commenter, "displayName"> | null;
  /** The order `comments` are listed in. */
  sort: CommentSort;
  comments: TopLevelCommentView[];
}

type SiteRefusal =
  | { outcome: "site-not-found" }
  | { outcome: "domain-not-allowed" };

export type WidgetResult =
  | ({ outcome: "loaded"; page: Page } & ReactionsView & CommentsView)
  | SiteRefusal;

export type ReactionResult =
  | ({
      outcome: "reacted";
      /** The browser's token for this Site, newly issued if it had none. */
      browserToken: string;
    } & ReactionsView)
  | SiteRefusal
  | { outcome: "page-not-found" }
  | { outcome: "reaction-option-not-found" }
  | { outcome: "rate-limited" };

export type VoteResult =
  | ({
      outcome: "voted";
      /** The browser's token for this Site, newly issued if it had none. */
      browserToken: string;
    } & Pick<CommentView, "voteCounts" | "vote">)
  | SiteRefusal
  | { outcome: "page-not-found" }
  | { outcome: "comment-not-found" }
  | { outcome: "rate-limited" };

export type CommentResult =
  | {
      outcome: "posted";
      /** The browser's token for this Site, newly issued if it had none. */
      browserToken: string;
      commenter: Pick<Commenter, "displayName">;
      comment: CommentView;
      /** The top-level Comment a posted Reply sits under, or `null` for a top-level Comment. */
      topLevelCommentId: string | null;
    }
  | SiteRefusal
  | { outcome: "page-not-found" }
  | { outcome: "comment-not-found" }
  | { outcome: "invalid-display-name" }
  | { outcome: "empty-comment" }
  | { outcome: "comment-too-long" };

const maxPageTitleLength = 500;
const maxDisplayNameLength = 50;
const maxCommentLength = 5000;

const hour = 60 * 60 * 1000;

/**
 * How long abuse limits remember a fingerprint or a browser. Erasing every
 * hour then keeps nothing past 24 hours (ADR-0006).
 */
const rateLimitMemory = 23 * hour;

/**
 * How many Reactions, and how many Votes, changes and removals included, a
 * browser and the network it acts from may make while they are remembered.
 * A network can hold several Visitors, such as a household or an office.
 */
const rateLimits: Record<
  RateLimitedAction,
  { perBrowser: number; perFingerprint: number }
> = {
  reaction: { perBrowser: 50, perFingerprint: 100 },
  vote: { perBrowser: 50, perFingerprint: 100 },
};

// Lengths count code points, so an emoji counts once and is never cut in half.
function lengthOf(text: string): number {
  return Array.from(text).length;
}

function shorten(text: string, maxLength: number): string {
  return Array.from(text).slice(0, maxLength).join("");
}

/**
 * Each top-level Comment with its Replies, from a Page's Comments newest
 * first and the Votes a browser holds on them.
 */
function topLevelCommentViews(
  comments: Comment[],
  votes: Map<string, Vote>,
): TopLevelCommentView[] {
  const viewOf = (comment: Comment) =>
    commentView(comment, votes.get(comment.id) ?? null);
  const replies = new Map<string, CommentView[]>();
  for (const comment of comments.toReversed()) {
    const { topLevelCommentId } = comment;
    if (topLevelCommentId === null) continue;
    replies.set(topLevelCommentId, [
      ...(replies.get(topLevelCommentId) ?? []),
      viewOf(comment),
    ]);
  }
  return comments
    .filter((comment) => comment.topLevelCommentId === null)
    .map((comment) => ({
      ...viewOf(comment),
      replies: replies.get(comment.id) ?? [],
    }));
}

function scoreOf({ voteCounts }: CommentView): number {
  return voteCounts.up - voteCounts.down;
}

/** Top-level Comments listed newest first, in the order a Visitor chose. */
function sorted(
  newestFirst: TopLevelCommentView[],
  sort: CommentSort,
): TopLevelCommentView[] {
  switch (sort) {
    case "top":
      // The sort is stable, so the newest comes first among equal scores.
      return newestFirst.toSorted((a, b) => scoreOf(b) - scoreOf(a));
    case "newest":
      return newestFirst;
    case "oldest":
      return newestFirst.toReversed();
  }
}

/**
 * Where a Reply sits and what it says. Replies stay one level deep: a Reply
 * to a Reply sits under the same top-level Comment, and starts by naming
 * whom it answers.
 */
function placeReply(
  answered: Comment,
  text: string,
): Pick<Comment, "topLevelCommentId" | "text"> {
  if (answered.topLevelCommentId === null) {
    return { topLevelCommentId: answered.id, text };
  }
  return {
    topLevelCommentId: answered.topLevelCommentId,
    text: `@${answered.commenter.displayName} ${text}`,
  };
}

function commentView(comment: Comment, vote: Vote | null): CommentView {
  const { displayName } = comment.commenter;
  return {
    id: comment.id,
    commenter: { displayName, initials: initialsOf(displayName) },
    body: bodyOf(comment.text),
    createdAt: comment.createdAt,
    voteCounts: comment.voteCounts,
    vote,
  };
}

export function createCore({ store, clock, fingerprintSecret }: Ports) {
  async function allowedSite(
    request: SiteRequest,
  ): Promise<SiteRefusal | { outcome: "allowed"; site: Site }> {
    const site = await store.findSite(request.siteId);
    if (!site) return { outcome: "site-not-found" };

    const domain = request.domain?.toLowerCase();
    if (!domain || !site.allowedDomains.includes(domain)) {
      return { outcome: "domain-not-allowed" };
    }
    return { outcome: "allowed", site };
  }

  // The store only ever sees a hash of the token, so a leaked database
  // cannot be used to act as a Visitor.
  async function recognize(
    site: Site,
    browserToken: string | null,
  ): Promise<{ visitor: Visitor; browserToken: string } | null> {
    if (!browserToken) return null;
    const visitor = await store.findVisitor(
      site.id,
      await sha256Hex(browserToken),
    );
    return visitor && { visitor, browserToken };
  }

  async function issueBrowserToken(site: Site) {
    const browserToken = randomHex(32);
    const visitor = await store.createVisitor(
      site.id,
      await sha256Hex(browserToken),
    );
    return { visitor, browserToken };
  }

  /**
   * The client's network, keyed with a secret that rotates daily (ADR-0006):
   * nobody can turn it back into an IP address without that day's secret,
   * nor follow a network from one day or one Site to the next.
   */
  async function fingerprintOf(site: Site, clientIp: string | null) {
    const day = clock.now().toISOString().slice(0, "YYYY-MM-DD".length);
    const daySecret = await hmacSha256Hex(
      await fingerprintSecret.current(),
      day,
    );
    return hmacSha256Hex(daySecret, `${site.id} ${networkOf(clientIp)}`);
  }

  async function eraseExpiredFingerprints(): Promise<void> {
    await store.eraseRateLimitHits(
      new Date(clock.now().getTime() - rateLimitMemory),
    );
  }

  /**
   * The browser, recognized or issued a token, once abuse limits let it take
   * `action` once more; `null` when it or its network has reached the limit.
   */
  async function admit(
    site: Site,
    action: RateLimitedAction,
    { browserToken, clientIp }: RateLimitedRequest,
  ): Promise<{ visitor: Visitor; browserToken: string } | null> {
    const recognized = await recognize(site, browserToken);
    const fingerprint = await fingerprintOf(site, clientIp);
    // Counting only what is still remembered makes the limits forget too.
    await eraseExpiredFingerprints();
    const hits = await store.countRateLimitHits({
      siteId: site.id,
      action,
      fingerprint,
      visitorId: recognized?.visitor.id ?? null,
    });
    const limits = rateLimits[action];
    if (
      hits.byVisitor >= limits.perBrowser ||
      hits.byFingerprint >= limits.perFingerprint
    ) {
      return null;
    }

    const admitted = recognized ?? (await issueBrowserToken(site));
    await store.recordRateLimitHit({
      siteId: site.id,
      action,
      fingerprint,
      visitorId: admitted.visitor.id,
      at: clock.now(),
    });
    return admitted;
  }

  async function reactionsView(
    site: Site,
    page: Page,
    visitor: Visitor | null,
  ): Promise<ReactionsView> {
    const { counts, reaction } = await store.findReactions(
      page.id,
      visitor?.id ?? null,
    );
    return {
      reactionSet: {
        prompt: site.reactionSet.prompt,
        options: site.reactionSet.options.map((option) => ({
          ...option,
          count: counts.get(option.id) ?? 0,
        })),
      },
      reaction,
    };
  }

  async function commentsView(
    page: Page,
    visitor: Visitor | null,
    sort: CommentSort,
  ): Promise<CommentsView> {
    const commenter = visitor && (await store.findCommenter(visitor.id));
    const newestFirst = topLevelCommentViews(
      await store.listComments(page.id),
      visitor ? await store.findVotes(page.id, visitor.id) : new Map(),
    );
    return {
      commenter: commenter && { displayName: commenter.displayName },
      sort,
      comments: sorted(newestFirst, sort),
    };
  }

  // A browser posts as one Commenter, whose display name is the latest it gave.
  async function commenterFor(
    site: Site,
    visitor: Visitor,
    displayName: string,
  ) {
    const commenter = await store.findCommenter(visitor.id);
    if (!commenter) {
      return store.createCommenter({
        siteId: site.id,
        visitorId: visitor.id,
        displayName,
      });
    }
    if (commenter.displayName !== displayName) {
      await store.renameCommenter(commenter.id, displayName);
    }
    return { ...commenter, displayName };
  }

  return {
    /** What a Widget shows on a Page; an unknown Page Key creates the Page. */
    async loadWidget(request: WidgetRequest): Promise<WidgetResult> {
      const allowed = await allowedSite(request);
      if (allowed.outcome !== "allowed") return allowed;
      const { site } = allowed;

      const page = await store.findOrCreatePage(site.id, {
        key: request.pageKey,
        url: request.url,
        title: shorten(request.title, maxPageTitleLength),
      });
      const recognized = await recognize(site, request.browserToken);

      const visitor = recognized?.visitor ?? null;

      return {
        outcome: "loaded",
        page,
        ...(await reactionsView(site, page, visitor)),
        ...(await commentsView(page, visitor, request.sort ?? "top")),
      };
    },

    /**
     * Publishes a Comment or a Reply in plain text. The browser posts as a
     * Guest Commenter under the display name, and no email is asked.
     */
    async postComment(request: CommentRequest): Promise<CommentResult> {
      const allowed = await allowedSite(request);
      if (allowed.outcome !== "allowed") return allowed;
      const { site } = allowed;

      const page = await store.findPage(site.id, request.pageKey);
      if (!page) return { outcome: "page-not-found" };

      const displayName = request.displayName
        .normalize("NFC")
        .trim()
        .replace(/\s+/gu, " ");
      if (!displayName || lengthOf(displayName) > maxDisplayNameLength) {
        return { outcome: "invalid-display-name" };
      }
      const text = request.text
        .normalize("NFC")
        .replace(/\r\n?/gu, "\n")
        .trim();
      if (!text) return { outcome: "empty-comment" };

      let answered: Comment | null = null;
      if (request.replyTo !== null) {
        answered = await store.findComment(page.id, request.replyTo);
        if (!answered) return { outcome: "comment-not-found" };
      }
      const placed = answered
        ? placeReply(answered, text)
        : { topLevelCommentId: null, text };
      // The limit holds for every Comment as stored, @mention included.
      if (lengthOf(placed.text) > maxCommentLength) {
        return { outcome: "comment-too-long" };
      }

      const { visitor, browserToken } =
        (await recognize(site, request.browserToken)) ??
        (await issueBrowserToken(site));
      const commenter = await commenterFor(site, visitor, displayName);
      const createdAt = clock.now();
      const { id } = await store.createComment({
        pageId: page.id,
        commenterId: commenter.id,
        ...placed,
        createdAt,
      });

      return {
        outcome: "posted",
        browserToken,
        commenter: { displayName },
        comment: commentView(
          {
            id,
            commenter,
            ...placed,
            createdAt,
            voteCounts: { up: 0, down: 0 },
          },
          null,
        ),
        topLevelCommentId: placed.topLevelCommentId,
      };
    },

    /** Gives, changes or withdraws a Visitor's one Vote on a Comment or a Reply. */
    async vote(request: VoteRequest): Promise<VoteResult> {
      const allowed = await allowedSite(request);
      if (allowed.outcome !== "allowed") return allowed;
      const { site } = allowed;

      const page = await store.findPage(site.id, request.pageKey);
      if (!page) return { outcome: "page-not-found" };
      const comment = await store.findComment(page.id, request.commentId);
      if (!comment) return { outcome: "comment-not-found" };

      const admitted = await admit(site, "vote", request);
      if (!admitted) return { outcome: "rate-limited" };
      const { visitor, browserToken } = admitted;
      await store.setVote(comment.id, visitor.id, request.vote);

      const voted = await store.findComment(page.id, comment.id);
      if (!voted) return { outcome: "comment-not-found" };
      const votes = await store.findVotes(page.id, visitor.id);
      return {
        outcome: "voted",
        browserToken,
        voteCounts: voted.voteCounts,
        vote: votes.get(comment.id) ?? null,
      };
    },

    /**
     * Sets, changes or removes a Visitor's one Reaction on a Page. A browser
     * with no token, or with one another Site issued, gets a new token.
     */
    async react(request: ReactionRequest): Promise<ReactionResult> {
      const allowed = await allowedSite(request);
      if (allowed.outcome !== "allowed") return allowed;
      const { site } = allowed;

      const page = await store.findPage(site.id, request.pageKey);
      if (!page) return { outcome: "page-not-found" };

      const { optionId } = request;
      if (
        optionId !== null &&
        !site.reactionSet.options.some((option) => option.id === optionId)
      ) {
        return { outcome: "reaction-option-not-found" };
      }

      const admitted = await admit(site, "reaction", request);
      if (!admitted) return { outcome: "rate-limited" };
      const { visitor, browserToken } = admitted;
      await store.setReaction(page.id, visitor.id, optionId);

      return {
        outcome: "reacted",
        browserToken,
        ...(await reactionsView(site, page, visitor)),
      };
    },

    /**
     * Erases what abuse limits no longer remember, fingerprints included.
     * The platform runs it every hour, since reacting and voting erase only
     * when someone reacts or votes (ADR-0006).
     */
    eraseExpiredFingerprints,
  };
}

export type Core = ReturnType<typeof createCore>;
