/**
 * In-memory adapters for the ports that reach the outside world, so tests and
 * the local demo can drive and observe Fox Renard without real services.
 */
import type {
  BotCheck,
  Clock,
  Email,
  EmailSender,
  FingerprintSecret,
  PhotoStore,
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

export class EmailOutbox implements EmailSender {
  readonly sent: Email[] = [];

  async send(email: Email): Promise<void> {
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

/** Passes every solution until told to fail. */
export class StubBotCheck implements BotCheck {
  passes = true;

  async verify(): Promise<boolean> {
    return this.passes;
  }
}

export class FixedFingerprintSecret implements FingerprintSecret {
  constructor(readonly secret = "fixed-fingerprint-secret") {}

  async current(): Promise<string> {
    return this.secret;
  }
}
