import type { Database } from "./database";
import {
  allowedDomains,
  members,
  organizations,
  reactionOptions,
  reactionSets,
  sites,
} from "./schema";

/** An Organization with one Site, its Allowed Domains and its Reaction Set. */
export interface SiteSeed {
  name: string;
  organizationId: string;
  siteId: string;
  allowedDomains: readonly string[];
  reactionSet: {
    prompt: string;
    options: readonly { id: string; pictoEmoji: string; label: string }[];
  };
}

/** Fox Renard's first and, in phase 1, only Organization (ADR-0002). */
export const rectoVerso = {
  name: "Recto Verso",
  organizationId: "f451151d-29d5-4aef-b667-26688549afbf",
  siteId: "254bba05-acb2-4d9c-b9fd-f967eb7b539e",
  /** rectoverso.co redirects to www; `localhost` serves the local demo route sheet. */
  allowedDomains: ["rectoverso.co", "www.rectoverso.co", "localhost"],
  reactionSet: {
    prompt: "Alors, cet itinéraire ?",
    options: [
      {
        id: "b75cdc28-9593-47c8-ae2f-f8cac2150f2e",
        pictoEmoji: "💡",
        label: "Je m'inspire",
      },
      {
        id: "bded32e4-85e6-482c-a6ad-eca17a97365f",
        pictoEmoji: "🎒",
        label: "Je le prépare",
      },
      {
        id: "b9430d04-631a-4cd5-a996-3d9ce93c460b",
        pictoEmoji: "🏁",
        label: "Je l'ai fait !",
      },
    ],
  },
} as const satisfies SiteSeed;

/**
 * Seeds an Organization with one Member and one Site, with the Site's Allowed
 * Domains and Reaction Set. Running it again changes nothing.
 */
export async function seedSite(
  db: Database,
  site: SiteSeed,
  { memberEmail }: { memberEmail: string },
): Promise<void> {
  const { name, organizationId, siteId, reactionSet } = site;

  await db.transaction(async (tx) => {
    await tx
      .insert(organizations)
      .values({ id: organizationId, name })
      .onConflictDoNothing();
    await tx
      .insert(members)
      .values({ organizationId, email: memberEmail })
      .onConflictDoNothing();
    await tx
      .insert(sites)
      .values({ id: siteId, organizationId, name })
      .onConflictDoNothing();
    await tx
      .insert(allowedDomains)
      .values(site.allowedDomains.map((domain) => ({ siteId, domain })))
      .onConflictDoNothing();
    await tx
      .insert(reactionSets)
      .values({ siteId, prompt: reactionSet.prompt })
      .onConflictDoNothing();
    await tx
      .insert(reactionOptions)
      .values(
        reactionSet.options.map((option, position) => ({
          ...option,
          siteId,
          position,
        })),
      )
      .onConflictDoNothing();
  });
}

/** Seeds Recto Verso, as `seedSite` does. */
export function seed(
  db: Database,
  { memberEmail }: { memberEmail: string },
): Promise<void> {
  return seedSite(db, rectoVerso, { memberEmail });
}
