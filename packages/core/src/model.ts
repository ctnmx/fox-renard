export type Picto = { type: "emoji"; emoji: string };

export interface ReactionOption {
  id: string;
  picto: Picto;
  label: string;
}

export interface ReactionSet {
  prompt: string;
  options: ReactionOption[];
}

/** An Organization, as its Members see it on the console. */
export interface Organization {
  id: string;
  name: string;
}

/** A person who signs in to an Organization's console to manage its Sites. */
export interface Member {
  id: string;
  email: string;
  organization: Organization;
}

export interface Site {
  id: string;
  name: string;
  allowedDomains: string[];
  reactionSet: ReactionSet;
}

export interface Page {
  id: string;
  key: string;
  url: string;
  title: string;
}

/**
 * A Visitor as one Site knows them: by the token their browser holds for that
 * Site, which no other Site recognizes (ADR-0005).
 */
export interface Visitor {
  id: string;
}

/** A Visitor's choice of one Reaction Option on a Page. */
export interface Reaction {
  optionId: string;
  /** Whether it was cast from a browser linked to a Verified Commenter. */
  verified: boolean;
}

/** A Visitor who posted on a Site under a display name, on that Site only (ADR-0005). */
export interface Commenter {
  id: string;
  displayName: string;
  /** Whether a magic link verified their email on this Site. */
  verified: boolean;
}

/** A magic link sent to an email, as stored until it is followed or expires. */
export interface MagicLink {
  siteId: string;
  /** The SHA-256 of the link's token, which is never stored itself. */
  tokenHash: string;
  email: string;
  /** The browser that asked for the link. */
  visitorId: string;
  /** The Commenter that browser posted as. */
  commenterId: string;
  expiresAt: Date;
}

export const voteDirections = ["up", "down"] as const;

/** A Visitor's thumbs-up or thumbs-down on a Comment. */
export type Vote = (typeof voteDirections)[number];

/** A Visitor's Vote on a Comment, as stored. */
export interface CastVote {
  vote: Vote;
  /** Whether it was cast from a browser linked to a Verified Commenter. */
  verified: boolean;
}

/** How many Visitors hold each Vote on a Comment. */
export type VoteCounts = Record<Vote, number>;

/** The statuses a Member lists a Site's Comments by. */
export const listedStatuses = ["published", "pending", "spam"] as const;

/**
 * Whether a Comment is public, a Pending Comment awaiting a Member's
 * approval, or spam a Member set apart.
 */
export type ListedStatus = (typeof listedStatuses)[number];

/**
 * A Comment's status. A deleted Comment with Replies stays as a placeholder,
 * so that its Replies keep their place.
 */
export type CommentStatus = ListedStatus | "deleted";

/** A message a Commenter posted on a Page, in plain text. */
export interface Comment {
  id: string;
  commenter: Pick<Commenter, "id" | "verified">;
  /** The display name the Comment was posted under. */
  displayName: string;
  /** The top-level Comment a Reply sits under, or `null` for a top-level Comment. */
  topLevelCommentId: string | null;
  text: string;
  status: CommentStatus;
  createdAt: Date;
  voteCounts: VoteCounts;
  /** The ids of its Photos, oldest first. */
  photoIds: string[];
}

/** The formats a Photo is stored in: WebP, or PNG from a browser that cannot make WebP. */
export const photoContentTypes = ["image/webp", "image/png"] as const;

export type PhotoContentType = (typeof photoContentTypes)[number];

/** An image a Verified Commenter attached to a Comment, as stored. */
export interface Photo {
  id: string;
  commentId: string;
  contentType: PhotoContentType;
}
