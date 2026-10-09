// Seeds a PostgreSQL database: DATABASE_URL=… SEED_MEMBER_EMAIL=… pnpm --filter @fox-renard/db seed
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { seed } from "./seed";

const { DATABASE_URL, SEED_MEMBER_EMAIL } = process.env;
if (!DATABASE_URL || !SEED_MEMBER_EMAIL) {
  console.error("DATABASE_URL and SEED_MEMBER_EMAIL are required.");
  process.exit(1);
}

const client = postgres(DATABASE_URL, { max: 1 });
try {
  await seed(drizzle(client, { schema }), { memberEmail: SEED_MEMBER_EMAIL });
  console.log("Recto Verso is seeded.");
} finally {
  await client.end();
}
