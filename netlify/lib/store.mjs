// Netlify Blobs access + small HTTP helpers shared by all functions.
//
// Key layout (one writer per key, see SPEC §2 "Règle d'or"):
//   game                                          host actions only
//   players/<gameId>/<pid>                        the player <pid> (join)
//   picks/<gameId>/<turn>/<team>/<role>           the holder(s) of that role
//   team/<gameId>/<turn>/<team>/president|voice   the president / the voice
//   offers/<gameId>/<turn>/<from>-<to>            the sender's diplomat
//   offers/<gameId>/<turn>/reply/<from>-<to>      the receiver's diplomat
//   (not ".../<from>-<to>/reply": a key cannot also be a "folder" in the local Blobs sandbox)
import { getStore } from "@netlify/blobs";
import { TEAM_IDS, CARD_ROLES } from "./data.mjs";

let storeOverride = null;
let clockOverride = null;

let cacheEnabled = true;
export function setStoreForTests(s, { useCache = false } = {}) { storeOverride = s; cacheEnabled = useCache; cache.clear(); }
export function setClockForTests(fn) { clockOverride = fn; }
export const now = () => (clockOverride ? clockOverride() : Date.now());

export function store() {
  return storeOverride || getStore({ name: "softpower", consistency: "strong" });
}

export const K = {
  game: "game",
  playersPrefix: (gid) => `players/${gid}/`,
  player: (gid, pid) => `players/${gid}/${pid}`,
  picksPrefix: (gid, turn) => `picks/${gid}/${turn}/`,
  pick: (gid, turn, team, role) => `picks/${gid}/${turn}/${team}/${role}`,
  teamPrefix: (gid, turn) => `team/${gid}/${turn}/`,
  teamAction: (gid, turn, team, who) => `team/${gid}/${turn}/${team}/${who}`,
  offersPrefix: (gid, turn) => `offers/${gid}/${turn}/`,
  offer: (gid, turn, from, to) => `offers/${gid}/${turn}/${from}-${to}`,
  reply: (gid, turn, from, to) => `offers/${gid}/${turn}/reply/${from}-${to}`,
};

export async function getJSON(st, key) {
  try { return (await st.get(key, { type: "json" })) ?? null; } catch { return null; }
}
export async function setJSON(st, key, value) { await st.setJSON(key, value); }
export async function del(st, key) { await st.delete(key); }
export async function listKeys(st, prefix) {
  const res = await st.list({ prefix });
  return (res.blobs || []).map((b) => b.key);
}

// Tiny per-instance cache to protect Blobs from 30 clients polling every 1.5 s.
const cache = new Map();
export async function cached(key, ttlMs, fn) {
  if (!cacheEnabled) return fn();
  const hit = cache.get(key);
  const t = Date.now();
  if (hit && t - hit.at < ttlMs) return hit.value;
  const value = await fn();
  cache.set(key, { at: t, value });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return value;
}

export async function loadGame(st) { return getJSON(st, K.game); }

export async function loadPlayers(st, gid, { fresh = false } = {}) {
  const load = async () => {
    const keys = await listKeys(st, K.playersPrefix(gid));
    const rows = await Promise.all(keys.map((k) => getJSON(st, k)));
    return rows.filter(Boolean);
  };
  return fresh ? load() : cached(`players:${gid}`, 1200, load);
}

// All choices of one turn, parsed from the key names.
export async function loadTurn(st, gid, turn, { fresh = false } = {}) {
  const load = async () => {
    const [pk, tk, ok] = await Promise.all([
      listKeys(st, K.picksPrefix(gid, turn)),
      listKeys(st, K.teamPrefix(gid, turn)),
      listKeys(st, K.offersPrefix(gid, turn)),
    ]);
    const all = [...pk, ...tk, ...ok];
    const vals = await Promise.all(all.map((k) => getJSON(st, k)));
    const out = { picks: {}, president: {}, voice: {}, offers: [], replies: {} };
    all.forEach((key, i) => {
      const v = vals[i];
      if (!v) return;
      const parts = key.split("/");
      if (parts[0] === "picks") {
        const [, , , team, role] = parts;
        if (!TEAM_IDS.includes(team) || !CARD_ROLES.includes(role)) return;
        (out.picks[team] = out.picks[team] || {})[role] = v;
      } else if (parts[0] === "team") {
        const [, , , team, who] = parts;
        if (!TEAM_IDS.includes(team)) return;
        if (who === "president") out.president[team] = v;
        if (who === "voice") out.voice[team] = v;
      } else if (parts[0] === "offers") {
        const isReply = parts[3] === "reply";
        const pair = isReply ? parts[4] : parts[3];
        const [from, to] = (pair || "").split("-");
        if (!TEAM_IDS.includes(from) || !TEAM_IDS.includes(to)) return;
        if (isReply) out.replies[pair] = v;
        else out.offers.push({ ...v, from, to });
      }
    });
    return out;
  };
  return fresh ? load() : cached(`turn:${gid}:${turn}`, 900, load);
}

// ---------------------------------------------------------------- HTTP helpers
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
export const fail = (status, error) => json({ error }, status);

export async function readBody(req) {
  try {
    const text = await req.text();
    if (text.length > 4000) return null;
    const body = JSON.parse(text || "{}");
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch { return null; }
}

export const PID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export function hostKeyConfigured() {
  return !!envHostKey();
}
function envHostKey() {
  const fromNetlify = globalThis.Netlify && globalThis.Netlify.env && globalThis.Netlify.env.get("HOST_KEY");
  return fromNetlify || process.env.HOST_KEY || "";
}
export function checkHostKey(key) {
  const expected = envHostKey();
  if (!expected || typeof key !== "string" || key.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function cleanName(name) {
  if (typeof name !== "string") return null;
  const n = name.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim();
  const len = [...n].length;
  return len >= 2 && len <= 16 ? n : null;
}

export function newGameId() {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
