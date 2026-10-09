import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/** A Drizzle database over the Fox Renard schema, whatever the driver. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
