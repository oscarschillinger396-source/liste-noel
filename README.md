# 🏁 La liste d'Oscar

Ma liste de Noël spéciale karting, avec un bouton « Je l'offre » pour réserver un cadeau.
Le site est rangé sur GitHub et mis en ligne gratuitement par Netlify.
Netlify garde aussi en mémoire les cadeaux réservés, pour que tout le monde voie la même chose.

## Les fichiers

| Fichier | À quoi il sert |
|---|---|
| `index.html` | La page du site |
| `cadeaux.js` | **La liste des cadeaux : c'est le seul fichier à modifier** |
| `netlify/functions/reservations.mjs` | Le petit programme qui retient les réservations |
| `package.json` et `netlify.toml` | Les réglages pour Netlify (ne pas toucher) |

## 1. Mettre les fichiers sur GitHub (sans rien installer)

1. Crée un compte gratuit sur https://github.com/signup.
2. Clique sur **+** en haut à droite, puis **New repository**.
   - Nom : `liste-de-noel`
   - Clique sur **Create repository**
3. Clique sur le lien **uploading an existing file**.
4. Ouvre le dossier `liste-de-noel` sur ton ordinateur, **sélectionne tout ce qu'il contient**
   (y compris le dossier `netlify`) et glisse-le dans la page GitHub.
5. Clique sur **Commit changes**.

Vérifie que tu vois bien le dossier `netlify` dans la liste des fichiers sur GitHub.

## 2. Mettre le site en ligne avec Netlify

1. Va sur https://app.netlify.com/signup et choisis **Sign up with GitHub**.
2. Clique sur **Add new site** (ou **Add new project**), puis **Import an existing project**.
3. Choisis **GitHub**, autorise Netlify, puis clique sur ton dépôt `liste-de-noel`.
4. Ne change rien aux réglages et clique sur **Deploy**.
5. Attends 1 à 2 minutes. Netlify te donne une adresse du style `https://quelque-chose.netlify.app`.
   Tu peux la changer dans **Site configuration → Change site name** (par exemple `liste-oscar`).

C'est ce lien que tu envoies à tes parents. Les réservations marchent tout de suite.

## Modifier ma liste

1. Sur GitHub, ouvre `cadeaux.js` et clique sur le crayon ✏️.
2. Change ce que tu veux, puis clique sur **Commit changes**.
3. Netlify met le site à jour tout seul en 1 à 2 minutes.

⚠️ Si tu changes le **nom** d'un cadeau, sa réservation est perdue (le site reconnaît les cadeaux par leur nom).

## Bon à savoir

- N'importe qui ayant le lien peut réserver ou annuler. Envoie-le seulement à ta famille.
- Toi aussi, tu verras ce qui est réservé si tu ouvres le site. Si tu veux garder la surprise, ne regarde pas !
- Le site est public : n'y mets pas d'adresse, de numéro de téléphone ou d'autre info perso.
