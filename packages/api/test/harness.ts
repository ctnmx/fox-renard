import { createCore } from "@fox-renard/core";
import {
  ControllableClock,
  EmailOutbox,
  FixedFingerprintSecret,
  InMemoryPhotoStore,
  StubBotCheck,
} from "@fox-renard/core/fakes";
import { createStore, seed } from "@fox-renard/db";
import { createPgliteDatabase } from "@fox-renard/db/pglite";
import { testClient } from "hono/testing";
import { createApp } from "../src";

export { rectoVerso } from "@fox-renard/db";

/**
 * Seam 1: the HTTP API, called in-process against PGlite with the real
 * migrations and the Recto Verso seed. The fakes stand in for the outside
 * world so tests can drive and observe it.
 */
export async function startTestApi() {
  const db = await createPgliteDatabase();
  await seed(db, { memberEmail: "membre@example.com" });

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
