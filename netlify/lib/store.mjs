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
// It stores promises, so simultaneous identical reads share a single Blobs call.
const cache = new Map();
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("Blobs timeout")), ms))]);
export function cached(key, ttlMs, fn) {
  if (!cacheEnabled) return fn();
  const hit = cache.get(key);
  const t = Date.now();
  if (hit && t - hit.at < ttlMs) return hit.p;
  const p = withTimeout(Promise.resolve().then(fn), 8000);
  cache.set(key, { at: t, p });
  p.catch(() => { if (cache.get(key) && cache.get(key).p === p) cache.delete(key); });
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return p;
}

// cacheMs > 0 only for read-only polling (state); writers always read the fresh game.
export async function loadGame(st, { cacheMs = 0 } = {}) {
  return cacheMs ? cached("game", cacheMs, () => getJSON(st, K.game)) : getJSON(st, K.game);
}
export const loadPlayer = (st, gid, pid) => cached(`v:${K.player(gid, pid)}`, 3000, () => getJSON(st, K.player(gid, pid)));

// Player records. During the game the roster (names, teams, roles) lives in `game`,
// so only late joiners (not in the roster) need to be fetched.
export async function loadPlayers(st, game, { fresh = false } = {}) {
  const gid = game.gameId;
  const roster = game.phase === "lobby" ? {} : game.roster || {};
  const load = async () => {
    const keys = (await listKeys(st, K.playersPrefix(gid))).filter((k) => !roster[k.slice(K.playersPrefix(gid).length)]);
    const rows = await Promise.all(keys.map((k) => getJSON(st, k)));
    return rows.filter(Boolean);
  };
  return fresh ? load() : cached(`players:${gid}:${game.phase === "lobby"}`, 1200, load);
}

const getCached = (st, key, fresh) => (fresh ? getJSON(st, key) : cached(`v:${key}`, 900, () => getJSON(st, key)));

// All choices of one turn, parsed from the key names.
//   team = null      -> keys only (enough for the public "who has chosen" ticks)
//   team = "fra"     -> values of everything that concerns that team
//   all = true       -> every value (turn resolution)
export async function loadTurn(st, gid, turn, { fresh = false, team = null, all = false } = {}) {
  const listAll = async () => {
    const [pk, tk, ok] = await Promise.all([
      listKeys(st, K.picksPrefix(gid, turn)),
      listKeys(st, K.teamPrefix(gid, turn)),
      listKeys(st, K.offersPrefix(gid, turn)),
    ]);
    return [...pk, ...tk, ...ok];
  };
  const keys = fresh ? await listAll() : await cached(`turnkeys:${gid}:${turn}`, 900, listAll);
  const out = { picks: {}, president: {}, voice: {}, offers: [], replies: {} };
  const items = [];
  for (const key of keys) {
    const parts = key.split("/");
    if (parts[0] === "picks") {
      const [, , , t, role] = parts;
      if (TEAM_IDS.includes(t) && CARD_ROLES.includes(role)) items.push({ key, kind: "pick", t, role, mine: t === team });
    } else if (parts[0] === "team") {
      const [, , , t, who] = parts;
      if (TEAM_IDS.includes(t) && (who === "president" || who === "voice")) items.push({ key, kind: who, t, mine: t === team });
    } else if (parts[0] === "offers") {
      const isReply = parts[3] === "reply";
      const pair = isReply ? parts[4] : parts[3];
      const [from, to] = (pair || "").split("-");
      if (TEAM_IDS.includes(from) && TEAM_IDS.includes(to)) items.push({ key, kind: isReply ? "reply" : "offer", pair, from, to, mine: from === team || to === team });
    }
  }
  const vals = await Promise.all(items.map((it) => (all || it.mine ? getCached(st, it.key, fresh) : Promise.resolve({}))));
  items.forEach((it, i) => {
    const v = vals[i];
    if (!v) return;
    if (it.kind === "pick") (out.picks[it.t] = out.picks[it.t] || {})[it.role] = v;
    else if (it.kind === "president") out.president[it.t] = v;
    else if (it.kind === "voice") out.voice[it.t] = v;
    else if (it.kind === "reply") out.replies[it.pair] = v;
    else out.offers.push({ ...v, from: it.from, to: it.to });
  });
  return out;
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
