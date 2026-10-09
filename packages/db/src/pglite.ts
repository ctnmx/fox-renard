import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "./database";
import * as schema from "./schema";

// Booting PGlite takes seconds; cloning an already migrated one takes a
// fraction of that, so each process migrates once and hands out clones.
let migrated: Promise<PGlite> | undefined;

function migratedTemplate(): Promise<PGlite> {
  migrated ??= (async () => {
    const pglite = new PGlite();
    await migrate(drizzle({ client: pglite }), {
      migrationsFolder: fileURLToPath(
        new URL("../migrations", import.meta.url),
      ),
    });
    return pglite;
  })();
  return migrated;
}

/** A fresh in-memory PostgreSQL with the real migrations applied, for tests and the local demo. */
export async function createPgliteDatabase(): Promise<Database> {
  const template = await migratedTemplate();
  return drizzle({ client: (await template.clone()) as PGlite, schema });
}
