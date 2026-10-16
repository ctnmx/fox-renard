// Imports a Hyvor Talk JSON export into a Fox Renard Site:
//   pnpm --filter @fox-renard/hyvor-import start <export.json> --site <id> --email <Member's email>
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { runImport } from "./run";

const usage =
  "Usage: pnpm --filter @fox-renard/hyvor-import start <export.json> --site <Site id> --email <Member's email> [--api https://console.foxrenard.com]";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    site: { type: "string" },
    email: { type: "string" },
    api: { type: "string", default: "https://console.foxrenard.com" },
  },
});
const [file] = positionals;
if (!file || !values.site || !values.email) {
  console.error(usage);
  process.exit(2);
}

const readline = createInterface({
  input: process.stdin,
  output: process.stdout,
});
try {
  await runImport({
    hyvorExport: JSON.parse(await readFile(file, "utf8")),
    siteId: values.site,
    email: values.email,
    apiOrigin: values.api,
    askSignInLink: () =>
      readline.question("Paste the sign-in link from your inbox: "),
    print: (line) => console.log(line),
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  readline.close();
}
