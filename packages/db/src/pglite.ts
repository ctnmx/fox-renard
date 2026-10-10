import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "./database";
import * as schema from "./schema";

/** A fresh in-memory PostgreSQL with the real migrations applied, for tests and the local demo. */
export async function createPgliteDatabase(): Promise<Database> {
  const db = drizzle({ client: new PGlite(), schema });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)),
  });
  return db;
}

/** Empties every table, whatever the schema holds, so one database serves test after test. */
export async function emptyDatabase(db: Database): Promise<void> {
  await db.execute(sql`
    do $$ begin
      execute (
        select 'truncate ' || string_agg(format('%I', tablename), ', ') || ' cascade'
        from pg_tables
        where schemaname = 'public'
      );
    end $$
  `);
}
