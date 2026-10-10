// Every string the Widget shows on its own; the Site provides the rest. Only
// French ships in V1, and another language is one more object of the same shape.
const fr = {
  poweredBy: "Propulsé par Fox Renard",
  comments: "Commentaires",
  displayName: "Ton nom",
  commentLabel: "Ton commentaire",
  commentPlaceholder: "Écris ton commentaire",
  post: "Publier",
  postFailed:
    "Ton commentaire n'a pas pu être publié. Réessaie dans un instant.",
  justNow: "à l'instant",
};

/** The language of the strings above, for dates and numbers. */
export const locale = "fr";

export type MessageKey = keyof typeof fr;

export function t(key: MessageKey): string {
  return fr[key];
}
