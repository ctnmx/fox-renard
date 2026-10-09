import { createCore } from "@fox-renard/core";
import {
  ControllableClock,
  EmailOutbox,
  FixedFingerprintSecret,
  InMemoryPhotoStore,
  StubBotCheck,
} from "@fox-renard/core/fakes";
import { createStore, type SiteSeed, seed, seedSite } from "@fox-renard/db";
import { createPgliteDatabase } from "@fox-renard/db/pglite";
import { testClient } from "hono/testing";
import { createApp } from "../src";

export { rectoVerso } from "@fox-renard/db";

/** A second Organization's Site, to show that Sites stay apart. */
export const anotherSite = {
  name: "Carnets de vélo",
  organizationId: "6c0f8f43-4f4b-4b8e-9a51-0d2b8f6f0c11",
  siteId: "a3e1c2d4-5b6f-4a7b-8c9d-0e1f2a3b4c5d",
  allowedDomains: ["velo.example"],
  reactionSet: {
    prompt: "Cette sortie vous tente ?",
    options: [
      {
        id: "0f5e9a4c-2d3b-4c6a-8e7f-1a2b3c4d5e6f",
        pictoEmoji: "🚲",
        label: "Je pédale",
      },
    ],
  },
} as const satisfies SiteSeed;

/**
 * Seam 1: the HTTP API, called in-process against PGlite with the real
 * migrations, the Recto Verso seed and another Site. The fakes stand in for the outside
 * world so tests can drive and observe it.
 */
export async function startTestApi() {
  const db = await createPgliteDatabase();
  await seed(db, { memberEmail: "membre@example.com" });
  await seedSite(db, anotherSite, { memberEmail: "membre@velo.example" });

  const clock = new ControllableClock();
  const outbox = new EmailOutbox();
  const photos = new InMemoryPhotoStore();
  const botCheck = new StubBotCheck();
  const fingerprintSecret = new FixedFingerprintSecret();

  const app = createApp(
    createCore({
      store: createStore(db),
      clock,
      email: outbox,
      photos,
      botCheck,
      fingerprintSecret,
    }),
  );

  return {
    client: testClient(app),
    clock,
    outbox,
    photos,
    botCheck,
    fingerprintSecret,
  };
}

export type TestApi = Awaited<ReturnType<typeof startTestApi>>;
