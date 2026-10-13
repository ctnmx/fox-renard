// After merging origin/main, replaces this branch's migrations with one
// regenerated from schema.ts on top of main's:
// pnpm --filter @fox-renard/db regenerate <name>
//
// A migration is three files: its SQL, its snapshot in meta/, and an entry
// in meta/_journal.json. Deleting the SQL alone leaves generate with nothing
// to write, so this restores the whole folder as main has it.
//
// Statements written by hand, such as a backfill, are not in schema.ts, so
// generate cannot write them again: this fails and lists any it dropped.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";

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

/** The statements of this branch's own migrations, as drizzle-kit separates them. */
function branchStatements() {
  return readdirSync(folder)
    .map((entry) => `${folder}/${entry}`)
    .filter((file) => file.endsWith(".sql") && !onMain.has(file))
    .flatMap((file) =>
      readFileSync(file, "utf8").split("--> statement-breakpoint"),
    )
    .map((statement) => statement.trim())
    .filter(Boolean);
}

const before = branchStatements();

git("checkout", "origin/main", "--", folder);
for (const entry of readdirSync(folder, { recursive: true })) {
  const file = `${folder}/${entry}`;
  if (statSync(file).isFile() && !onMain.has(file)) rmSync(file);
}

execFileSync("drizzle-kit", ["generate", "--name", name], { stdio: "inherit" });

const after = new Set(branchStatements());
const dropped = before.filter((statement) => !after.has(statement));
if (dropped.length > 0) {
  console.error(
    [
      `regenerate dropped ${dropped.length} statement(s) of this branch's migration that schema.ts does not produce, such as a backfill.`,
      "Put each back where it belongs in the regenerated migration, separated by --> statement-breakpoint, unless main's migrations already do the same:",
      "",
      ...dropped,
    ].join("\n"),
  );
  process.exit(1);
}
