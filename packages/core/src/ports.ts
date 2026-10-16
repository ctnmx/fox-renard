import type {
  CastVote,
  Comment,
  Commenter,
  CommentStatus,
  ListedStatus,
  MagicLink,
  Member,
  Page,
  Photo,
  Reaction,
  Site,
  Visitor,
} from "./model";

/** Storage of domain data. */
export interface Store {
  findSite(siteId: string): Promise<Site | null>;
  /** Creates the Page on first sight of its Page Key; a known Page is returned unchanged. */
  findOrCreatePage(siteId: string, page: Omit<Page, "id">): Promise<Page>;
  findPage(siteId: string, key: string): Promise<Page | null>;
  /** The Visitor whose browser token hashes to `tokenHash` on this Site. */
  findVisitor(siteId: string, tokenHash: string): Promise<Visitor | null>;
  createVisitor(siteId: string, tokenHash: string): Promise<Visitor>;
  /**
   * How many Visitors hold each Reaction Option on a Page, by option id, and
   * the Reaction `visitorId` holds there.
   */
  findReactions(
    pageId: string,
    visitorId: string | null,
  ): Promise<{ counts: Map<string, number>; reaction: Reaction | null }>;
  /** Sets a Visitor's one Reaction on a Page; `null` removes it. */
  setReaction(
    pageId: string,
    visitorId: string,
    reaction: Reaction | null,
  ): Promise<void>;
  /** The Commenter a Visitor's browser posts as, once it has posted. */
  findCommenter(visitorId: string): Promise<Commenter | null>;
  /** Creates a Guest Commenter on a Site and links the Visitor's browser to them. */
  createCommenter(commenter: {
    siteId: string;
    visitorId: string;
    displayName: string;
  }): Promise<Commenter>;
  renameCommenter(commenterId: string, displayName: string): Promise<void>;
  createMagicLink(link: MagicLink): Promise<void>;
  /** Deletes a Site's magic link and returns it, so that it works once only. */
  takeMagicLink(siteId: string, tokenHash: string): Promise<MagicLink | null>;
  /** How many of a Site's magic links to `email` still work at `at`. */
  countMagicLinks(siteId: string, email: string, at: Date): Promise<number>;
  /** Erases the magic links that expired at or before `cutoff`, emails with them. */
  eraseMagicLinks(cutoff: Date): Promise<void>;
  /** The Verified Commenter of a Site whose email this is. */
  findVerifiedCommenter(
    siteId: string,
    email: string,
  ): Promise<Commenter | null>;
  /**
   * Verifies a Guest's email and links the browser that followed the magic
   * link to them, as `linkBrowser` does. That browser becomes their only one,
   * and their other magic links stop working. Changes nothing, and answers
   * `false`, once the Commenter is no longer a Guest.
   */
  verifyCommenter(
    verification: BrowserLink & { email: string; at: Date },
  ): Promise<boolean>;
  /**
   * Links a browser to a Verified Commenter. The Comments of the Guest it
   * absorbs, if still a Guest, become theirs, and that Guest is no more; so do
   * those of the Guests imported from Hyvor under their email, in any case,
   * that no browser posts as.
   */
  linkBrowser(link: BrowserLink): Promise<void>;
  createComment(comment: {
    pageId: string;
    commenterId: string;
    displayName: string;
    topLevelCommentId: string | null;
    text: string;
    status: CommentStatus;
    createdAt: Date;
    /** The Hyvor Talk Comment an imported Comment comes from. */
    hyvorCommentId?: number;
  }): Promise<{ id: string }>;
  /** The Comments of a Page imported from these Hyvor Comments, by Hyvor comment id. */
  findHyvorComments(
    pageId: string,
    hyvorCommentIds: number[],
  ): Promise<Map<number, string>>;
  /**
   * The Guest an imported Hyvor author stands for on a Site, created on first
   * sight of their key, with their email unverified. A `null` key creates a
   * Guest of their own.
   */
  findOrCreateHyvorCommenter(commenter: {
    siteId: string;
    hyvorAuthorKey: string | null;
    displayName: string;
    email: string | null;
  }): Promise<{ id: string }>;
  /**
   * Adds a Photo to a Comment unless it already holds `atMost`, counted
   * under a lock on the Comment, so that uploads sent at once cannot pass
   * the limit together. Answers `null` when the Comment is full.
   */
  createPhoto(
    photo: Omit<Photo, "id">,
    { atMost }: { atMost: number },
  ): Promise<Photo | null>;
  /** One of a Site's Photos, with the status of the Comment it belongs to. */
  findPhoto(
    siteId: string,
    photoId: string,
  ): Promise<(Photo & { commentStatus: CommentStatus }) | null>;
  deletePhoto(photoId: string): Promise<void>;
  /** One of a Page's Comments, top-level or Reply. */
  findComment(pageId: string, commentId: string): Promise<Comment | null>;
  /** A Page's Comments and Replies, newest first. */
  listComments(pageId: string): Promise<Comment[]>;
  /** The Votes a Visitor holds on a Page's Comments and Replies, by Comment id. */
  findVotes(pageId: string, visitorId: string): Promise<Map<string, CastVote>>;
  /** Sets a Visitor's one Vote on a Comment; `null` withdraws it. */
  setVote(
    commentId: string,
    visitorId: string,
    vote: CastVote | null,
  ): Promise<void>;
  /** Remembers that a fingerprint and a Visitor did something on a Site. */
  recordRateLimitHit(hit: RateLimitHit): Promise<void>;
  /** How many remembered hits of one action a fingerprint and a Visitor each have on a Site. */
  countRateLimitHits(of: {
    siteId: string;
    action: RateLimitedAction;
    fingerprint: string;
    visitorId: string | null;
  }): Promise<{ byFingerprint: number; byVisitor: number }>;
  /** Erases the hits made at or before `cutoff`, fingerprints with them. */
  eraseRateLimitHits(cutoff: Date): Promise<void>;
  /**
   * Remembers a bot check's challenge as solved until `expiresAt`, and tells
   * whether it was not already.
   */
  spendBotChallenge(challenge: {
    id: string;
    expiresAt: Date;
  }): Promise<boolean>;
  /** Forgets the solved challenges that expired at or before `cutoff`. */
  eraseSpentBotChallenges(cutoff: Date): Promise<void>;
  /** The Member whose email this is, whatever its case. */
  findMember(email: string): Promise<Member | null>;
  createSignInLink(link: Credential): Promise<void>;
  /** How many of a Member's sign-in links still work at `at`. */
  countSignInLinks(memberId: string, at: Date): Promise<number>;
  /** Deletes a sign-in link and returns it, so that it works once only. */
  takeSignInLink(tokenHash: string): Promise<Credential | null>;
  createConsoleSession(session: Credential): Promise<void>;
  /** The Member a console session belongs to, with when it expires. */
  findConsoleSession(
    tokenHash: string,
  ): Promise<{ member: Member; expiresAt: Date } | null>;
  deleteConsoleSession(tokenHash: string): Promise<void>;
  /** Erases the sign-in links and console sessions that expired at or before `cutoff`. */
  eraseSignIns(cutoff: Date): Promise<void>;
  /** The email of each Member of the Organization that owns a Site. */
  findMemberEmails(siteId: string): Promise<string[]>;
  /** An Organization's Sites, by name. */
  listSites(organizationId: string): Promise<{ id: string; name: string }[]>;
  /** A Site's Comments and Replies with one status, newest first, on one Page or all. */
  listSiteComments(
    siteId: string,
    filter: { status: ListedStatus; pageKey: string | null },
  ): Promise<(Comment & { page: Pick<Page, "key" | "title"> })[]>;
  /**
   * The Pages of a Site that hold Comments other than placeholders, by
   * title, with how many Comments each status holds.
   */
  listCommentedPages(siteId: string): Promise<
    (Pick<Page, "key" | "title"> & {
      counts: Record<ListedStatus, number>;
    })[]
  >;
  /** A Comment or a Reply on one of an Organization's Sites; another Organization's is never found. */
  findOrganizationComment(
    organizationId: string,
    commentId: string,
  ): Promise<Comment | null>;
  setCommentStatus(commentId: string, status: CommentStatus): Promise<void>;
  /** How many Replies a top-level Comment has, whatever their status. */
  countReplies(commentId: string): Promise<number>;
  /** Deletes a Comment with its Votes and its Photos' records. */
  deleteComment(commentId: string): Promise<void>;
  /**
   * Deletes what a top-level Comment said, its display name, its Votes and
   * its Photos' records, and leaves it as a placeholder for its Replies.
   */
  leavePlaceholder(commentId: string): Promise<void>;
}

