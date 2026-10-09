import type { Page, Reaction, Site, Visitor } from "./model";

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

/** The secret keying the anonymised fingerprint; it rotates daily (ADR-0006). */
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
