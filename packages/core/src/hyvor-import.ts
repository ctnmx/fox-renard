/**
 * Importing Comments from a Hyvor Talk JSON export (ADR-0007). The import
 * tool reads the export and sends it, a few conversations at a time, to a
 * Member-only endpoint; Core decides what each Hyvor Comment becomes.
 */

/** A Hyvor Talk Comment's status, which decides whether it is imported. */
export const hyvorStatuses = [
  "published",
  "pending",
  "spam",
  "deleted",
] as const;

export type HyvorStatus = (typeof hyvorStatuses)[number];

/**
 * Who wrote a Hyvor Comment: a HYVOR or SSO account, or a Hyvor guest
 * (`type: null`), who gave a name and maybe an email.
 */
export interface HyvorAuthor {
  type: "hyvor" | "sso" | null;
  /** The account's Hyvor user id, or `null` for a Hyvor guest. */
  id: number | null;
  name: string;
  /** Hyvor shares a Hyvor guest's email, never a HYVOR account's. */
  email: string | null;
}

/** A Hyvor Comment as the import tool sends it, without its counts or IP address. */
export interface HyvorComment {
  id: number;
  /** When it was posted, in seconds since the Unix epoch, as Hyvor tells it. */
  createdAt: number;
  status: HyvorStatus;
  bodyHtml: string;
  /** The Hyvor Comment it answers, or `null` for a top-level Comment. */
  parentId: number | null;
  author: HyvorAuthor;
}

/**
 * A Hyvor conversation: a top-level Hyvor Comment with every Comment
 * answering it, however deep, on its Page.
 */
export interface HyvorConversation {
  /** Hyvor's page `identifier` is the Page Key. */
  page: { key: string; url: string; title: string };
  comments: HyvorComment[];
}

/** What one import request did with the Hyvor Comments it was sent. */
export interface HyvorImportCounts {
  /** Published and Pending Comments created by this request. */
  imported: number;
  /** Spam and deleted Comments, which are never imported. */
  skipped: number;
  /** Comments an earlier run already imported. */
  alreadyPresent: number;
}

/** What several import requests did, added up. */
export function addHyvorImportCounts(
  a: HyvorImportCounts,
  b: HyvorImportCounts,
): HyvorImportCounts {
  return {
    imported: a.imported + b.imported,
    skipped: a.skipped + b.skipped,
    alreadyPresent: a.alreadyPresent + b.alreadyPresent,
  };
}

// The parts of the Hyvor Talk JSON export the import reads, as documented at
// https://hyvor.com/talk/docs/export: its Comment, Page and User objects are
// those of the Console API.

interface HyvorExportPage {
  id: number;
  identifier: string;
  url: string;
  title: string;
}

interface HyvorExportComment {
  id: number;
  created_at: number;
  user: {
    type: "hyvor" | "sso" | null;
    id?: number;
    name: string;
    email?: string | null;
  };
  /** The Page object, or its id. */
  page: HyvorExportPage | number;
  body_html: string;
  status: HyvorStatus;
  /** The parent Comment object, or its id. */
  parent: { id: number } | number | null;
}

export interface HyvorExport {
  comments: HyvorExportComment[];
  pages?: HyvorExportPage[];
}

function idOf(reference: { id: number } | number | null): number | null {
  return typeof reference === "number" ? reference : (reference?.id ?? null);
}

/**
 * The top-level Comment a Hyvor Comment answers, however deep: the first
 * ancestor whose parent is not in `byId`. A cycle stops where it closes.
 */
function topLevelOf<C extends { id: number }>(
  comment: C,
  byId: Map<number, C>,
  parentIdOf: (comment: C) => number | null,
): C {
  const seen = new Set<number>();
  let top = comment;
  for (;;) {
    seen.add(top.id);
    const parent = byId.get(parentIdOf(top) ?? Number.NaN);
    if (!parent || seen.has(parent.id)) return top;
    top = parent;
  }
}

/**
 * The export's conversations in import requests of about `maxComments`
 * Comments each, oldest first. A conversation is never split, so that each
 * request holds everything Core needs to place its Replies.
 */
