// Le serveur du site : les profils (prénom + mot de passe), les listes de chacun et les réservations.
// Netlify range tout dans "Netlify Blobs" : rien à configurer.
//
//   GET  /api/listes                     → toutes les listes (prénom + nombre de cadeaux)
//   GET  /api/listes/:id                 → une liste, avec ses réservations (cachées à son propriétaire)
//   PUT  /api/listes/:id/cadeaux         → remplacer ses cadeaux (propriétaire connecté seulement)
//   POST /api/listes/:id/reservations    → réserver ou annuler un cadeau (tout le monde sauf le propriétaire)
//   POST /api/inscription                → créer son profil
//   POST /api/connexion                  → se connecter
import { getStore } from "@netlify/blobs";
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "node:crypto";

// Les profils admin peuvent modifier ou supprimer toutes les listes, et donner un nouveau code
const ADMINS = ["oscar"];
const MAX_PROFILS = 30;
// Les thèmes qu'on peut choisir pour sa liste : le fond de la page, et le style des cartes
const FONDS = ["sapin", "polaire", "bordeaux", "chocolat", "galaxie", "minuit", "nuitnoel", "vinchaud", "givre", "bonbon", "cheminee", "lutin"];
const STYLES_LISTE = ["course", "dore", "sucre", "glace", "foret", "pull", "houx", "paillettes", "bonbon", "lutin", "neige", "cadeau", "etoile", "gui"];
// La couleur du prénom, et deux options qu'on allume ou pas : les effets néon et le mode sombre
const PSEUDOS = ["neige", "rouge", "or", "vert", "bleu", "rose", "violet", "orange"];
// La couleur des néons, à part de celle du prénom
const NEONS = ["rose", "cyan", "violet", "vert", "or", "rouge", "bleu", "sapin", "arcenciel"];
const themeDe = p => ({ fond: FONDS.includes(p?.theme?.fond) ? p.theme.fond : "sapin",
  liste: STYLES_LISTE.includes(p?.theme?.liste) ? p.theme.liste : "course",
  pseudo: PSEUDOS.includes(p?.theme?.pseudo) ? p.theme.pseudo : "neige",
  neon: p?.theme?.neon === true, neonCouleur: NEONS.includes(p?.theme?.neonCouleur) ? p.theme.neonCouleur : "rose",
  sombre: p?.theme?.sombre === true });
const MAX_CADEAUX = 60;
const DUREE_SESSION = 60 * 24 * 3600 * 1000; // 60 jours

// Listes déjà prêtes : quand ce prénom crée son profil, sa liste est remplie tout de suite
const LISTES_DE_DEPART = {
  oscar: [
    { nom: "Combinaison OMP KS-3X", prix: 226.8, precisions: "Taille 46",
      lien: "https://www.itakashop.com/fr/combinaisons-homologuees-fia/13308-7377-combinaison-omp-ks-3x-fia-8877-2022.html#/335-taille-46" },
    { nom: "Licence FFSA entraînement", prix: 113, prixEstime: true, lien: "",
      precisions: "Obligatoire pour rouler avec mon kart sur circuit. Elle se prend auprès d'un club de karting et dure 1 an (plus la cotisation du club)" },
    { nom: "Chaussures OMP KS-2X", prix: 142.8, precisions: "Couleur noir, pointure 45",
      lien: "https://www.itakashop.com/fr/chaussures-homologuees-fia/13598-7736-chaussures-omp-ks-2x.html#/172-couleur-noir/398-taille-45" },
    { nom: "Gilet protège-côtes OMP", prix: 74.4, precisions: "Couleur noir, taille L",
      lien: "https://www.itakashop.com/fr/gilets-protege-cotes-kart/13603-7807-gilet-protege-cotes-omp.html#/172-couleur-noir/349-taille-l" },
    { nom: "Cagoule ouverte GT2i Pro", prix: 40, prixEstime: true, precisions: "Homologuée FIA, à mettre sous le casque",
      lien: "https://www.gt2i.com/fr/cagoule-pilote-fia/170996-437260-cagoule-ouverte-gt2i-pro.html" },
  ],
};

const store = () => getStore({ name: "noel", consistency: "strong" });
const json = (data, status = 200) => Response.json(data, { status });
const erreur = (message, status = 400) => json({ erreur: message }, status);

