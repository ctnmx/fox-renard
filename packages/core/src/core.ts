import type { Page, Picto } from "./model";
import type { Ports } from "./ports";

export interface WidgetRequest {
  siteId: string;
  /** The domain of the page the Widget runs on, or `null` when unknown. */
  domain: string | null;
  pageKey: string;
  url: string;
  title: string;
}

export interface CountedReactionOption {
  id: string;
  picto: Picto;
  label: string;
  count: number;
}

export interface WidgetData {
  page: Page;
  reactionSet: { prompt: string; options: CountedReactionOption[] };
}

export type WidgetResult =
  | ({ outcome: "loaded" } & WidgetData)
  | { outcome: "site-not-found" }
  | { outcome: "domain-not-allowed" };

/** An Allowed Domain also allows its subdomains, such as `www.`. */
function isAllowed(domain: string | null, allowedDomains: string[]): boolean {
  if (domain === null) return false;
  const requesting = domain.toLowerCase();
  return allowedDomains.some(
    (allowed) => requesting === allowed || requesting.endsWith(`.${allowed}`),
  );
}

export function createCore({ store }: Ports) {
  return {
    /** What a Widget shows on a Page; an unknown Page Key creates the Page. */
    async loadWidget(request: WidgetRequest): Promise<WidgetResult> {
      const site = await store.findSite(request.siteId);
      if (!site) return { outcome: "site-not-found" };
      if (!isAllowed(request.domain, site.allowedDomains)) {
        return { outcome: "domain-not-allowed" };
      }

      const page = await store.findOrCreatePage(site.id, {
        key: request.pageKey,
        url: request.url,
        title: request.title,
      });

      return {
        outcome: "loaded",
        page,
        reactionSet: {
          prompt: site.reactionSet.prompt,
          options: site.reactionSet.options.map((option) => ({
            ...option,
            count: 0,
          })),
        },
      };
    },
  };
}

export type Core = ReturnType<typeof createCore>;
