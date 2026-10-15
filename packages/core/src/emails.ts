// Every email Fox Renard sends, in French only in V1, like the Widget.
import type { Page, Site } from "./model";
import type { Email } from "./ports";

/** A Site's emails go out under its own name. */
function senderNameOf(site: Site): string {
  return `${site.name} via Fox Renard`;
}

/**
 * The email that sends a Commenter their magic link. It names the Comment's
 * display name, so that someone who never posted it can tell, and ignore it.
 * It shows no Page title: a request that forged its Origin can set one, and
 * would then write to a stranger under the Site's name.
 */
export function magicLinkEmail({
  site,
  to,
  displayName,
  link,
}: {
  site: Site;
  to: string;
  displayName: string;
  link: string;
}): Email {
  return {
    to,
    senderName: senderNameOf(site),
    subject: `Confirme ton adresse email sur ${site.name}`,
    text: [
      `Bonjour ${displayName},`,
      "",
      `Tu as publié un commentaire sous le nom « ${displayName} » sur ${site.name}. Pour confirmer ton adresse email et obtenir le badge vérifié, ouvre ce lien dans le navigateur avec lequel tu veux gérer tes commentaires, puis confirme :`,
      "",
      link,
      "",
      "Ce lien ne sert qu'une fois et expire au bout d'une heure.",
      "",
      "Si tu n'as rien publié, ignore cet email : ton adresse ne sera pas conservée.",
    ].join("\n"),
  };
}

/**
 * The email that signs a Member in to the console. Fox Renard sends it under
 * its own name, since the console serves every Site of the Organization.
 */
export function signInLinkEmail({
  to,
  link,
}: {
  to: string;
  link: string;
}): Email {
  return {
    to,
    senderName: "Fox Renard",
    subject: "Votre lien de connexion à Fox Renard",
    text: [
      "Bonjour,",
      "",
      "Pour vous connecter à la console Fox Renard, ouvrez ce lien :",
      "",
      link,
      "",
      "Ce lien ne sert qu'une fois et expire au bout d'une heure.",
      "",
      "Si vous n'avez pas demandé à vous connecter, ignorez cet email.",
    ].join("\n"),
  };
}

/** What a Member's email calls a top-level Comment, and a Reply. */
const commentWords = {
  comment: {
    posted: "un commentaire",
    published: "Nouveau commentaire",
    pending: "Commentaire en attente",
    awaitingApproval:
      "Ce commentaire contient un lien : il attend votre approbation, et seul son auteur le voit en attendant.",
    moderate: "Pour le modérer",
  },
  reply: {
    posted: "une réponse",
    published: "Nouvelle réponse",
    pending: "Réponse en attente",
    awaitingApproval:
      "Cette réponse contient un lien : elle attend votre approbation, et seul son auteur la voit en attendant.",
    moderate: "Pour la modérer",
  },
};

/**
 * The email that tells a Member of a new Comment or Reply on one of their
 * Sites, with a link to moderate it on the console.
 */
export function newCommentEmail({
  site,
  to,
  page,
  displayName,
  text,
  reply,
  pending,
  link,
}: {
  site: Site;
  to: string;
  page: Page;
  displayName: string;
  text: string;
  /** Whether it is a Reply. */
  reply: boolean;
  /** Whether it is a Pending Comment, awaiting the Member's approval. */
  pending: boolean;
  link: string;
}): Email {
  const words = commentWords[reply ? "reply" : "comment"];
  return {
    to,
    senderName: senderNameOf(site),
    subject: `${pending ? words.pending : words.published} de ${displayName} sur ${site.name}`,
    text: [
      `${displayName} a publié ${words.posted} sur « ${page.title} » :`,
      "",
      text,
      "",
      ...(pending ? [words.awaitingApproval, ""] : []),
      `${words.moderate} : ${link}`,
    ].join("\n"),
  };
}
