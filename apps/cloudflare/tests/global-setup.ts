import { execFileSync } from "node:child_process";

/** Migrates and seeds the test database, as each deployment does its own. */
export default function migrateAndSeed(): void {
  const env = {
    ...process.env,
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    SEED_MEMBER_EMAIL: "membre@example.com",
  };
  for (const script of ["migrate", "seed"]) {
    execFileSync("pnpm", ["--filter", "@fox-renard/db", script], {
      env,
      stdio: "inherit",
    });
  }
}
