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

const MAX_PROFILS = 30;
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
    if (mdp.length < 6) return erreur("Le mot de passe doit faire au moins 6 caractères.");
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
      if (!ok){ await new Promise(r => setTimeout(r, 800)); return erreur("Prénom ou mot de passe incorrect.", 401); }
    }
    const token = signer(await secret(s), { id, exp: Date.now() + DUREE_SESSION });
    return json({ token, profil: { id, prenom: profils[id].prenom } });
  }

  if (chemin[0] !== "listes") return erreur("Adresse inconnue", 404);

  // Toutes les listes
  if (req.method === "GET" && chemin.length === 1){
    const listes = await Promise.all(Object.entries(profils).map(async ([id, p]) => {
      const cadeaux = (await s.get("liste-" + id, { type: "json" })) || [];
      return { id, prenom: p.prenom, nb: cadeaux.length };
    }));
    return json(listes.sort((a, b) => a.prenom.localeCompare(b.prenom, "fr")));
  }

  const id = chemin[1];
  if (!profils[id]) return erreur("Cette liste n'existe pas.", 404);
  const moi = await qui(req, s);
  const proprietaire = moi && moi.id === id;

  // Une liste
  if (req.method === "GET" && chemin.length === 2){
    const cadeaux = (await s.get("liste-" + id, { type: "json" })) || [];
    const resa = proprietaire ? null : ((await s.get("resa-" + id, { type: "json" })) || {});
    return json({ id, prenom: profils[id].prenom, cadeaux, reservations: resa });
  }

  // Modifier ses cadeaux
  if (req.method === "PUT" && chemin[2] === "cadeaux"){
    if (!proprietaire) return erreur("Connecte-toi pour modifier ta liste.", 401);
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
    if (body.action === "reserver") resa[body.cadeau] = resa[body.cadeau] || { le: new Date().toISOString() };
    else if (body.action === "annuler") delete resa[body.cadeau];
    else return erreur("Action inconnue");
    await s.setJSON("resa-" + id, resa);
    return json({ reservations: resa });
  }

  return erreur("Adresse inconnue", 404);
};

export const config = { path: "/api/*" };
