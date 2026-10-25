// POST /api/host  { key, action, ... } — every host action. The key is checked against env HOST_KEY.
// actions: check, start, next, close, reveal, end, reset, setTimer {seconds}, movePlayer {pid, team}, balance
import {
  store, now, json, fail, readBody, loadGame, loadPlayers, loadTurn, setJSON, K, checkHostKey, hostKeyConfigured, newGameId, PID_RE,
} from "../lib/store.mjs";
import { TEAM_IDS } from "../lib/data.mjs";
import { initGame, startGame, advance, closePhase, setTimer, resolveTurn, effectivePhase, balanceTeams } from "../lib/engine.mjs";
import { publicState, hostExtras, teamMembers, lobbyTeam } from "../lib/view.mjs";

async function reveal(st, game, t) {
  if (game.resolvedTurn === game.turn) return game; // idempotent
  const players = await loadPlayers(st, game.gameId, { fresh: true });
  const members = teamMembers(game, players);
  const g = { ...game, teams: { ...game.teams } };
  // a late player revived a bot team: it plays for real now
  for (const tm of TEAM_IDS) if (g.teams[tm].bot && members[tm].length) g.teams[tm] = { ...g.teams[tm], bot: false };
  const inputs = await loadTurn(st, game.gameId, game.turn, { fresh: true });
  const { game: out } = resolveTurn(g, inputs);
  return out;
}

export default async (req) => {
  if (req.method !== "POST") return fail(405, "POST only");
  const body = await readBody(req);
  if (!body) return fail(400, "Bad request");
  if (!hostKeyConfigured()) return fail(500, "HOST_KEY is not configured on Netlify");
  if (!checkHostKey(body.key)) return fail(403, "Wrong host key");
  const st = store();
  const t = now();
  let game = await loadGame(st);
  const action = body.action;

  if (action === "reset" || !game) {
    const decideSeconds = game ? game.decideSeconds : 150;
    game = initGame({ gameId: newGameId(), now: t, decideSeconds });
    await setJSON(st, K.game, game);
    if (action === "reset" || action === "check") return respond(st, game, t);
  }

  const eff = effectivePhase(game, t);
  let next = null;
  switch (action) {
    case "check":
      break;
    case "start": {
      if (game.phase !== "lobby") return fail(409, "The game has already started");
      const players = await loadPlayers(st, game.gameId, { fresh: true });
      next = startGame(game, players.map((p) => ({ ...p, team: lobbyTeam(game, p) })), t);
      break;
    }
    case "next":
      if (eff.phase === "lobby") {
        const players = await loadPlayers(st, game.gameId, { fresh: true });
        next = startGame(game, players.map((p) => ({ ...p, team: lobbyTeam(game, p) })), t);
      } else if (eff.phase === "validate") next = await reveal(st, game, t);
      else if (eff.phase !== "end") next = advance(game, t);
      break;
    case "close":
      if (eff.phase === "decide" || eff.phase === "validate") next = closePhase(game, t);
      break;
    case "reveal":
      if (eff.phase === "decide" || eff.phase === "validate") next = await reveal(st, game, t);
      break;
    case "end":
      next = { ...game, phase: "end", phaseEndsAt: null };
      break;
    case "setTimer": {
      const s = Number(body.seconds);
      if (!Number.isFinite(s)) return fail(400, "Bad timer");
      next = setTimer(game, s, t);
      break;
    }
    case "movePlayer": {
      if (game.phase !== "lobby") return fail(409, "Players can only be moved in the lobby");
      if (typeof body.pid !== "string" || !PID_RE.test(body.pid) || !TEAM_IDS.includes(body.team)) return fail(400, "Bad move");
      next = { ...game, moves: { ...game.moves, [body.pid]: body.team } };
      break;
    }
    case "balance": {
      if (game.phase !== "lobby") return fail(409, "Teams can only be balanced in the lobby");
      const players = await loadPlayers(st, game.gameId, { fresh: true });
      next = { ...game, moves: balanceTeams(players) };
      break;
    }
    default:
      return fail(400, "Unknown action");
  }
  if (next && next !== game) {
    await setJSON(st, K.game, next);
    game = next;
  }
  return respond(st, game, t);
};

async function respond(st, game, t) {
  const players = await loadPlayers(st, game.gameId, { fresh: true });
  const eff = effectivePhase(game, t);
  const turn = eff.phase === "decide" || eff.phase === "validate" ? await loadTurn(st, game.gameId, game.turn, { fresh: true }) : null;
  const ctx = { players, turn };
  return json({ ok: true, state: { ...publicState(game, ctx, t), host: hostExtras(game, ctx) } });
}

export const config = { path: "/api/host" };
