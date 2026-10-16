import { createClient } from "@fox-renard/api/client";
import {
  type HyvorExport,
  type HyvorImportCounts,
  hyvorImportBatches,
} from "@fox-renard/core";

/**
 * How many Hyvor Comments each request carries at most, unless one thread
 * holds more: each request then stays within the Worker's CPU limit.
 */
const defaultMaxComments = 10;

/** The cookie that holds the console session, as the HTTP API sets it. */
const sessionCookie = "__Host-fox-renard-session";

export interface ImportRun {
  hyvorExport: HyvorExport;
  /** The Site to import into, which the Member's Organization owns. */
  siteId: string;
  /** The Member's email, which is sent the sign-in link. */
  email: string;
  /** Where the console's HTTP API answers, such as `https://console.foxrenard.com`. */
  apiOrigin: string;
  fetch?: typeof fetch;
  /** Asks the Member for the sign-in link they were emailed. */
  askSignInLink: () => Promise<string>;
  print: (line: string) => void;
  maxComments?: number;
}

/**
 * Imports a Hyvor Talk JSON export into a Site (ADR-0007). The Member signs
 * in with a sign-in link, as on the console; the session lives in memory
 * only, and ends with the run.
 */
export async function runImport({
  hyvorExport,
  siteId,
  email,
  apiOrigin,
  fetch,
  askSignInLink,
  print,
  maxComments = defaultMaxComments,
}: ImportRun): Promise<HyvorImportCounts> {
  const batches = hyvorImportBatches(hyvorExport, maxComments);
  const client = createClient(apiOrigin, { fetch });

  const requested = await client.v1.console["sign-in-links"].$post({
    json: { email },
  });
  if (requested.status !== 202) {
    throw new Error(`Could not ask for a sign-in link: ${requested.status}`);
  }
  print(`A sign-in link was emailed to ${email}.`);
  const link = (await askSignInLink()).trim();
  const token = URL.canParse(link)
    ? new URLSearchParams(new URL(link).hash.slice(1)).get("token")
    : null;
  const session = await client.v1.console.sessions.$post({
    json: { token: token ?? "" },
  });
  const cookie = session.headers
    .getSetCookie()
    .map((setCookie) => setCookie.split(";")[0] ?? "")
    .find((pair) => pair.startsWith(`${sessionCookie}=`));
  if (session.status !== 204 || !cookie) {
    throw new Error(
      "This sign-in link did not sign in: it may be used or expired. Run the import again for a new one.",
    );
  }
  const headers = { Cookie: cookie };

  const total = { imported: 0, skipped: 0, alreadyPresent: 0 };
  try {
    for (const [index, threads] of batches.entries()) {
      const response = await client.v1.console.sites[":siteId"][
        "hyvor-import"
      ].$post({ param: { siteId }, json: { threads } }, { headers });
      if (response.status !== 200) {
        throw new Error(
          `Request ${index + 1} of ${batches.length} failed: ${response.status} ${await response.text()}`,
        );
      }
      const counts = await response.json();
      total.imported += counts.imported;
      total.skipped += counts.skipped;
      total.alreadyPresent += counts.alreadyPresent;
      print(`Sent ${index + 1} of ${batches.length} requests.`);
    }
  } finally {
    await client.v1.console.sessions.current.$delete({}, { headers });
  }

  print(`Imported: ${total.imported}`);
  print(`Skipped (spam or deleted): ${total.skipped}`);
  print(`Already present: ${total.alreadyPresent}`);
  return total;
}
