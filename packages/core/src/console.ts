// The console, where Members sign in to manage their Organization's Sites.
import { randomHex, sha256Hex } from "./crypto";
import { signInLinkEmail } from "./emails";
import {
  type HyvorAuthor,
  type HyvorImportCounts,
  type HyvorThread,
  hyvorImportSteps,
  plainTextOf,
} from "./hyvor-import";
import { maxDisplayNameLength, maxPageTitleLength, shorten } from "./limits";
import type { Comment, ListedStatus, Member, Page } from "./model";
import type { Clock, EmailSender, Store } from "./ports";

const hour = 60 * 60 * 1000;
const day = 24 * hour;

/** How long a sign-in link works, as its email tells. */
const signInLinkLifetime = 1 * hour;

/**
 * How many sign-in links that still work a Member may wait on, so that
 * nobody can flood their inbox.
 */
const maxWorkingSignInLinks = 3;

/** How long a console session lasts once its Member signs in. */
const consoleSessionLifetime = 30 * day;

/**
 * The console's page that a sign-in link opens. Its token travels in the
 * fragment, which never reaches a server, nor other sites as a referrer.
 */
export const signInPath = "/sign-in";

/** A request from the console, signed in or not. */
export interface ConsoleRequest {
  /** The token of the console's session cookie, or `null` when it has none. */
  sessionToken: string | null;
}

type SignedOut = { outcome: "signed-out" };

/** A Member's request about one of their Sites. */
export interface ConsoleSiteRequest extends ConsoleRequest {
  siteId: string;
}

type SiteRefusal = SignedOut | { outcome: "site-not-found" };

/** Which of a Site's Comments the console lists. */
export interface CommentFilterRequest extends ConsoleSiteRequest {
  status: ListedStatus;
  /** The Page whose Comments to list, or `null` for all the Site's Pages. */
  pageKey: string | null;
}

/** A Comment or a Reply as a Member moderates it. */
export interface ConsoleCommentView {
  id: string;
  page: Pick<Page, "key" | "title">;
  commenter: { displayName: string; verified: boolean };
  /** The plain text its Commenter wrote. */
  text: string;
  createdAt: Date;
  /** Whether it is a Reply. */
  reply: boolean;
}

/** A Member's request about one Comment or Reply. */
export interface CommentModerationRequest extends ConsoleRequest {
  commentId: string;
}

type CommentRefusal = SignedOut | { outcome: "comment-not-found" };

export type ApprovalResult = { outcome: "approved" } | CommentRefusal;

export type SpamResult = { outcome: "marked-as-spam" } | CommentRefusal;

export type DeletionResult = { outcome: "deleted" } | CommentRefusal;

/** A Page as the console offers it to filter Comments by. */
export type CommentedPage = Pick<Page, "key" | "title"> & {
  /** How many of its Comments and Replies each status holds. */
  counts: Record<ListedStatus, number>;
};

export type ConsolePagesResult =
  | { outcome: "listed"; pages: CommentedPage[] }
  | SiteRefusal;

export type ConsoleCommentsResult =
  | { outcome: "listed"; comments: ConsoleCommentView[] }
  | SiteRefusal;

/** Hyvor Talk threads a Member imports into one of their Sites (ADR-0007). */
export interface HyvorImportRequest extends ConsoleSiteRequest {
  threads: HyvorThread[];
}

export type HyvorImportResult =
  | ({ outcome: "imported" } & HyvorImportCounts)
  | SiteRefusal;

export type SignInResult =
  | {
      outcome: "signed-in";
      /** The token the console's session cookie holds. */
      sessionToken: string;
      expiresAt: Date;
    }
  | { outcome: "sign-in-link-invalid" };

export type ConsoleHomeResult =
  | {
      outcome: "home";
      member: Pick<Member, "email">;
      organization: { name: string };
      sites: { id: string; name: string }[];
    }
  | SignedOut;

/** The display name an imported Comment shows, as Fox Renard allows it. */
function hyvorDisplayName({ name }: HyvorAuthor): string {
  const displayName = name.normalize("NFC").trim().replace(/\s+/gu, " ");
  return shorten(displayName, maxDisplayNameLength) || "Anonyme";
}

/** An email worth keeping for a Guest to verify later, as Hyvor gives it. */
function hyvorEmail({ email }: HyvorAuthor): string | null {
  const trimmed = email?.trim() ?? "";
  return /^[^\s@]+@[^\s@]+$/u.test(trimmed) ? trimmed : null;
}

/**
 * Tells one Hyvor author apart from every other on a Site: an account by its
 * Hyvor user id, a guest by their email. Two guests without an email cannot
 * be told apart, so each of their Comments gets a Guest of its own.
 */
function hyvorAuthorKey(author: HyvorAuthor): string | null {
  if (author.type !== null && author.id !== null) {
    return `${author.type}:${author.id}`;
  }
  const email = hyvorEmail(author);
  return author.type === null && email ? `email:${email.toLowerCase()}` : null;
}