export function hyvorImportBatches(
  hyvorExport: HyvorExport,
  maxComments: number,
): HyvorConversation[][] {
  if (!Array.isArray(hyvorExport?.comments)) {
    throw new Error("This is not a Hyvor Talk JSON export: it has no comments");
  }
  const pages = new Map(hyvorExport.pages?.map((page) => [page.id, page]));
  const byId = new Map(hyvorExport.comments.map((c) => [c.id, c]));

  const conversations = new Map<number, HyvorConversation>();
  const oldestFirst = hyvorExport.comments.toSorted(
    (a, b) => a.created_at - b.created_at || a.id - b.id,
  );
  for (const comment of oldestFirst) {
    const root = topLevelOf(comment, byId, ({ parent }) => idOf(parent));
    let conversation = conversations.get(root.id);
    if (!conversation) {
      const page =
        typeof root.page === "number" ? pages.get(root.page) : root.page;
      if (!page) {
        throw new Error(`Hyvor comment ${root.id} has no page in the export`);
      }
      conversation = {
        page: { key: page.identifier, url: page.url, title: page.title },
        comments: [],
      };
      conversations.set(root.id, conversation);
    }
    const { user } = comment;
    conversation.comments.push({
      id: comment.id,
      createdAt: comment.created_at,
      status: comment.status,
      bodyHtml: comment.body_html,
      parentId: idOf(comment.parent),
      author: {
        type: user.type,
        id: user.type === null ? null : (user.id ?? null),
        name: user.name,
        email: user.email ?? null,
      },
    });
  }

  const batches: HyvorConversation[][] = [];
  let batch: HyvorConversation[] = [];
  let size = 0;
  for (const conversation of conversations.values()) {
    if (size > 0 && size + conversation.comments.length > maxComments) {
      batches.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(conversation);
    size += conversation.comments.length;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

/**
 * The named entities Hyvor's HTML may hold: those of markup, and the
 * punctuation and letters of French.
 */
const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  euro: "€",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  euml: "ë",
  icirc: "î",
  iuml: "ï",
  ocirc: "ô",
  ugrave: "ù",
  ucirc: "û",
  uuml: "ü",
  oelig: "œ",
  Agrave: "À",
  Ccedil: "Ç",
  Eacute: "É",
  Egrave: "È",
  Ecirc: "Ê",
  OElig: "Œ",
};

function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/giu,
    (entity, decimal, hex, name) => {
      if (name) return entities[name] ?? entity;
      const codePoint = Number.parseInt(decimal ?? hex, decimal ? 10 : 16);
      return codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    },
  );
}

/** Elements that start and end a line of their own. */
const blockElements = new Set([
  "address",
  "article",
  "blockquote",
  "div",
  "dl",
  "dt",
  "dd",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "li",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tr",
  "ul",
]);

