// GET /api/state?pid=...  — public state + private part of the player.  GET /api/state?static=1 — game data.
import { store, now, json, fail, loadGame, loadPlayers, loadTurn, getJSON, K, PID_RE, checkHostKey } from "../lib/store.mjs";
import { publicState, privateState, staticData, hostExtras } from "../lib/view.mjs";
import { effectivePhase } from "../lib/engine.mjs";

export default async (req) => {
  if (req.method !== "GET") return fail(405, "GET only");
  const url = new URL(req.url);
  if (url.searchParams.get("static")) return json(staticData());
  const st = store();
  const t = now();
  const game = await loadGame(st);
  if (!game) return json({ serverNow: t, phase: "nogame" });

  let players = await loadPlayers(st, game.gameId);
  const pid = url.searchParams.get("pid");
  let player = null;
  if (pid && PID_RE.test(pid)) {
    player = players.find((p) => p.pid === pid) || null;
    if (!player) {
      // just joined: not in the cached list yet
      player = await getJSON(st, K.player(game.gameId, pid));
      if (player) players = [...players, player];
    }
  }
  const eff = effectivePhase(game, t);
  const turn = eff.phase === "decide" || eff.phase === "validate" ? await loadTurn(st, game.gameId, game.turn) : null;
  const ctx = { players, turn };
  const out = publicState(game, ctx, t);
  if (pid) out.private = player ? privateState(game, ctx, player, t) : null;
  const hk = req.headers.get("x-host-key");
  if (hk && checkHostKey(hk)) out.host = hostExtras(game, ctx);
  return json(out);
};

export const config = { path: "/api/state" };
