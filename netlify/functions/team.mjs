// POST /api/team  { pid, action, ... }
//   action "president": { veto: role|null, power: bool, targets: [] }   (phase validate)
//   action "strike":    { target: "eco" | "ecolo" | null }             (phase validate, voice)
//   action "offer":     { to, type }                                   (phase decide, diplomat)
//   action "reply":     { from, accept }                               (decide or validate, diplomat)
import { store, now, json, fail, readBody, loadGame, getJSON, setJSON, del, listKeys, K, PID_RE } from "../lib/store.mjs";
import { TEAM_IDS, CARD_ROLES, DIPLO_TYPES, TEAMS } from "../lib/data.mjs";
import { effectivePhase, powerTargets } from "../lib/engine.mjs";
import { playerRoles } from "../lib/view.mjs";

export default async (req) => {
  if (req.method !== "POST") return fail(405, "POST only");
  const body = await readBody(req);
  if (!body || typeof body.pid !== "string" || !PID_RE.test(body.pid)) return fail(400, "Bad request");
  const st = store();
  const game = await loadGame(st);
  if (!game) return fail(409, "No game");
  const t = now();
  const eff = effectivePhase(game, t);
  const player = await getJSON(st, K.player(game.gameId, body.pid));
  const info = playerRoles(game, player);
  if (!info) return fail(403, "Unknown player");
  const { team, roles } = info;
  const gid = game.gameId, turn = game.turn;
  const validateOpen = eff.phase === "validate" && !eff.locked;

  switch (body.action) {
    case "president": {
      if (!roles.includes("president")) return fail(403, "Only the president can do this");
      if (!validateOpen) return fail(409, "Validation is closed");
      const veto = body.veto == null ? null : body.veto;
      if (veto !== null && !CARD_ROLES.includes(veto)) return fail(400, "Bad veto");
      let power = !!body.power;
      let targets = [];
      if (power) {
        if (game.teams[team].powerUsed) return fail(409, "Super-power already used");
        const p = TEAMS.find((x) => x.id === team).power;
        if (p.targets > 0) {
          const ok = powerTargets(game, team);
          targets = [...new Set(Array.isArray(body.targets) ? body.targets : [])].filter((c) => ok.includes(c)).slice(0, p.targets);
          if (!targets.length) return fail(400, "Pick a target for your super-power");
        }
      }
      const action = { veto, power, targets, by: player.name, at: t };
      await setJSON(st, K.teamAction(gid, turn, team, "president"), action);
      return json({ ok: true, president: action });
    }
    case "strike": {
      if (!roles.includes("voice")) return fail(403, "Only the Voice of the people can strike");
      if (!validateOpen) return fail(409, "Validation is closed");
      const target = body.target == null ? null : body.target;
      if (target !== null && target !== "eco" && target !== "ecolo") return fail(400, "Strike eco or ecolo");
      if (target && game.teams[team].strikeUsed) return fail(409, "Strike already used");
      const action = { strike: target, by: player.name, at: t };
      await setJSON(st, K.teamAction(gid, turn, team, "voice"), action);
      return json({ ok: true, voice: action });
    }
    case "offer": {
      if (!roles.includes("diplomat")) return fail(403, "Only the diplomat can send offers");
      if (eff.phase !== "decide") return fail(409, "Offers are sent during the decision phase");
      const { to, type } = body;
      if (!TEAM_IDS.includes(to) || to === team) return fail(400, "Pick another team");
      if (!DIPLO_TYPES[type]) return fail(400, "Bad offer type");
      // one offer per team per turn: remove my other offers of this turn
      const mine = (await listKeys(st, K.offersPrefix(gid, turn))).filter((k) => {
        const pair = k.split("/")[3] || "";
        return pair.startsWith(`${team}-`) && !k.endsWith("/reply") && pair !== `${team}-${to}`;
      });
      await Promise.all(mine.map((k) => del(st, k)));
      const offer = { type, by: player.name, at: t };
      await setJSON(st, K.offer(gid, turn, team, to), offer);
      return json({ ok: true, offer: { ...offer, from: team, to } });
    }
    case "reply": {
      if (!roles.includes("diplomat")) return fail(403, "Only the diplomat can answer offers");
      if (!(eff.phase === "decide" || validateOpen)) return fail(409, "Too late to answer");
      const { from } = body;
      if (!TEAM_IDS.includes(from) || from === team) return fail(400, "Bad offer");
      const offer = await getJSON(st, K.offer(gid, turn, from, team));
      if (!offer) return fail(404, "This offer no longer exists");
      const accept = !!body.accept;
      if (accept) {
        // at most one accepted offer of each type per turn
        const replyKeys = (await listKeys(st, K.offersPrefix(gid, turn)))
          .filter((k) => k.endsWith(`-${team}/reply`) && !k.includes(`/${from}-${team}/`));
        const others = await Promise.all(replyKeys.map((k) => getJSON(st, k)));
        if (others.some((r) => r && r.accept && r.type === offer.type)) return fail(409, `You already accepted a ${DIPLO_TYPES[offer.type].name.toLowerCase()} this turn`);
      }
      const reply = { accept, type: offer.type, by: player.name, at: t };
      await setJSON(st, K.reply(gid, turn, from, team), reply);
      return json({ ok: true, reply: { ...reply, from, to: team } });
    }
    default:
      return fail(400, "Unknown action");
  }
};

export const config = { path: "/api/team" };
