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
  const subject = pending
    ? `${reply ? "Réponse" : "Commentaire"} en attente de ${displayName} sur ${site.name}`
    : `${reply ? "Nouvelle réponse" : "Nouveau commentaire"} de ${displayName} sur ${site.name}`;
  const awaitingApproval = reply
    ? "Cette réponse contient un lien : elle attend votre approbation, et seul son auteur la voit en attendant."
    : "Ce commentaire contient un lien : il attend votre approbation, et seul son auteur le voit en attendant.";
  return {
    to,
    senderName: senderNameOf(site),
    subject,
    text: [
      `${displayName} a publié ${reply ? "une réponse" : "un commentaire"} sur « ${page.title} » :`,
      "",
      text,
      "",
      ...(pending ? [awaitingApproval, ""] : []),
      `Pour ${reply ? "la" : "le"} modérer : ${link}`,
    ].join("\n"),
  };
}
