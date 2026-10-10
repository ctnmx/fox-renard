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

export interface Site {
  id: string;
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
}

/** A Visitor who posted on a Site under a display name, on that Site only (ADR-0005). */
export interface Commenter {
  id: string;
  displayName: string;
}

/** A message a Commenter posted on a Page, in plain text. */
export interface Comment {
  id: string;
  commenter: Commenter;
  /** The top-level Comment a Reply sits under, or `null` for a top-level Comment. */
  topLevelCommentId: string | null;
  text: string;
  createdAt: Date;
}
