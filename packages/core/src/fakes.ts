/**
 * In-memory adapters for the ports that reach the outside world, so tests and
 * the local demo can drive and observe Fox Renard without real services.
 */
import { magicLinkParameter } from "./core";
import type {
  BotChallenge,
  BotCheck,
  Clock,
  Email,
  EmailSender,
  FingerprintSecret,
  PhotoStore,
  SolvedChallenge,
  StoredPhoto,
} from "./ports";

export class ControllableClock implements Clock {
  #now: Date;

  constructor(start = new Date("2026-06-01T08:00:00Z")) {
    this.#now = start;
  }

  now(): Date {
    return new Date(this.#now);
  }

  advance(milliseconds: number): void {
    this.#now = new Date(this.#now.getTime() + milliseconds);
  }
}

/** The magic link an email's text carries, as its recipient would follow it. */
export function magicLinkIn(text: string): string | null {
  const link = new RegExp(`https?://\\S+#${magicLinkParameter}=\\S+`);
  return link.exec(text)?.[0] ?? null;
}

/** Keeps every email it sends, until told to fail as an email service can. */
export class EmailOutbox implements EmailSender {
  readonly sent: Email[] = [];
  delivers = true;

  async send(email: Email): Promise<void> {
    if (!this.delivers) throw new Error("The email service is unavailable.");
    this.sent.push(email);
  }
}

export class InMemoryPhotoStore implements PhotoStore {
  readonly #photos = new Map<string, StoredPhoto>();

  async put(key: string, photo: StoredPhoto): Promise<void> {
    this.#photos.set(key, photo);
  }

  async get(key: string): Promise<StoredPhoto | null> {
    return this.#photos.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.#photos.delete(key);
  }
}

/**
 * Takes a challenge itself for its solution, and passes every solution until
 * told to fail.
 */
export class StubBotCheck implements BotCheck {
  passes = true;

  async challenge(issuedAt: Date): Promise<BotChallenge> {
    return { id: crypto.randomUUID(), issuedAt: issuedAt.toISOString() };
  }

  /** What a browser that solved `challenge` sends. */
  solve(challenge: BotChallenge): string {
    return JSON.stringify(challenge);
  }

  async verify(solution: string): Promise<SolvedChallenge | null> {
    if (!this.passes) return null;
    const { id, issuedAt } = JSON.parse(solution);
    return { id, issuedAt: new Date(issuedAt) };
  }
}

export class FixedFingerprintSecret implements FingerprintSecret {
  constructor(readonly secret = "fixed-fingerprint-secret") {}

  async current(): Promise<string> {
    return this.secret;
  }
}