// « Élodie » → « elodie »
const slug = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);

async function secret(s){
  let v = await s.get("secret");
  if (!v){ v = randomBytes(32).toString("hex"); await s.set("secret", v); }
  return v;
}
function signer(sec, payload){
  const b = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return b + "." + createHmac("sha256", sec).update(b).digest("base64url");
}
function verifier(sec, token){
  const [b, sig] = String(token || "").split(".");
  if (!b || !sig) return null;
  const attendu = createHmac("sha256", sec).update(b).digest("base64url");
  if (sig.length !== attendu.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(attendu))) return null;
  try{
    const p = JSON.parse(Buffer.from(b, "base64url").toString());
    return p.exp > Date.now() ? p : null;
  }catch{ return null; }
}
const hacher = (mdp, sel) => scryptSync(String(mdp), sel, 32).toString("hex");

async function qui(req, s){
  const t = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  return t ? verifier(await secret(s), t) : null;
}

// Garde seulement les champs connus, avec des tailles raisonnables
function nettoyerCadeau(c){
  const nom = String(c?.nom || "").trim().slice(0, 120);
  if (!nom) return null;
  let lien = String(c?.lien || "").trim().slice(0, 500);
  try{ if (lien && !/^https?:$/.test(new URL(lien).protocol)) lien = ""; }catch{ lien = ""; }
  const prix = Number(c?.prix);
  return {
    id: /^[a-z0-9]{6,20}$/.test(c?.id || "") ? c.id : randomBytes(6).toString("hex"),
    nom,
    prix: Number.isFinite(prix) && prix > 0 ? Math.round(prix * 100) / 100 : null,
    prixEstime: !!c?.prixEstime,
    lien,
    precisions: String(c?.precisions || "").trim().slice(0, 300),
  };
}

// ---------- Aperçu d'un lien : on lit la page du produit pour trouver le nom, le prix, la taille et la couleur ----------

// Taille et couleur écrites dans l'adresse, par exemple « #/172-couleur-noir/398-taille-45 » (Itaka)
// ou « ?size=M&color=noir »
function optionsDansLien(u){
  const options = {};
  const noter = (cle, valeur) => {
    const v = decodeURIComponent(String(valeur || "")).replace(/[-_+]/g, " ").trim();
    if (!v) return;
    const k = cle.toLowerCase();
    if (/^(couleur|color|colour|coloris|colorname)$/.test(k)) options.couleur = v;
    else if (/^(taille|size|pointure|sizename|shoesize|size_name)$/.test(k)) options.taille = v;
  };
  for (const morceau of u.hash.split("/")){
    const m = morceau.match(/^\d+-([a-zA-Z]+)-(.+)$/);
    if (m) noter(m[1], m[2]);
  }
  for (const [cle, valeur] of u.searchParams) noter(cle, valeur);
  return options;
}

