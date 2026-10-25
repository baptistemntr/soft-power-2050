// POST /api/pick  { pid, role, card, target? }  — choose a card for one of my roles (phase decide).
import { store, now, json, fail, readBody, loadGame, getJSON, setJSON, K, PID_RE } from "../lib/store.mjs";
import { CARD, CARD_ROLES } from "../lib/data.mjs";
import { decideOpen, dealHand, cultureTargets } from "../lib/engine.mjs";
import { playerRoles } from "../lib/view.mjs";

export default async (req) => {
  if (req.method !== "POST") return fail(405, "POST only");
  const body = await readBody(req);
  if (!body || typeof body.pid !== "string" || !PID_RE.test(body.pid)) return fail(400, "Bad request");
  const st = store();
  const game = await loadGame(st);
  if (!game) return fail(409, "No game");
  const t = now();
  if (!decideOpen(game, t)) return fail(409, "Too late: decisions are closed");
  const player = await getJSON(st, K.player(game.gameId, body.pid));
  const info = playerRoles(game, player);
  if (!info) return fail(403, "Unknown player");
  const { role, card, target } = body;
  if (!CARD_ROLES.includes(role) || !info.roles.includes(role)) return fail(403, "This is not your role");
  if (!dealHand(game, game.turn, info.team, role).includes(card)) return fail(400, "This card is not in your hand");
  const pick = { card, by: player.name, at: t };
  if (CARD[card].role === "culture") {
    if (!cultureTargets(game, info.team, card).includes(target)) return fail(400, "Pick an eligible target country");
    pick.target = target;
  }
  await setJSON(st, K.pick(game.gameId, game.turn, info.team, role), pick);
  return json({ ok: true, role, pick });
};

export const config = { path: "/api/pick" };
