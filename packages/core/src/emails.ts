// Every email Fox Renard sends, in French only in V1, like the Widget.
import type { Site } from "./model";
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
      `Tu as publié un commentaire sous le nom « ${displayName} » sur ${site.name}. Pour confirmer ton adresse email et obtenir le badge vérifié, ouvre ce lien dans le navigateur avec lequel tu veux gérer tes commentaires :`,
      "",
      link,
      "",
      "Ce lien ne sert qu'une fois et expire au bout d'une heure.",
      "",
      "Si tu n'as rien publié, ignore cet email : ton adresse ne sera pas conservée.",
    ].join("\n"),
  };
}