// Cherche un prix dans les données « produit » que les boutiques mettent dans leurs pages
function prixDansPage(html){
  for (const bloc of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)){
    try{
      const trouve = chercherPrix(JSON.parse(bloc[1].trim()));
      if (trouve) return trouve;
    }catch{}
  }
  const meta = html.match(/<meta[^>]+(?:property|name|itemprop)=["'](?:product:price:amount|og:price:amount|price)["'][^>]*content=["']([\d.,\s]+)["']/i)
    || html.match(/<meta[^>]+content=["']([\d.,\s]+)["'][^>]*(?:property|name|itemprop)=["'](?:product:price:amount|og:price:amount|price)["']/i);
  return meta ? nombre(meta[1]) : null;
}
function chercherPrix(o){
  if (!o || typeof o !== "object") return null;
  if (Array.isArray(o)){ for (const x of o){ const p = chercherPrix(x); if (p) return p; } return null; }
  if (o.offers){
    const offres = [].concat(o.offers);
    for (const off of offres){ const p = nombre(off.price ?? off.lowPrice); if (p) return p; }
  }
  for (const v of Object.values(o)){ const p = chercherPrix(v); if (p) return p; }
  return null;
}
function nombre(x){
  const n = parseFloat(String(x ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
function nomDansPage(html){
  const m = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i) || html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (!m) return null;
  // (on garde tout : le site raccourcit ensuite le nom lui-même)
  return m[1].replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s*:\s*Amazon\.fr.*$/i, "").replace(/^Amazon\.fr\s*:\s*/i, "").trim().slice(0, 200) || null;
}

// Amazon ne met pas ses prix dans les données « produit » : ils sont dans <span class="a-offscreen">119,99 €</span>
function prixAmazon(html){
  const zone = html.match(/id=["'](?:corePriceDisplay_desktop_feature_div|corePrice_feature_div|corePrice_desktop|apex_desktop)["'][\s\S]{0,6000}/i);
  const m = zone && zone[0].match(/class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*([\d\s., ]+)\s*(?:€|&euro;)/i);
  if (m) return nombre(m[1].replace(/\./g, "").replace(/[\s ]/g, ""));
  const j = html.match(/"priceAmount"\s*:\s*([\d.]+)/);
  return j ? nombre(j[1]) : null;
}

// La page en texte, ligne par ligne, comme quand on la copie : on y cherche ensuite le prix comme une personne
function texteDeHtml(html){
  return html
    .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>|<\/?(p|div|li|ul|ol|tr|td|th|h[1-6]|section|article|header|footer|nav|button|label|option|dt|dd|table|form|aside|main)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ").replace(/&euro;|&#8364;|&#x20ac;/gi, "€")
    .replace(/&amp;/g, "&").replace(/&#0?39;|&apos;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&eacute;/g, "é").replace(/&egrave;/g, "è").replace(/&agrave;/g, "à").replace(/&ccedil;/g, "ç").replace(/&ecirc;/g, "ê")
    .replace(/&#(\d+);/g, (t, n) => String.fromCharCode(+n));
}

// La taille et la couleur choisies sur la page : Amazon (« Taille : M » au-dessus des boutons),
// les données « produit » (« size », « color »), ou une ligne « Taille : 42 » / « Couleur : Noir » dans la page
function optionsDansPage(html, texte){
  const options = {};
  const propre = v => String(v || "").replace(/&nbsp;|\s+/g, " ").trim();
  const ok = v => v && v.length <= 25 && !/guide|choisir|s[ée]lectionn|tableau|disponible|^taille|^couleur|^voir/i.test(v);
  for (const [cle, amazon] of [["taille", "size_name"], ["couleur", "color_name"]]){
    const m = html.match(new RegExp('id=["\'](?:inline-twister-expanded-dimension-text-' + amazon + '|variation_' + amazon + ')["\'][\\s\\S]{0,600}?class=["\'][^"\']*selection[^"\']*["\'][^>]*>\\s*([^<]{1,30})<', "i"))
      || html.match(new RegExp('id=["\']inline-twister-expanded-dimension-text-' + amazon + '["\'][^>]*>\\s*([^<]{1,30})<', "i"));
    if (m && ok(propre(m[1]))) options[cle] = propre(m[1]);
  }
  for (const bloc of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)){
    try{
      const produits = [JSON.parse(bloc[1].trim())].flat(3).flatMap(o => o && o["@graph"] ? o["@graph"] : [o]);
      for (const p of produits){
        if (!p || !/Product/i.test([].concat(p["@type"] || []).join(" "))) continue;
        const taille = propre(typeof p.size === "object" ? p.size?.name : p.size);
        const couleur = propre(p.color);
        if (!options.taille && ok(taille)) options.taille = taille;
        if (!options.couleur && ok(couleur)) options.couleur = couleur;
      }
    }catch{}
  }
  const t = texte.match(/(?:taille|pointure)(?: s[ée]lectionn[ée]e| choisie)?\s*:\s*([^\n,|:]{1,12})/i);
  if (!options.taille && t && ok(propre(t[1]))) options.taille = propre(t[1]);
  const c = texte.match(/(?:couleur|coloris)(?: s[ée]lectionn[ée]e)?\s*:\s*([^\n,|:]{1,25})/i);
  if (!options.couleur && c && ok(propre(c[1]))) options.couleur = propre(c[1]);
  return options;
}

// Une page « Vérifiez que vous n'êtes pas un robot » au lieu du produit
function pageBloquee(html){
  const titre = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "";
  return /robot|captcha|just a moment|un instant|attention required|access denied|acc[eè]s refus|v[ée]rification|are you a human|pardon our interruption/i.test(titre)
    || (html.length < 15000 && /captcha|cf-challenge|datadome|perimeterx|px-captcha/i.test(html));
}

// « 1 299,99 € » → 1299.99
function lirePrix(t){
  let s = String(t || "").replace(/[^\d.,]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

// La même lecture du prix que sur le site (index.html, « lireTextePage ») : garder les deux pareilles
function prixDansTexte(texte){
  const brutes = texte.replace(/ /g, " ").split(/\r?\n/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  // Recolle les prix coupés en morceaux : « 18 » / « , » / « 95€ » (Amazon), « 44 » / « € » / « , » / « 97 » (Leclerc)…
  const lignes = [];
  const debut = /^\d{1,4}(\s?€)?$/, suite = /^(€|[,.]|[,.]?\d{2}|€\s?[,.]?\d{2}|[,.]\d{2}\s?€|\d{2}\s?€)$/;
  for (let i = 0; i < brutes.length; i++){
    let fait = false;
    for (let n = 4; n >= 2 && !fait; n--){
      const m = brutes.slice(i, i + n);
      if (m.length < n || !debut.test(m[0]) || !m.slice(1).every(x => suite.test(x))) continue;
      const j = m.join("").replace(/\s/g, "");
      if (/^\d{1,4}(€[,.]?\d{2}|[,.]\d{2}€|€)$/.test(j)){ lignes.push(j.replace(/^(\d+)€[,.]?(\d{2})$/, "$1,$2 €")); i += n - 1; fait = true; }
    }
    // « 51 € , 49 » sur une seule ligne → « 51,49 € »
    if (!fait) lignes.push(brutes[i].replace(/(?<![\d,.])(\d{1,4})\s?€\s?[,.]\s?(\d{2})(?!\d)/g, "$1,$2 €"));
  }
  const r = {};
  // Les prix : « 49,99 € », « 49 € », « € 49.99 », « 1 299,99 € »… sauf livraison, mensualités, anciens prix
  const pasUnPrix = /livraison|offert|dès |à partir|économi|au lieu|\bavant\b|barré|ancien|\/ ?mois|€ ?\/|par mois|mois|(?<![a-zà-ÿ])x ?\d|crédit|financ|retrait|frais|remise|réduction|-\s?\d+ ?%|éco-?part|ecopart|reprise|carte cadeau|code|cashback|rembours|soit |prix public|pvc|ppc|jusqu|conseillé|recommandé|référence|initial|habituel|le plus bas|was |rrp|garantie|assurance|\d ans? :|pour \d+ ans|estimée|prévue? le|par unit|par pièce|dépensé|fidélité|= ?\d+ ?points?|adhérez|abonnement|le kg|le litre|prix au |au kg|au litre|montant total|total dû|taeg|current price|original price|prix actuel|prix d'origine/i;
  // Ancien prix annoncé sur la ligne d'avant (« Prix conseillé : » puis « 29,99 € »)
  const ancienPrix = /conseillé|recommandé|référence|initial|habituel|barré|au lieu|\bavant\b|ancien|le plus bas|was|rrp|prix public|économ|livr|expédi|retrait|frais de port|garantie|assurance|extension|occasion|reconditionn|seconde main|point relais|express|install|mis en service|mise en service|^(express|standard|relais|colissimo|chronopost|ups|dpd|mondial relay|point relais|à domicile|en magasin|eco|économique)$/i;
  // « 19,90 € », « 19 €90 » (Cdiscount, Leclerc…), « € 19.90 », « 19.90 EUR »
  const motif = /(?<![\d,.])(\d{1,4}(?:[ .]\d{3})*)\s?€\s?(\d{2})(?!\d)|€\s?(\d{1,4}(?:[ .]\d{3})*(?:[,.]\d{1,2})?)(?![\d,.])|(?<![\d,.])(\d{1,4}(?:[ .]\d{3})*(?:[,.]\d{1,2})?)\s?(?:€|EUR(?:\b|(?=ou\b)))/gi;
  const seulPrix = /^(?:prix\s*:?\s*)?(?:€\s?)?\d{1,4}(?:[ .]\d{3})*(?:[,.]\d{1,2})?\s?(?:€|EUR)?\s?(?:\d{2})?\s?(?:TTC)?$/i;
  const candidats = [];
  // « En 4 fois » / « 3x sans frais » sur la ligne d'avant : c'est une mensualité, pas le prix
  const mensualite = /en [2-9] ?fois|\b[2-9] ?x\b|mensualit|sans frais|paiement|payez en|échéance|versement|crédit|klarna|paypal|oney|alma|floa|scalapay/i;
  // Sur la ligne d'avant, « Paiement en ligne · Service offert » (Auchan) ne veut pas dire « en plusieurs fois »
  const mensualiteAvant = /en [2-9] ?fois|\b[2-9] ?x\b|mensualit|payez en|paiement en [2-9]|paiement de|1er paiement|premier paiement|sans frais|échéance|versement|klarna|paypal|oney|alma|floa|scalapay/i;
  // « 40,28 € » puis « Prix conseillé par la coopérative » (Leclerc) : l'étiquette est en dessous de l'ancien prix
  const etiquetteDessous = /^(prix )?(conseillé|recommandé|de référence|barré|initial|le plus bas|d'origine|habituel)(?!.*:\s*$)/i;
  lignes.forEach((l, i) => {
    const avant = lignes[i - 1] || "", apres = lignes[i + 1] || "";
    if (etiquetteDessous.test(apres)) return;
    // « 5 € » / « cagnottés » (Auchan), « 10 € » / « de réduction » : pas le prix
    if (/^(cagnott|de réduction|d'économie|remboursés?|offerts?$|de remise)/i.test(apres)) return;
    // Prix à l'unité, au kilo… souvent entre parenthèses : « ( » / « 174,95€ » / « 174,95€ / unité) » (Amazon)
    if (avant === "(" || /^[\d\s,.€]*(\/|par) ?(unit|pièce|kg|litre|l\b)/i.test(apres)) return;
    // Offre d'un vendeur « État : Reconditionné » juste au-dessus (Darty, Fnac…) : on garde le prix du neuf
    const etat = lignes.slice(Math.max(0, i - 5), i).reverse().find(x => /^état\s*:/i.test(x));
    if (etat && /reconditionn|occasion|seconde main|très bon|bon état|correct|comme neuf/i.test(etat)) return;
    const etiquetteDuPrixDAvant = (etiquetteDessous.test(avant) && motif.test(lignes[i - 2] || "")) || /^prix (reconditionn|d'occasion)/i.test(avant); motif.lastIndex = 0;
    // « 379,00 € neuf » : le prix du neuf donné pour comparer (Back Market)
    if (/€ ?neuf\b/i.test(l)) return;
    if (l.length > 140 || pasUnPrix.test(l) || mensualite.test(l) || mensualiteAvant.test(avant) || (avant.length <= 45 && ancienPrix.test(avant) && !etiquetteDuPrixDAvant)) return;
    // Texte caché des cartes « produits conseillés » (Nike…) : « current price 132,99 €, original price 189,99 »
    if (/current price|original price|prix d'origine/i.test(avant)) return;
    // Les accessoires proposés juste en dessous (« Compléter avec », « Souvent achetés ensemble »…)
    if (lignes.slice(Math.max(0, i - 3), i).some(x => /compl[éè]te[rz]? avec|achet[ée]s ensemble|vous aimerez|produits similaires|accessoires compatibles|les clients ont aussi/i.test(x))) return;
    // « Dès » / « 11,25 € » / « /mois » : un prix « à partir de » ou une mensualité
    if (/^\/ ?mois|^par mois|^\/ ?month/i.test(apres)) return;
    // « Dès » / « À partir de » au-dessus : un prix possible, mais moins sûr
    const aPartir = /^(dès|à partir de|a partir de|from)$/i.test(avant);
    // « 115,00 € 85,00 € » sur une ligne : l'ancien prix puis le prix soldé, on ne garde que le second
    const vus = [...l.matchAll(motif)].map(m => m[1] ? lirePrix(m[1] + "," + m[2]) : lirePrix(m[3] || m[4]));
    vus.forEach((v, k) => {
      if (vus.length === 2 && k === 0 && vus[1] < v) return;
      if (v && v >= 0.5 && v < 100000) candidats.push({ v, i, seul: seulPrix.test(l) || (vus.length === 2 && /^[\d\s,.€]+$/.test(l)), aPartir });
    });
  });
  if (candidats.length){
    // On note chaque prix pour trouver celui du produit (et pas ceux des autres versions, des produits conseillés…)
    const panier = [];
    lignes.forEach((l, i) => { if (/ajouter au panier|ajouter au sac|add to (cart|bag|basket)|^acheter|acheter maintenant|je l'achète|mettre au panier|commander|pré-?commander|pre-?order/i.test(l)) panier.push(i); });
    const etudies = candidats.slice(0, 40), compte = {};
    // Liste de variantes : « Noir » / « 199,99€ » / « Orange » / « 193,81€ » (Boulanger…)
    const prixSeul = i => !!lignes[i] && seulPrix.test(lignes[i]);
    candidats.forEach(c => { c.liste = (prixSeul(c.i - 2) && (lignes[c.i - 1] || "").length < 60) || (prixSeul(c.i + 2) && (lignes[c.i + 1] || "").length < 60); });
    // Le dernier prix avant le bouton « Ajouter au panier » : c'est presque toujours celui du produit
    panier.forEach(p => { const d = candidats.filter(c => c.i < p && p - c.i <= 40 && !c.liste).pop(); if (d) candidats.filter(c => c.v === d.v && d.i - c.i <= 5 && c.i <= d.i).forEach(c => { c.dernier = true; if (!etudies.includes(c)) etudies.push(c); }); });
    etudies.forEach(c => compte[c.v] = (compte[c.v] || 0) + 1);
    const prixSeulLigne = i => !!lignes[i] && seulPrix.test(lignes[i]);
    const parLigne = {}; candidats.forEach(c => { if (parLigne[c.i] == null) parLigne[c.i] = c.v; });
    etudies.forEach(c => {
      let s = 0;
      if (c.seul) s += 2;                                                   // le prix est seul sur sa ligne
      if (panier.some(p => p > c.i && p - c.i <= 8)) s += 3;                // juste avant « Ajouter au panier »
      if (c.dernier) s += 3;
      if (c.liste) s -= 3;
      if (c.aPartir) s -= 2;
      if (/prix|price|tarif|en 1 fois|maintenant/i.test(lignes[c.i - 1] || "")) s += 1;
      if (/^(prix|price|notre prix|prix de vente|prix actuel)\s*:?$/i.test(lignes[c.i - 1] || "")) s += 2;
      if (compte[c.v] >= 2) s += 2;                                         // il revient plusieurs fois
      if (prixSeulLigne(c.i - 1) && prixSeulLigne(c.i + 1)) s -= 3;         // au milieu d'une liste de prix (autres versions)
      // Deux prix qui se suivent (« 99,99 € » puis « 69,99 € ») : le plus haut est l'ancien prix barré
      const voisin = j => { const v = parLigne[j]; return v != null && seulPrix.test(lignes[j]) ? v : null; };
      if (c.seul && ((voisin(c.i + 1) != null && voisin(c.i + 1) < c.v && voisin(c.i + 2) == null) || (voisin(c.i - 1) != null && voisin(c.i - 1) < c.v && voisin(c.i - 2) == null))) s -= 4;
      // Juste après le vrai prix, on choisit sa taille ou sa couleur ; et le prix du produit vient en premier
      if (lignes.slice(c.i + 1, c.i + 4).some(x => /taille|size|pointure|quantit|couleur|coloris/i.test(x))) s += 2;
      if (c === etudies[0]) s += 1;
      c.score = s;
    });
    const premier = etudies.reduce((a, b) => b.score > a.score ? b : a);
    r.prix = premier.v;
  }
  return r;
}

// Refuse les adresses internes (sécurité : le serveur ne va lire que de vrais sites web)
function lienAutorise(u){
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return false;
  if (/^[\d.]+$/.test(h) || h.includes(":")) return false; // pas d'adresse IP
  return true;
}

async function apercu(lien){
  let u;
  try{ u = new URL(String(lien || "").trim()); }catch{ return { erreur: "Ce lien n'est pas valide." }; }
  if (!lienAutorise(u)) return { erreur: "Ce lien n'est pas valide." };
  const resultat = { ...optionsDansLien(u) };
  try{
    const r = await fetch(u.href, { redirect: "follow", signal: AbortSignal.timeout(7000), headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept": "text/html", "Accept-Language": "fr-FR,fr;q=0.9" } });
    const html = /html/i.test(r.headers.get("content-type") || "") ? (await r.text()).slice(0, 2000000) : "";
    // Le site refuse les robots : on le dit, et on n'insiste pas
    if (!r.ok || !html || pageBloquee(html)){ resultat.bloque = true; return resultat; }
    // 1. les données « produit » cachées dans la page, 2. le prix d'Amazon, 3. la page lue comme du texte
    const texte = texteDeHtml(html);
    resultat.prix = prixDansPage(html) || prixAmazon(html) || prixDansTexte(texte).prix || null;
    resultat.nom = nomDansPage(html);
    // La taille et la couleur écrites dans le lien passent en premier (c'est ce que tu as choisi)
    const page = optionsDansPage(html, texte);
    resultat.taille = resultat.taille || page.taille;
    resultat.couleur = resultat.couleur || page.couleur;
  }catch{ resultat.bloque = true; }
  return resultat;
}

export default async (req) => {
  const s = store();
  const chemin = new URL(req.url).pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  let body = {};
  if (req.method === "POST" || req.method === "PUT"){
    try{ body = await req.json(); }catch{ return erreur("Requête invalide"); }
  }
  const profils = (await s.get("profils", { type: "json" })) || {};

  // Inscription et connexion
  if (req.method === "POST" && (chemin[0] === "inscription" || chemin[0] === "connexion")){
    const prenom = String(body.prenom || "").trim().slice(0, 30);
    const id = slug(prenom), mdp = String(body.motdepasse || "");
    if (!id) return erreur("Écris ton prénom.");
    if (mdp.length < 4) return erreur("Le code doit faire au moins 4 chiffres.");
    if (chemin[0] === "inscription"){
      if (profils[id]) return erreur("Ce prénom a déjà une liste. Connecte-toi plutôt.", 409);
      if (Object.keys(profils).length >= MAX_PROFILS) return erreur("Il y a déjà trop de listes sur le site.");
      const sel = randomBytes(16).toString("hex");
      profils[id] = { prenom, sel, hash: hacher(mdp, sel), cree: new Date().toISOString() };
      await s.setJSON("profils", profils);
      if (LISTES_DE_DEPART[id] && !(await s.get("liste-" + id))){
        await s.setJSON("liste-" + id, LISTES_DE_DEPART[id].map(nettoyerCadeau).filter(Boolean));
      }
    } else {
      const p = profils[id];
      const ok = p && timingSafeEqual(Buffer.from(hacher(mdp, p.sel), "hex"), Buffer.from(p.hash, "hex"));
      if (!ok){ await new Promise(r => setTimeout(r, 800)); return erreur("Ce n'est pas le bon code. Réessaie.", 401); }
    }
    const token = signer(await secret(s), { id, exp: Date.now() + DUREE_SESSION });
    return json({ token, profil: { id, prenom: profils[id].prenom, admin: ADMINS.includes(id), theme: themeDe(profils[id]) } });
  }

  // Aperçu d'un lien de produit (seulement pour les personnes connectées)
  if (req.method === "POST" && chemin[0] === "apercu"){
    const moi = await qui(req, s);
    if (!moi || !profils[moi.id]) return erreur("Connecte-toi pour utiliser cette fonction.", 401);
    const r = await apercu(body.lien);
    return r.erreur ? erreur(r.erreur) : json(r);
  }

  if (chemin[0] !== "listes") return erreur("Adresse inconnue", 404);

  // Toutes les listes
  if (req.method === "GET" && chemin.length === 1){
    const listes = await Promise.all(Object.entries(profils).map(async ([id, p]) => {
      const cadeaux = (await s.get("liste-" + id, { type: "json" })) || [];
      return { id, prenom: p.prenom, nb: cadeaux.length, theme: themeDe(p) };
    }));
    return json(listes.sort((a, b) => a.prenom.localeCompare(b.prenom, "fr")));
  }

  const id = chemin[1];
  if (!profils[id]) return erreur("Cette liste n'existe pas.", 404);
  const jeton = await qui(req, s);
  const moi = jeton && profils[jeton.id] ? jeton : null;
  // C'est la surprise : les personnes connectées à leur compte ne voient que leurs propres réservations.
  // Seuls les invités (les parents…) voient tout, pour s'organiser.
  const visibles = resa => moi ? Object.fromEntries(Object.entries(resa).filter(([, r]) => r.par === moi.id)) : resa;
  const proprietaire = moi && moi.id === id;
  const admin = !!(moi && ADMINS.includes(moi.id) && profils[moi.id]);

  // Admin : supprimer une liste (le profil, ses cadeaux et ses réservations)
  if (req.method === "DELETE" && chemin.length === 2){
    if (!admin) return erreur("Seul l'admin peut supprimer une liste.", 403);
    if (proprietaire) return erreur("Tu ne peux pas supprimer ta propre liste.", 400);
    delete profils[id];
    await s.setJSON("profils", profils);
    await s.delete("liste-" + id);
    await s.delete("resa-" + id);
    return json({ ok: true });
  }

  // Admin : donner un nouveau code à quelqu'un qui a oublié le sien
  if (req.method === "POST" && chemin[2] === "code"){
    if (!admin) return erreur("Seul l'admin peut changer le code des autres.", 403);
    const mdp = String(body.motdepasse || "");
    if (mdp.length < 4) return erreur("Le code doit faire au moins 4 chiffres.");
    const sel = randomBytes(16).toString("hex");
    profils[id] = { ...profils[id], sel, hash: hacher(mdp, sel) };
    await s.setJSON("profils", profils);
    return json({ ok: true });
  }

  // Une liste
  if (req.method === "GET" && chemin.length === 2){
    const cadeaux = (await s.get("liste-" + id, { type: "json" })) || [];
    const resa = proprietaire ? null : visibles((await s.get("resa-" + id, { type: "json" })) || {});
    return json({ id, prenom: profils[id].prenom, theme: themeDe(profils[id]), cadeaux, reservations: resa });
  }

  // Changer le thème de sa liste (ou celui d'un autre pour l'admin)
  if (req.method === "PUT" && chemin[2] === "theme"){
    if (!proprietaire && !admin) return erreur("Connecte-toi pour changer le thème de ta liste.", 401);
    profils[id] = { ...profils[id], theme: themeDe({ theme: body }) };
    await s.setJSON("profils", profils);
    return json({ theme: profils[id].theme });
  }

  // Modifier ses cadeaux
  if (req.method === "PUT" && chemin[2] === "cadeaux"){
    if (!proprietaire && !admin) return erreur("Connecte-toi pour modifier ta liste.", 401);
    const cadeaux = (Array.isArray(body.cadeaux) ? body.cadeaux : []).map(nettoyerCadeau).filter(Boolean).slice(0, MAX_CADEAUX);
    await s.setJSON("liste-" + id, cadeaux);
    return json({ cadeaux });
  }

  // Réserver ou annuler
  if (req.method === "POST" && chemin[2] === "reservations"){
    if (proprietaire) return erreur("Tu ne peux pas réserver tes propres cadeaux !", 403);
    const cadeaux = (await s.get("liste-" + id, { type: "json" })) || [];
    if (!cadeaux.some(c => c.id === body.cadeau)) return erreur("Ce cadeau n'existe plus.", 404);
    const resa = (await s.get("resa-" + id, { type: "json" })) || {};
    const deja = resa[body.cadeau];
    if (body.action === "reserver"){
      // Quelqu'un d'autre l'a déjà pris (la personne connectée ne pouvait pas le voir) : on le dit
      if (deja && !(moi && deja.par === moi.id)) return erreur("Ce cadeau est déjà réservé par quelqu'un d'autre. Choisis-en un autre !", 409);
      resa[body.cadeau] = deja || { le: new Date().toISOString(), ...(moi ? { par: moi.id } : {}) };
    } else if (body.action === "annuler"){
      // Une personne connectée ne peut annuler que ce qu'elle a réservé elle-même
      if (deja && moi && deja.par !== moi.id) return erreur("Tu ne peux annuler que tes propres réservations.", 403);
      delete resa[body.cadeau];
    } else return erreur("Action inconnue");
    await s.setJSON("resa-" + id, resa);
    return json({ reservations: visibles(resa) });
  }

  return erreur("Adresse inconnue", 404);
};

export const config = { path: "/api/*" };
