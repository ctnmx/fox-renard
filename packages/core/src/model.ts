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
