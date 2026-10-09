import type { Page, Site } from "./model";

/** Storage of domain data. */
export interface Store {
  findSite(siteId: string): Promise<Site | null>;
  /** Creates the Page on first sight of its Page Key; a known Page is returned unchanged. */
  findOrCreatePage(siteId: string, page: Omit<Page, "id">): Promise<Page>;
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
