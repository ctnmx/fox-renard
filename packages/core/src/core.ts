import type { Page, ReactionOption } from "./model";
import type { Ports } from "./ports";

export interface WidgetRequest {
  siteId: string;
  /** The domain of the page the Widget runs on, or `null` when unknown. */
  domain: string | null;
  pageKey: string;
  url: string;
  title: string;
}

export type CountedReactionOption = ReactionOption & { count: number };

export type WidgetResult =
  | {
      outcome: "loaded";
      page: Page;
      reactionSet: { prompt: string; options: CountedReactionOption[] };
    }
  | { outcome: "site-not-found" }
  | { outcome: "domain-not-allowed" };

const maxPageTitleLength = 500;

function shorten(text: string, maxLength: number): string {
  // By code point, so an emoji is never cut in half.
  return Array.from(text).slice(0, maxLength).join("");
}

export function createCore({ store }: Ports) {
  return {
    /** What a Widget shows on a Page; an unknown Page Key creates the Page. */
    async loadWidget(request: WidgetRequest): Promise<WidgetResult> {
      const site = await store.findSite(request.siteId);
      if (!site) return { outcome: "site-not-found" };

      const domain = request.domain?.toLowerCase();
      if (!domain || !site.allowedDomains.includes(domain)) {
        return { outcome: "domain-not-allowed" };
      }

      const page = await store.findOrCreatePage(site.id, {
        key: request.pageKey,
        url: request.url,
        title: shorten(request.title, maxPageTitleLength),
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
