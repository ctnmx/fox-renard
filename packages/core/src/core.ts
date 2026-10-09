import { randomHex, sha256Hex } from "./crypto";
import type { Page, Reaction, ReactionOption, Site, Visitor } from "./model";
import type { Ports } from "./ports";

/** Where a public request comes from: a Site, and the domain of the page on it. */
interface SiteRequest {
  siteId: string;
  /** The domain of the page the Widget runs on, or `null` when unknown. */
  domain: string | null;
}

export interface WidgetRequest extends SiteRequest {
  pageKey: string;
  url: string;
  title: string;
  /** The token the browser holds for this Site, or `null` when it has none. */
  browserToken: string | null;
}

export interface ReactionRequest extends SiteRequest {
  pageKey: string;
  /** The token the browser holds for this Site, or `null` when it has none. */
  browserToken: string | null;
  /** The Reaction Option the Visitor chooses, or `null` to remove their Reaction. */
  optionId: string | null;
}

export type CountedReactionOption = ReactionOption & { count: number };

export interface CountedReactionSet {
  prompt: string;
  options: CountedReactionOption[];
}

/** What a Page shows a browser of its Reactions. */
interface ReactionsView {
  reactionSet: CountedReactionSet;
  /** The Reaction this browser holds on the Page. */
  reaction: Reaction | null;
}

type SiteRefusal =
  | { outcome: "site-not-found" }
  | { outcome: "domain-not-allowed" };

export type WidgetResult =
  | ({ outcome: "loaded"; page: Page } & ReactionsView)
  | SiteRefusal;

export type ReactionResult =
  | ({
      outcome: "reacted";
      /** The browser's token for this Site, newly issued if it had none. */
      browserToken: string;
    } & ReactionsView)
  | SiteRefusal
  | { outcome: "page-not-found" }
  | { outcome: "reaction-option-not-found" };

const maxPageTitleLength = 500;

function shorten(text: string, maxLength: number): string {
  // By code point, so an emoji is never cut in half.
  return Array.from(text).slice(0, maxLength).join("");
}

export function createCore({ store }: Ports) {
  async function allowedSite(
    request: SiteRequest,
  ): Promise<SiteRefusal | { outcome: "allowed"; site: Site }> {
    const site = await store.findSite(request.siteId);
    if (!site) return { outcome: "site-not-found" };

    const domain = request.domain?.toLowerCase();
    if (!domain || !site.allowedDomains.includes(domain)) {
      return { outcome: "domain-not-allowed" };
    }
    return { outcome: "allowed", site };
  }

  // The store only ever sees a hash of the token, so a leaked database
  // cannot be used to act as a Visitor.
  async function recognise(
    site: Site,
    browserToken: string | null,
  ): Promise<{ visitor: Visitor; browserToken: string } | null> {
    if (!browserToken) return null;
    const visitor = await store.findVisitor(
      site.id,
      await sha256Hex(browserToken),
    );
    return visitor && { visitor, browserToken };
  }

  async function issueBrowserToken(site: Site) {
    const browserToken = randomHex(32);
    const visitor = await store.createVisitor(
      site.id,
      await sha256Hex(browserToken),
    );
    return { visitor, browserToken };
  }

  async function reactionsView(
    site: Site,
    page: Page,
    visitor: Visitor | null,
  ): Promise<ReactionsView> {
    const { counts, reaction } = await store.findReactions(
      page.id,
      visitor?.id ?? null,
    );
    return {
      reactionSet: {
        prompt: site.reactionSet.prompt,
        options: site.reactionSet.options.map((option) => ({
          ...option,
          count: counts.get(option.id) ?? 0,
        })),
      },
      reaction,
    };
  }

  return {
    /** What a Widget shows on a Page; an unknown Page Key creates the Page. */
    async loadWidget(request: WidgetRequest): Promise<WidgetResult> {
      const allowed = await allowedSite(request);
      if (allowed.outcome !== "allowed") return allowed;
      const { site } = allowed;

      const page = await store.findOrCreatePage(site.id, {
        key: request.pageKey,
        url: request.url,
        title: shorten(request.title, maxPageTitleLength),
      });
      const known = await recognise(site, request.browserToken);

      return {
        outcome: "loaded",
        page,
        ...(await reactionsView(site, page, known?.visitor ?? null)),
      };
    },

    /**
     * Sets, changes or removes a Visitor's one Reaction on a Page. A browser
     * with no token, or with one another Site issued, gets a new token.
     */
    async react(request: ReactionRequest): Promise<ReactionResult> {
      const allowed = await allowedSite(request);
      if (allowed.outcome !== "allowed") return allowed;
      const { site } = allowed;

      const page = await store.findPage(site.id, request.pageKey);
      if (!page) return { outcome: "page-not-found" };

      const { optionId } = request;
      if (
        optionId !== null &&
        !site.reactionSet.options.some((option) => option.id === optionId)
      ) {
        return { outcome: "reaction-option-not-found" };
      }

      const { visitor, browserToken } =
        (await recognise(site, request.browserToken)) ??
        (await issueBrowserToken(site));
      await store.setReaction(page.id, visitor.id, optionId);

      return {
        outcome: "reacted",
        browserToken,
        ...(await reactionsView(site, page, visitor)),
      };
    },
  };
}

export type Core = ReturnType<typeof createCore>;