function consoleCommentView(
  comment: Comment & { page: ConsoleCommentView["page"] },
): ConsoleCommentView {
  return {
    id: comment.id,
    page: comment.page,
    commenter: {
      displayName: comment.displayName,
      verified: comment.commenter.verified,
    },
    text: comment.text,
    createdAt: comment.createdAt,
    reply: comment.topLevelCommentId !== null,
  };
}

export function createConsole({
  store,
  clock,
  email: emailSender,
  consoleOrigin,
}: {
  store: Store;
  clock: Clock;
  email: EmailSender;
  consoleOrigin: string;
}) {
  // The store only ever sees a hash of the token, so a leaked database
  // cannot be used to sign in.
  async function signedIn({
    sessionToken,
  }: ConsoleRequest): Promise<Member | null> {
    if (!sessionToken) return null;
    const session = await store.findConsoleSession(
      await sha256Hex(sessionToken),
    );
    if (!session || session.expiresAt <= clock.now()) return null;
    return session.member;
  }

  /**
   * The Site a signed-in Member asks about, if their Organization owns it;
   * another Organization's is never found.
   */
  async function siteToManage(
    request: ConsoleSiteRequest,
  ): Promise<SiteRefusal | { outcome: "found"; siteId: string }> {
    const member = await signedIn(request);
    if (!member) return { outcome: "signed-out" };
    const sites = await store.listSites(member.organization.id);
    const site = sites.find(({ id }) => id === request.siteId);
    if (!site) return { outcome: "site-not-found" };
    return { outcome: "found", siteId: site.id };
  }

  /** The Comment a signed-in Member asks about, if one of their Sites holds it. */
  async function commentToModerate(
    request: CommentModerationRequest,
  ): Promise<
    CommentRefusal | { outcome: "found"; member: Member; comment: Comment }
  > {
    const member = await signedIn(request);
    if (!member) return { outcome: "signed-out" };
    const comment = await store.findOrganizationComment(
      member.organization.id,
      request.commentId,
    );
    // A deleted Comment's placeholder has nothing left to moderate.
    if (!comment || comment.status === "deleted") {
      return { outcome: "comment-not-found" };
    }
    return { outcome: "found", member, comment };
  }

  return {
    /**
     * Emails a sign-in link to the Member with this address. An address no
     * Member has is sent nothing, and the HTTP API answers it the same.
     */
    async requestSignInLink({ email }: { email: string }): Promise<void> {
      const member = await store.findMember(email);
      if (!member) return;
      const working = await store.countSignInLinks(member.id, clock.now());
      if (working >= maxWorkingSignInLinks) return;

      const token = randomHex(32);
      await store.createSignInLink({
        tokenHash: await sha256Hex(token),
        memberId: member.id,
        expiresAt: new Date(clock.now().getTime() + signInLinkLifetime),
      });
      const link = new URL(signInPath, consoleOrigin);
      link.hash = new URLSearchParams({ token }).toString();
      try {
        await emailSender.send(
          signInLinkEmail({ to: member.email, link: link.href }),
        );
      } catch (error) {
        console.error("Fox Renard: a sign-in link could not be sent.", error);
      }
    },

    /** Follows a sign-in link, which opens a console session. */
    async signIn({ token }: { token: string }): Promise<SignInResult> {
      const link = await store.takeSignInLink(await sha256Hex(token));
      if (!link || link.expiresAt <= clock.now()) {
        return { outcome: "sign-in-link-invalid" };
      }

      const sessionToken = randomHex(32);
      const expiresAt = new Date(
        clock.now().getTime() + consoleSessionLifetime,
      );
      await store.createConsoleSession({
        tokenHash: await sha256Hex(sessionToken),
        memberId: link.memberId,
        expiresAt,
      });
      return { outcome: "signed-in", sessionToken, expiresAt };
    },

    /** Ends a console session, so that its cookie signs in no more. */
    async signOut({ sessionToken }: ConsoleRequest): Promise<void> {
      if (!sessionToken) return;
      await store.deleteConsoleSession(await sha256Hex(sessionToken));
    },

    /** What the console shows a signed-in Member first: their Organization and its Sites. */
    async consoleHome(request: ConsoleRequest): Promise<ConsoleHomeResult> {
      const member = await signedIn(request);
      if (!member) return { outcome: "signed-out" };
      return {
        outcome: "home",
        member: { email: member.email },
        organization: { name: member.organization.name },
        sites: await store.listSites(member.organization.id),
      };
    },

    /** The Pages of a Site that hold Comments, by title, to filter Comments by. */
    async consolePages(
      request: ConsoleSiteRequest,
    ): Promise<ConsolePagesResult> {
      const found = await siteToManage(request);
      if (found.outcome !== "found") return found;
      return {
        outcome: "listed",
        pages: await store.listCommentedPages(found.siteId),
      };
    },

    /** A Site's Comments and Replies with one status, newest first, on one Page or all. */
    async consoleComments(
      request: CommentFilterRequest,
    ): Promise<ConsoleCommentsResult> {
      const found = await siteToManage(request);
      if (found.outcome !== "found") return found;

      const { status, pageKey } = request;
      const comments = await store.listSiteComments(found.siteId, {
        status,
        pageKey,
      });
      return { outcome: "listed", comments: comments.map(consoleCommentView) };
    },

    /**
     * Imports Hyvor Talk threads into a Site, keyed by Hyvor comment id, so
     * that importing them again creates nothing new (ADR-0007). An imported
     * Comment keeps its date and Hyvor's status: it passes no bot check, rate
     * limit or link rule, and emails nobody. Its author is a Guest. No
     * Reaction or Vote is imported.
     */
    async importHyvor(request: HyvorImportRequest): Promise<HyvorImportResult> {
      const found = await siteToManage(request);
      if (found.outcome !== "found") return found;
      const { siteId } = found;

      const counts = { imported: 0, skipped: 0, alreadyPresent: 0 };
      for (const thread of request.threads) {
        const page = await store.findOrCreatePage(siteId, {
          ...thread.page,
          title: shorten(thread.page.title, maxPageTitleLength),
        });
        const known = await store.findHyvorComments(
          page.id,
          thread.comments.map(({ id }) => id),
        );

        for (const step of hyvorImportSteps(thread, hyvorDisplayName)) {
          const {
            id: hyvorCommentId,
            createdAt,
            status,
            author,
          } = step.hyvorComment;
          if (step.type !== "comment") counts.skipped += 1;
          if (step.type === "skip") continue;
          if (known.has(hyvorCommentId)) {
            if (step.type === "comment") counts.alreadyPresent += 1;
            continue;
          }

          const createdAtDate = new Date(createdAt * 1000);
          if (step.type === "placeholder") {
            // Nothing its author said stays, nor who they were.
            const commenter = await store.findOrCreateHyvorCommenter({
              siteId,
              hyvorAuthorKey: null,
              displayName: "",
              email: null,
            });
            const { id } = await store.createComment({
              pageId: page.id,
              commenterId: commenter.id,
              displayName: "",
              topLevelCommentId: null,
              text: "",
              status: "deleted",
              createdAt: createdAtDate,
              hyvorCommentId,
            });
            known.set(hyvorCommentId, id);
            continue;
          }

          const topLevelCommentId =
            step.topLevelHyvorId === null
              ? null
              : (known.get(step.topLevelHyvorId) ?? null);
          const displayName = hyvorDisplayName(author);
          const body = plainTextOf(step.hyvorComment.bodyHtml);
          const commenter = await store.findOrCreateHyvorCommenter({
            siteId,
            hyvorAuthorKey: hyvorAuthorKey(author),
            displayName,
            email: hyvorEmail(author),
          });
          const { id } = await store.createComment({
            pageId: page.id,
            commenterId: commenter.id,
            displayName,
            topLevelCommentId,
            text:
              step.answeredName === null
                ? body
                : `@${step.answeredName} ${body}`,
            status: status === "pending" ? "pending" : "published",
            createdAt: createdAtDate,
            hyvorCommentId,
          });
          known.set(hyvorCommentId, id);
          counts.imported += 1;
        }
      }
      return { outcome: "imported", ...counts };
    },

    /** Publishes a Pending Comment, or one marked as spam by mistake. */
    async approveComment(
      request: CommentModerationRequest,
    ): Promise<ApprovalResult> {
      const found = await commentToModerate(request);
      if (found.outcome !== "found") return found;
      await store.setCommentStatus(found.comment.id, "published");
      return { outcome: "approved" };
    },

    /** Sets a Comment apart as spam, out of every Visitor's sight. */
    async markAsSpam(request: CommentModerationRequest): Promise<SpamResult> {
      const found = await commentToModerate(request);
      if (found.outcome !== "found") return found;
      await store.setCommentStatus(found.comment.id, "spam");
      return { outcome: "marked-as-spam" };
    },

    /**
     * Deletes a Comment. A top-level Comment with Replies leaves a
     * placeholder that keeps them, and a placeholder goes with its last Reply.
     * Comments hold no Photo yet: #12 deletes them with their Comment.
     */
    async deleteComment(
      request: CommentModerationRequest,
    ): Promise<DeletionResult> {
      const found = await commentToModerate(request);
      if (found.outcome !== "found") return found;
      const { id, topLevelCommentId } = found.comment;

      if (topLevelCommentId === null) {
        if ((await store.countReplies(id)) > 0) {
          await store.leavePlaceholder(id);
        } else {
          await store.deleteComment(id);
        }
        return { outcome: "deleted" };
      }

      await store.deleteComment(id);
      const topLevel = await store.findOrganizationComment(
        found.member.organization.id,
        topLevelCommentId,
      );
      if (
        topLevel?.status === "deleted" &&
        (await store.countReplies(topLevel.id)) === 0
      ) {
        await store.deleteComment(topLevel.id);
      }
      return { outcome: "deleted" };
    },
  };
}
