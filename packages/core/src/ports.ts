import type {
  Comment,
  Commenter,
  Page,
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
    optionId: string | null,
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
  createComment(comment: {
    pageId: string;
    commenterId: string;
    text: string;
    createdAt: Date;
  }): Promise<{ id: string }>;
  /** A Page's Comments, newest first. */
  listComments(pageId: string): Promise<Comment[]>;
  /** Remembers that a fingerprint and a Visitor did something on a Site. */
  recordRateLimitHit(hit: RateLimitHit): Promise<void>;
  /** How many remembered hits a fingerprint and a Visitor each have on a Site. */
  countRateLimitHits(of: {
    siteId: string;
    fingerprint: string;
    visitorId: string | null;
  }): Promise<{ byFingerprint: number; byVisitor: number }>;
  /** Erases the hits made at or before `cutoff`, fingerprints with them. */
  eraseRateLimitHits(cutoff: Date): Promise<void>;
}

export interface RateLimitHit {
  siteId: string;
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

/** Verifies the invisible bot check a Widget solved before posting. */
export interface BotCheck {
  verify(solution: string): Promise<boolean>;
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