/**
 * A sign-in link or a console session: what a token proves about a Member,
 * stored by the token's SHA-256 only.
 */
export interface Credential {
  tokenHash: string;
  memberId: string;
  expiresAt: Date;
}

/** A browser to link to a Commenter, with the Guest whose Comments it brings. */
export interface BrowserLink {
  visitorId: string;
  commenterId: string;
  /** The Guest the browser posted as, if it brings their Comments. */
  absorbedCommenterId: string | null;
}

/** What abuse limits count apart, each against limits of its own. */
export type RateLimitedAction = "reaction" | "vote" | "comment";

export interface RateLimitHit {
  siteId: string;
  action: RateLimitedAction;
  /** A keyed hash of the client's network, never its IP address (ADR-0006). */
  fingerprint: string;
  visitorId: string;
  at: Date;
}

export interface Clock {
  now(): Date;
}

export interface Email {
  to: string;
  /** The name the email is sent under; the platform chooses the address. */
  senderName: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(email: Email): Promise<void>;
}

export interface StoredPhoto {
  body: Uint8Array;
  contentType: string;
}

/** S3-compatible object storage for Photos. */
export interface PhotoStore {
  put(key: string, photo: StoredPhoto): Promise<void>;
  get(key: string): Promise<StoredPhoto | null>;
  delete(key: string): Promise<void>;
}

/** A bot check's challenge, as the Widget receives it to solve. */
export type BotChallenge = Record<string, unknown>;

/** The challenge a valid solution solved. */
export interface SolvedChallenge {
  /** Tells the challenge apart from every other, so it is solved once only. */
  id: string;
  issuedAt: Date;
}

/**
 * The invisible proof-of-work a browser solves before it posts, such as
 * ALTCHA. Its challenges record when they were issued, out of reach of the
 * browser solving them.
 */
export interface BotCheck {
  challenge(issuedAt: Date): Promise<BotChallenge>;
  /** The challenge a solution solves, or `null` when it solves none. */
  verify(solution: string): Promise<SolvedChallenge | null>;
}

/**
 * The secret from which Core derives each day's fingerprint secret (ADR-0006).
 * Keep it out of the database, so a copy of the database alone cannot tell
 * which IP address a fingerprint stands for.
 */
export interface FingerprintSecret {
  current(): Promise<string>;
}

export interface Ports {
  store: Store;
  clock: Clock;
  email: EmailSender;
  photos: PhotoStore;
  botCheck: BotCheck;
  fingerprintSecret: FingerprintSecret;
}
