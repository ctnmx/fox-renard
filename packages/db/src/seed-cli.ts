// Seeds a PostgreSQL database: DATABASE_URL=… SEED_MEMBER_EMAIL=… pnpm --filter @fox-renard/db seed
import { connectPostgres } from "./postgres";
import { seed } from "./seed";

const { DATABASE_URL, SEED_MEMBER_EMAIL } = process.env;
if (!DATABASE_URL || !SEED_MEMBER_EMAIL) {
  console.error("DATABASE_URL and SEED_MEMBER_EMAIL are required.");
  process.exit(1);
}

const { db, close } = connectPostgres(DATABASE_URL);
try {
  await seed(db, { memberEmail: SEED_MEMBER_EMAIL });
  console.log("Recto Verso is seeded.");
} finally {
  await close();
}
