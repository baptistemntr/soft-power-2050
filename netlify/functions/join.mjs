// POST /api/join  { pid, name, team: "usa" | ... | "auto" }
import { store, now, json, fail, readBody, loadGame, loadPlayers, getJSON, setJSON, K, PID_RE, cleanName } from "../lib/store.mjs";
import { TEAM_IDS } from "../lib/data.mjs";
import { leastPopulated } from "../lib/engine.mjs";
import { teamMembers, placeLatePlayer } from "../lib/view.mjs";

export default async (req) => {
  if (req.method !== "POST") return fail(405, "POST only");
  const body = await readBody(req);
  if (!body) return fail(400, "Bad request");
  const { pid } = body;
  if (typeof pid !== "string" || !PID_RE.test(pid)) return fail(400, "Bad player id");
  const name = cleanName(body.name);
  if (!name) return fail(400, "Nickname: 2 to 16 characters");
  const st = store();
  const game = await loadGame(st);
  if (!game) return fail(409, "The host has not opened the game yet");
  const t = now();
  const key = K.player(game.gameId, pid);
  const existing = await getJSON(st, key);
  const players = await loadPlayers(st, game, { fresh: true });

  let record;
  if (game.phase === "lobby") {
    let team = body.team;
    if (!TEAM_IDS.includes(team)) {
      const members = teamMembers(game, players.filter((p) => p.pid !== pid));
      team = leastPopulated(Object.fromEntries(TEAM_IDS.map((x) => [x, members[x].length])));
    }
    record = { pid, gameId: game.gameId, name, team, joinedAt: existing ? existing.joinedAt : t, late: false };
  } else {
    if (existing) return json({ ok: true, player: existing });
    const place = placeLatePlayer(game, players);
    record = { pid, gameId: game.gameId, name, team: place.team, roles: place.roles, joinedAt: t, late: true };
  }
  await setJSON(st, key, record);
  return json({ ok: true, player: record });
};

export const config = { path: "/api/join" };
