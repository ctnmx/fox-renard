// The console, where Members sign in to manage their Organization's Sites.
import { randomHex, sha256Hex } from "./crypto";
import { signInLinkEmail } from "./emails";
import type { Comment, Member, ModeratedStatus, Page } from "./model";
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

/** Which of a Site's Comments the console lists. */
export interface CommentFilterRequest extends ConsoleRequest {
  siteId: string;
  status: ModeratedStatus;
  /** The Page whose Comments to list, or `null` for all the Site's Pages. */
  pageKey: string | null;
}

/** A Comment or a Reply as a Member moderates it. */
export interface ModeratedCommentView {
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
  counts: Record<ModeratedStatus, number>;
};

export type ConsolePagesResult =
  | { outcome: "listed"; pages: CommentedPage[] }
  | SignedOut
  | { outcome: "site-not-found" };

export type ConsoleCommentsResult =
  | { outcome: "listed"; comments: ModeratedCommentView[] }
  | SignedOut
  | { outcome: "site-not-found" };

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

function moderatedView(
  comment: Comment & { page: ModeratedCommentView["page"] },
): ModeratedCommentView {
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

  /** One of the Member's Sites; another Organization's is never found. */
  async function siteOf(member: Member, siteId: string) {
    const sites = await store.listSites(member.organization.id);
    return sites.find((site) => site.id === siteId) ?? null;
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
     * Member has is sent nothing, and the caller cannot tell the difference.
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
      request: ConsoleRequest & { siteId: string },
    ): Promise<ConsolePagesResult> {
      const member = await signedIn(request);
      if (!member) return { outcome: "signed-out" };
      const site = await siteOf(member, request.siteId);
      if (!site) return { outcome: "site-not-found" };
      return {
        outcome: "listed",
        pages: await store.listCommentedPages(site.id),
      };
    },

    /** A Site's Comments and Replies with one status, newest first, on one Page or all. */
    async consoleComments(
      request: CommentFilterRequest,
    ): Promise<ConsoleCommentsResult> {
      const member = await signedIn(request);
      if (!member) return { outcome: "signed-out" };
      const site = await siteOf(member, request.siteId);
      if (!site) return { outcome: "site-not-found" };

      const comments = await store.listSiteComments(site.id, request);
      return { outcome: "listed", comments: comments.map(moderatedView) };
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
