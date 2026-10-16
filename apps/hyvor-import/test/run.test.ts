import { readFileSync } from "node:fs";
import {
  routeSheet,
  shownComments,
  startTestApi,
  type TestApi,
} from "@fox-renard/api/test/harness";
import { beforeEach, describe, expect, test } from "vitest";
import { runImport } from "../src/run";

const exportFile = new URL(
  "../../../packages/api/test/fixtures/hyvor-export.json",
  import.meta.url,
);
const hyvorExport = JSON.parse(readFileSync(exportFile, "utf8"));

const memberEmail = "membre@example.com";

let api: TestApi;

beforeEach(async () => {
  api = await startTestApi();
});

/** Runs the import tool as the Member does, pasting the sign-in link from their inbox. */
async function runAsMember({
  pasted = () => api.signInLinkTo(memberEmail),
} = {}) {
  const printed: string[] = [];
  const result = runImport({
    hyvorExport,
    siteId: routeSheet.siteId,
    email: memberEmail,
    apiOrigin: "https://console.foxrenard.test",
    fetch: api.fetch,
    askSignInLink: async () => pasted(),
    print: (line) => printed.push(line),
  });
  return { result, printed };
}

describe("the import tool", () => {
  test("signs in with the link the Member pastes, imports the export and prints a summary", async () => {
    const { result, printed } = await runAsMember();
    await result;

    expect(printed.slice(-3)).toEqual([
      "Imported: 7",
      "Skipped (spam or deleted): 3",
      "Already present: 0",
    ]);
    expect(shownComments(await api.loadWidget())).toEqual([
      expect.objectContaining({
        commenter: expect.objectContaining({ displayName: "Marie Dupont" }),
      }),
    ]);
  });

  test("a second run reports every Comment as already present", async () => {
    await (await runAsMember()).result;

    const { result, printed } = await runAsMember();
    await result;

    expect(printed.slice(-3)).toEqual([
      "Imported: 0",
      "Skipped (spam or deleted): 3",
      "Already present: 7",
    ]);
  });

  test("a pasted link that does not sign in imports nothing", async () => {
    const { result } = await runAsMember({
      pasted: () => "https://console.foxrenard.test/sign-in#token=forged",
    });

    await expect(result).rejects.toThrow(/sign-in link/);
    expect(shownComments(await api.loadWidget())).toEqual([]);
  });
});
