// After merging origin/main, replaces this branch's migrations with one
// regenerated from schema.ts on top of main's:
// pnpm --filter @fox-renard/db regenerate <name>
//
// A migration is three files: its SQL, its snapshot in meta/, and an entry
// in meta/_journal.json. Deleting the SQL alone leaves generate with nothing
// to write, so this restores the whole folder as main has it.
import { execFileSync } from "node:child_process";
import { readdirSync, rmSync, statSync } from "node:fs";

const name = process.argv[2];
if (!name) {
  console.error("Usage: pnpm --filter @fox-renard/db regenerate <name>");
  process.exit(1);
}

const folder = "migrations";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" });

const onMain = new Set(
  git("ls-tree", "-r", "--name-only", "origin/main", "--", folder)
    .split("\n")
    .filter(Boolean),
);
git("checkout", "origin/main", "--", folder);
for (const entry of readdirSync(folder, { recursive: true })) {
  const file = `${folder}/${entry}`;
  if (statSync(file).isFile() && !onMain.has(file)) rmSync(file);
}

execFileSync("drizzle-kit", ["generate", "--name", name], { stdio: "inherit" });
