// Enregistre les cadeaux réservés, pour que tout le monde voie la même chose.
// Netlify range les données dans "Netlify Blobs" : rien à configurer.
import { getStore } from "@netlify/blobs";

const CLE = "liste";
const ID_VALIDE = /^[a-z0-9-]{1,60}$/;
const MAX_RESERVATIONS = 200;

export default async (req) => {
  const store = getStore({ name: "reservations", consistency: "strong" });
  const reservations = (await store.get(CLE, { type: "json" })) || {};

  if (req.method === "GET") return Response.json(reservations);
  if (req.method !== "POST") return new Response("Méthode non autorisée", { status: 405 });

  let body;
  try { body = await req.json(); } catch { return new Response("Requête invalide", { status: 400 }); }
  const { id, action } = body || {};
  if (typeof id !== "string" || !ID_VALIDE.test(id)) return new Response("Cadeau inconnu", { status: 400 });

  if (action === "reserver") {
    if (!reservations[id] && Object.keys(reservations).length >= MAX_RESERVATIONS) {
      return new Response("Trop de réservations", { status: 400 });
    }
    reservations[id] = reservations[id] || { le: new Date().toISOString() };
  } else if (action === "annuler") {
    delete reservations[id];
  } else {
    return new Response("Action inconnue", { status: 400 });
  }

  await store.setJSON(CLE, reservations);
  return Response.json(reservations);
};

export const config = { path: "/api/reservations" };
