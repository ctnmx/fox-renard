// Every string the Widget shows on its own; the Site provides the rest. Only
// French ships in V1, and another language is one more object of the same shape.
const fr = {
  poweredBy: "Propulsé par Fox Renard",
  comments: "Commentaires",
  displayName: "Ton nom",
  email: "Ton email (facultatif)",
  emailHint:
    "Reçois un lien pour obtenir le badge vérifié. Ton email n'est jamais affiché.",
  magicLinkSent: "Un lien de confirmation a été envoyé à {email}.",
  magicLinkNotSent:
    "Ton commentaire est publié, mais le lien de confirmation n'a pas pu être envoyé.",
  emailConfirmed: "Ton adresse email est confirmée.",
  magicLinkInvalid: "Ce lien de confirmation n'est plus valide.",
  magicLinkFailed:
    "Ton adresse email n'a pas pu être confirmée. Réessaie dans un instant.",
  verified: "Email vérifié",
  commentLabel: "Ton commentaire",
  commentPlaceholder: "Écris ton commentaire",
  post: "Publier",
  postFailed:
    "Ton commentaire n'a pas pu être publié. Réessaie dans un instant.",
  justNow: "à l'instant",
  invalidDisplayName: "Ton nom est vide ou trop long.",
  emptyComment: "Ton commentaire est vide.",
  commentTooLong: "Ton commentaire est trop long.",
  reply: "Répondre",
  replyTo: "Répondre à {name}",
  repliesTo: "Réponses à {name}",
  replyLabel: "Ta réponse",
  replyPlaceholder: "Écris ta réponse",
  cancel: "Annuler",
  voteUp: "Voter pour ({count})",
  voteDown: "Voter contre ({count})",
  sortBy: "Trier par",
  sortTop: "Top",
  sortNewest: "Plus récents",
  sortOldest: "Plus anciens",
};

/** The language of the strings above, for dates and numbers. */
export const locale = "fr";

export type MessageKey = keyof typeof fr;

/** The string for `key`, with each `{name}` it holds replaced by its value. */
export function t(
  key: MessageKey,
  values: Record<string, string> = {},
): string {
  return fr[key].replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? "");
}
