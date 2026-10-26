// Enregistre les cadeaux réservés, pour que tout le monde voie la même chose.
// Netlify range les données dans "Netlify Blobs" : rien à configurer.

// Le serveur du site : les profils (prénom + code), les listes de chacun et les réservations.
// Le serveur du site : les profils (prénom + code), les listes de chacun et les réservations.
// Le serveur du site : les profils (prénom + code), les listes de chacun, leurs thèmes et les réservations.
// Le serveur du site : les profils (prénom + code), les listes de chacun, leurs thèmes et les réservations.
import { getStore } from "@netlify/blobs";
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "node:crypto";

// Les profils admin peuvent modifier ou supprimer toutes les listes, et donner un nouveau code
const ADMINS = ["oscar"];
const MAX_PROFILS = 30;
// Les thèmes qu'on peut choisir pour sa liste : le fond de la page, et le style des cartes
const FONDS = ["sapin", "polaire", "bordeaux", "chocolat", "galaxie"];
const STYLES_LISTE = ["course", "dore", "sucre", "glace", "foret"];
const themeDe = p => ({ fond: FONDS.includes(p?.theme?.fond) ? p.theme.fond : "sapin",
  liste: STYLES_LISTE.includes(p?.theme?.liste) ? p.theme.liste : "course" });
const MAX_CADEAUX = 60;
const DUREE_SESSION = 60 * 24 * 3600 * 1000;

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

const slug = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
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
function optionsDansLien(u){
  const options = {};
  const noter = (cle, valeur) => {
    const v = decodeURIComponent(String(valeur || "")).replace(/[-_+]/g, " ").trim();
    if (!v) return;
    const k = cle.toLowerCase();
    if (/^(couleur|color|colour|coloris)$/.test(k)) options.couleur = v;
    else if (/^(taille|size|pointure)$/.test(k)) options.taille = v;
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
    for (const off of [].concat(o.offers)){ const p = nombre(off.price ?? off.lowPrice); if (p) return p; }
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
  return m[1].replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').split(/\s[|–-]\s/)[0].trim().slice(0, 120) || null;
}

// Refuse les adresses internes (sécurité : le serveur ne va lire que de vrais sites web)
function lienAutorise(u){
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return false;
  if (/^[\d.]+$/.test(h) || h.includes(":")) return false;
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
    if (r.ok && /html/i.test(r.headers.get("content-type") || "")){
      const html = (await r.text()).slice(0, 1500000);
      resultat.prix = prixDansPage(html);
      resultat.nom = nomDansPage(html);
    }
  }catch{}
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

  if (req.method === "GET" && chemin.length === 1){
    const listes = await Promise.all(Object.entries(profils).map(async ([id, p]) => {
      const cadeaux = (await s.get("liste-" + id, { type: "json" })) || [];
      return { id, prenom: p.prenom, nb: cadeaux.length, theme: themeDe(p) };
    }));
    return json(listes.sort((a, b) => a.prenom.localeCompare(b.prenom, "fr")));
  }

  const id = chemin[1];
  if (!profils[id]) return erreur("Cette liste n'existe pas.", 404);
  const moi = await qui(req, s);
  const proprietaire = moi && moi.id === id;
  const admin = !!(moi && ADMINS.includes(moi.id) && profils[moi.id]);

  if (req.method === "DELETE" && chemin.length === 2){
    if (!admin) return erreur("Seul l'admin peut supprimer une liste.", 403);
    if (proprietaire) return erreur("Tu ne peux pas supprimer ta propre liste.", 400);
    delete profils[id];
    await s.setJSON("profils", profils);
    await s.delete("liste-" + id);
    await s.delete("resa-" + id);
    return json({ ok: true });
  }

  if (req.method === "POST" && chemin[2] === "code"){
    if (!admin) return erreur("Seul l'admin peut changer le code des autres.", 403);
    const mdp = String(body.motdepasse || "");
    if (mdp.length < 4) return erreur("Le code doit faire au moins 4 chiffres.");
    const sel = randomBytes(16).toString("hex");
    profils[id] = { ...profils[id], sel, hash: hacher(mdp, sel) };
    await s.setJSON("profils", profils);
    return json({ ok: true });
  }

  if (req.method === "GET" && chemin.length === 2){
    const cadeaux = (await s.get("liste-" + id, { type: "json" })) || [];
    const resa = proprietaire ? null : ((await s.get("resa-" + id, { type: "json" })) || {});
    return json({ id, prenom: profils[id].prenom, theme: themeDe(profils[id]), cadeaux, reservations: resa });
  }

  if (req.method === "PUT" && chemin[2] === "theme"){
    if (!proprietaire && !admin) return erreur("Connecte-toi pour changer le thème de ta liste.", 401);
    profils[id] = { ...profils[id], theme: themeDe({ theme: body }) };
    await s.setJSON("profils", profils);
    return json({ theme: profils[id].theme });
  }

  if (req.method === "PUT" && chemin[2] === "cadeaux"){
    if (!proprietaire && !admin) return erreur("Connecte-toi pour modifier ta liste.", 401);
    const cadeaux = (Array.isArray(body.cadeaux) ? body.cadeaux : []).map(nettoyerCadeau).filter(Boolean).slice(0, MAX_CADEAUX);
    await s.setJSON("liste-" + id, cadeaux);
    return json({ cadeaux });
  }

  if (req.method === "POST" && chemin[2] === "reservations"){
    if (proprietaire) return erreur("Tu ne peux pas réserver tes propres cadeaux !", 403);
    const cadeaux = (await s.get("liste-" + id, { type: "json" })) || [];
    if (!cadeaux.some(c => c.id === body.cadeau)) return erreur("Ce cadeau n'existe plus.", 404);
    const resa = (await s.get("resa-" + id, { type: "json" })) || {};
    if (body.action === "reserver") resa[body.cadeau] = resa[body.cadeau] || { le: new Date().toISOString() };
    else if (body.action === "annuler") delete resa[body.cadeau];
    else return erreur("Action inconnue");
    await s.setJSON("resa-" + id, resa);
    return json({ reservations: resa });
  }

  return erreur("Adresse inconnue", 404);
};

export const config = { path: "/api/*" };