const tag =
  /<!--[\s\S]*?-->|<(\/?)([a-z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+|<)/giu;

/**
 * A Hyvor Comment's HTML as plain text, with its line breaks: each paragraph
 * and `<br>` ends a line, a list item starts with "- ", a quoted line with
 * "> ", and a link whose text is not its address keeps the address after it.
 * It runs in Core on every platform, so it reads tags itself, with no DOM.
 */
export function plainTextOf(html: string): string {
  const lines: string[] = [];
  let line = "";
  let bullet = "";
  let quoteDepth = 0;
  let preDepth = 0;
  let skipping: string | null = null;
  let link: { href: string | null; text: string } | null = null;

  const write = (text: string) => {
    const written = line === "" ? text.trimStart() : text;
    if (written === "") return;
    if (line === "") line = "> ".repeat(quoteDepth) + bullet;
    bullet = "";
    line += written;
    if (link) link.text += written;
  };
  const endLine = () => {
    lines.push(line.trimEnd());
    line = "";
  };
  const breakLine = () => {
    if (line !== "") endLine();
  };

  for (const [, closing, rawName, attributes = "", text] of html.matchAll(
    tag,
  )) {
    const name = rawName?.toLowerCase();
    if (skipping) {
      if (closing && name === skipping) skipping = null;
      continue;
    }
    if (text !== undefined) {
      const decoded = decodeEntities(text);
      if (preDepth === 0) {
        write(decoded.replace(/[ \t\n\r\f]+/gu, " "));
        continue;
      }
      // Preformatted text keeps its own line breaks.
      const [first = "", ...rest] = decoded.split(/\r\n?|\n/u);
      write(first);
      for (const part of rest) {
        endLine();
        write(part);
      }
      continue;
    }
    if (!name) continue;
    if (name === "script" || name === "style") {
      if (!closing) skipping = name;
    } else if (name === "br") {
      endLine();
    } else if (name === "a") {
      if (!closing) {
        const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/iu.exec(
          attributes,
        );
        const address = decodeEntities(
          href?.[1] ?? href?.[2] ?? href?.[3] ?? "",
        );
        link = {
          href: /^https?:\/\//iu.test(address) ? address : null,
          text: "",
        };
      } else if (link) {
        const { href, text: shown } = link;
        link = null;
        const bare = (url: string) =>
          url.replace(/^https?:\/\/(?:www\.)?/iu, "").replace(/\/$/u, "");
        if (href && bare(shown.trim()) !== bare(href)) write(` (${href})`);
      }
    } else if (blockElements.has(name)) {
      if (name === "p" && closing) {
        // An empty paragraph is a blank line its author typed.
        endLine();
      } else {
        breakLine();
      }
      if (name === "blockquote") quoteDepth += closing ? -1 : 1;
      if (name === "pre") preDepth += closing ? -1 : 1;
      if (name === "li" && !closing) bullet = "- ";
      quoteDepth = Math.max(quoteDepth, 0);
      preDepth = Math.max(preDepth, 0);
    }
  }
  breakLine();
  return lines
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

/** What Core does with one Hyvor Comment of a conversation, in the order to do it. */
export type HyvorImportStep =
  | {
      type: "comment";
      hyvorComment: HyvorComment;
      /** The Hyvor top-level Comment a Reply sits under, or `null`. */
      topLevelHyvorId: number | null;
      /** Whom a Reply to a Reply answers, for its @mention. */
      answeredName: string | null;
    }
  | {
      /** A top-level Comment never imported, whose place holds its Replies. */
      type: "placeholder";
      hyvorComment: HyvorComment;
    }
  | { type: "skip"; hyvorComment: HyvorComment };

const importedStatuses: ReadonlySet<HyvorStatus> = new Set([
  "published",
  "pending",
]);

/**
 * The steps that import a conversation: its top-level Comment first, so that
 * its Replies find it, then its Replies oldest first. Published and Pending
 * Comments are imported; spam and deleted ones are skipped, but a top-level
 * one whose Replies are imported leaves a placeholder that holds them. Every
 * Reply sits under its top-level Comment, and a Reply to a Reply names whom it
 * answers, as live Replies do.
 */
export function hyvorImportSteps(
  conversation: HyvorConversation,
  displayNameOf: (author: HyvorAuthor) => string,
): HyvorImportStep[] {
  const byId = new Map(conversation.comments.map((c) => [c.id, c]));
  const tops = new Map(
    conversation.comments.map((comment) => [
      comment,
      topLevelOf(comment, byId, ({ parentId }) => parentId),
    ]),
  );
  const topOf = (comment: HyvorComment) => tops.get(comment) ?? comment;

  // A Reply's date may precede its top-level Comment's, so dates alone do
  // not order them.
  const ordered = conversation.comments.toSorted(
    (a, b) =>
      Number(topOf(a) !== a) - Number(topOf(b) !== b) ||
      a.createdAt - b.createdAt ||
      a.id - b.id,
  );
  const holdsReplies = new Set<number>();
  for (const comment of ordered) {
    const top = topOf(comment);
    if (top !== comment && importedStatuses.has(comment.status)) {
      holdsReplies.add(top.id);
    }
  }

  return ordered.map((comment): HyvorImportStep => {
    const top = topOf(comment);
    if (!importedStatuses.has(comment.status)) {
      return top === comment && holdsReplies.has(comment.id)
        ? { type: "placeholder", hyvorComment: comment }
        : { type: "skip", hyvorComment: comment };
    }
    if (top === comment) {
      return {
        type: "comment",
        hyvorComment: comment,
        topLevelHyvorId: null,
        answeredName: null,
      };
    }
    const answered = byId.get(comment.parentId ?? Number.NaN);
    return {
      type: "comment",
      hyvorComment: comment,
      topLevelHyvorId: top.id,
      answeredName:
        answered && answered !== top ? displayNameOf(answered.author) : null,
    };
  });
}
