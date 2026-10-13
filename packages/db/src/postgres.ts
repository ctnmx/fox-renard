import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Database } from "./database";
import * as schema from "./schema";

/**
 * Neon's connection strings ask for `channel_binding`, which postgres.js
 * would pass on to the server as a setting it does not know.
 */
export function withoutChannelBinding(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.delete("channel_binding");
  return url.toString();
}

/** A database on a PostgreSQL server, such as Neon or Hyperdrive in front of it. */
export function connectPostgres(connectionString: string): {
  db: Database;
  /** Closes the connections once the queries under way are done. */
  close(): Promise<void>;
} {
  const client = postgres(withoutChannelBinding(connectionString), {
    // Workers allow few connections at once, and Hyperdrive pools them anyway.
    max: 5,
    // The schema has no array column, so skip the round trip that fetches types.
    fetch_types: false,
  });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}
