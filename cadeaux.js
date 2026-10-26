// ✏️ C'EST ICI QUE TU MODIFIES TA LISTE
// Sur GitHub : ouvre ce fichier, clique sur le crayon (Edit), change ce que tu veux,
// puis clique sur "Commit changes". Le site se met à jour tout seul en 1 à 2 minutes.
//
// Pour chaque cadeau :
//   nom        → le nom du cadeau (obligatoire)
//   prix       → le prix en euros, sans le signe € (ou null si tu ne sais pas)
//   prixEstime → true si le prix est une estimation (affiche « env. » devant)
//   lien       → l'adresse du produit sur internet (ou "" s'il n'y en a pas)
//   precisions → taille, couleur, modèle… séparés par des virgules (ou "")
//                « Taille … », « Pointure … » et « Couleur … » s'affichent en étiquettes
//   envie      → 3 = trop envie, 2 = bien, 1 = si ça se trouve
//
// Attention : garde bien les guillemets "…" et la virgule à la fin de chaque bloc { … },

const LISTE = {
  prenom: "Oscar",
  message: "Cette année, c'est spécial karting : tout l'équipement pour rouler avec mon kart sur circuit.",

  cadeaux: [
    {
      nom: "Combinaison OMP KS-3X",
      prix: 226.8,
      lien: "https://www.itakashop.com/fr/combinaisons-homologuees-fia/13308-7377-combinaison-omp-ks-3x-fia-8877-2022.html#/335-taille-46",
      precisions: "Taille 46",
      envie: 3,
    },
    {
      nom: "Licence FFSA entraînement",
      prix: 113,
      prixEstime: true,
      lien: "",
      precisions: "Obligatoire pour rouler avec mon kart sur circuit. Elle se prend auprès d'un club de karting et dure 1 an (plus la cotisation du club)",
      envie: 3,
    },
    {
      nom: "Chaussures OMP KS-2X",
      prix: 142.8,
      lien: "https://www.itakashop.com/fr/chaussures-homologuees-fia/13598-7736-chaussures-omp-ks-2x.html#/172-couleur-noir/398-taille-45",
      precisions: "Couleur noir, pointure 45",
      envie: 2,
    },
    {
      nom: "Gilet protège-côtes OMP",
      prix: 74.4,
      lien: "https://www.itakashop.com/fr/gilets-protege-cotes-kart/13603-7807-gilet-protege-cotes-omp.html#/172-couleur-noir/349-taille-l",
      precisions: "Couleur noir, taille L",
      envie: 2,
    },
    {
      nom: "Cagoule ouverte GT2i Pro",
      prix: 40,
      prixEstime: true,
      lien: "https://www.gt2i.com/fr/cagoule-pilote-fia/170996-437260-cagoule-ouverte-gt2i-pro.html",
      precisions: "Homologuée FIA, à mettre sous le casque",
      envie: 2,
    },
  ],
};
