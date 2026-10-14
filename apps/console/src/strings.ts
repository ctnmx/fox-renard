// The console's words, in French like Fox Renard's emails to Members.
export const strings = {
  signIn: "Se connecter",
  signInTitle: "Connexion à la console",
  signInIntro:
    "Saisissez votre adresse email : vous recevrez un lien pour vous connecter, sans mot de passe.",
  email: "Adresse email",
  sendLink: "Recevoir un lien de connexion",
  linkSent:
    "Si cette adresse est celle d'un membre, un lien de connexion vient de lui être envoyé. Il expire au bout d'une heure.",
  followLinkIntro: "Confirmez la connexion à la console Fox Renard.",
  linkInvalid:
    "Ce lien de connexion n'est plus valide. Demandez-en un nouveau ci-dessous.",
  failed: "Une erreur est survenue. Réessayez dans un instant.",
  signOut: "Se déconnecter",
  comments: "Commentaires",
  statuses: {
    pending: "En attente",
    published: "Publiés",
    spam: "Spam",
  },
  noComments: {
    pending: "Aucun commentaire en attente.",
    published: "Aucun commentaire publié.",
    spam: "Aucun commentaire marqué comme spam.",
  },
  page: "Page",
  allPages: "Toutes les pages",
  verified: "Email vérifié",
  reply: "Réponse",
  approve: "Approuver",
  markAsSpam: "Spam",
  delete: "Supprimer",
  deleteTitle: "Supprimer ce commentaire ?",
  deleteDescription:
    "Il disparaît pour de bon. S'il a des réponses, « Commentaire supprimé » reste à sa place au-dessus d'elles.",
  cancel: "Annuler",
} as const;
