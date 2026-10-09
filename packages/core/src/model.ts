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

/** A browser that reacted on a Site, known by its token for that Site only (ADR-0005). */
export interface Visitor {
  id: string;
}

/** A Visitor's choice of one Reaction Option on a Page. */
export interface Reaction {
  optionId: string;
}
