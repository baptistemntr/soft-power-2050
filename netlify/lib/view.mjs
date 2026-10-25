// Builds what clients see: public state (everyone) + private part (one player).
// Never leaks other teams' hands or choices before the reveal.
import {
  TEAMS, TEAM_IDS, COUNTRIES, NEIGHBORS, SEA_ROUTES, NEEDS, GAUGES, GAUGE_INFO, ROLES, CARD_ROLES,
  CARDS, EVENTS, EVENT, YEARS, TURNS, TEXT, DIPLO_TYPES, FREE_COUNTRIES, LANGS, DEFAULT_LANG, CONTENT_FR, ERRORS_FR,
} from "./data.mjs";
import {
  C, attract, effectivePhase, dealHand, eligible, cultureTargets, powerTargets, finalScores, awards,
  leastPopulated, lateJoinRoles, botAcceptsOffer,
} from "./engine.mjs";

export function staticData() {
  return {
    teams: TEAMS, countries: COUNTRIES, neighbors: NEIGHBORS, seaRoutes: SEA_ROUTES, needs: NEEDS,
    gauges: GAUGES, gaugeInfo: GAUGE_INFO, roles: ROLES, cardRoles: CARD_ROLES, cards: CARDS,
    events: EVENTS, years: YEARS, turns: TURNS, text: TEXT, diplo: DIPLO_TYPES,
    langs: LANGS, defaultLang: DEFAULT_LANG, fr: CONTENT_FR, errorsFr: ERRORS_FR,
    thresholds: { warn: C.PLANET_WARN, lose: C.PLANET_LOSE, instant: C.PLANET_INSTANT, strong: C.STRONG_AT, warming: C.WARMING },
  };
}

// Effective team of a lobby player (host moves win).
export const lobbyTeam = (game, p) => (game.moves && game.moves[p.pid]) || p.team;

// Members of every team: roster (frozen at start) + late joiners, or lobby players.
export function teamMembers(game, players) {
  const out = Object.fromEntries(TEAM_IDS.map((t) => [t, []]));
  if (game.phase === "lobby") {
    for (const p of players.slice().sort((a, b) => a.joinedAt - b.joinedAt)) {
      const t = lobbyTeam(game, p);
      if (out[t]) out[t].push({ pid: p.pid, name: p.name, roles: [], late: false, joinedAt: p.joinedAt });
    }
    return out;
  }
  for (const [pid, r] of Object.entries(game.roster || {})) out[r.team].push({ pid, name: r.name, roles: r.roles, late: false, joinedAt: r.joinedAt });
  for (const p of players) {
    if (game.roster && game.roster[p.pid]) continue;
    if (p.late && p.gameId === game.gameId && out[p.team]) out[p.team].push({ pid: p.pid, name: p.name, roles: p.roles || [], late: true, joinedAt: p.joinedAt });
  }
  for (const t of TEAM_IDS) out[t].sort((a, b) => a.joinedAt - b.joinedAt);
  return out;
}

export function isBot(game, members, t) {
  return game.phase !== "lobby" && !!game.teams[t].bot && members[t].length === 0;
}

// Placement of a player who joins after the lobby (§5 "Retardataires").
export function placeLatePlayer(game, players) {
  const members = teamMembers(game, players);
  const counts = Object.fromEntries(TEAM_IDS.map((t) => [t, members[t].length]));
  const team = leastPopulated(counts);
  const lateBefore = members[team].filter((m) => m.late).length;
  return { team, roles: lateJoinRoles(members[team].length, lateBefore) };
}

// Roles of a player in the current game (roster or late record).
export function playerRoles(game, player) {
  if (!player) return null;
  const r = game.roster && game.roster[player.pid];
  if (r) return { team: r.team, roles: r.roles };
  if (game.phase === "lobby") return { team: lobbyTeam(game, player), roles: [] };
  if (player.late) return { team: player.team, roles: player.roles || [] };
  return null;
}

const r1 = (x) => Math.round(x * 10) / 10;

export function publicState(game, ctx, now) {
  const eff = effectivePhase(game, now);
  const members = teamMembers(game, ctx.players || []);
  const turnData = ctx.turn || { picks: {}, president: {}, voice: {}, offers: [], replies: {} };
  const teams = {};
  for (const t of TEAM_IDS) {
    const tm = game.teams[t];
    const done = [];
    if (eff.phase === "decide" || eff.phase === "validate") {
      for (const role of CARD_ROLES) if (turnData.picks[t] && turnData.picks[t][role]) done.push(role);
      if (turnData.offers.some((o) => o.from === t)) done.push("diplomat");
    }
    teams[t] = {
      gauges: tm.gauges, attract: attract(tm.gauges), rejection: tm.rejection,
      powerUsed: tm.powerUsed, strikeUsed: tm.strikeUsed,
      bot: isBot(game, members, t),
      players: members[t].map((m) => m.name),
      zone: FREE_COUNTRIES.filter((c) => game.owners[c] === t).length,
      rolesDone: done,
      presidentDone: !!turnData.president[t],
    };
  }
  const influence = {};
  for (const c of FREE_COUNTRIES) influence[c] = Object.fromEntries(TEAM_IDS.map((t) => [t, r1(game.influence[c][t])]));
  const showReveal = eff.phase === "reveal" || eff.phase === "end";
  const hist = game.history[game.turn];
  const out = {
    serverNow: now,
    gameId: game.gameId,
    phase: eff.phase,
    locked: eff.locked,
    phaseEndsAt: eff.phaseEndsAt,
    turn: game.turn,
    year: game.turn > 0 ? YEARS[game.turn - 1] : YEARS[0],
    turns: TURNS,
    decideSeconds: game.decideSeconds,
    event: game.turn > 0 ? EVENT[game.events[game.turn - 1]] : null,
    teams, owners: game.owners, influence,
    globalPlanet: game.globalPlanet, planetAlert: game.planetAlert, gameOver: game.gameOver,
    totalPlayers: TEAM_IDS.reduce((s, t) => s + members[t].length, 0),
    headlines: showReveal ? game.headlines : [],
    changes: showReveal ? game.changes : [],
    resolvedTurn: game.resolvedTurn,
    reveal: showReveal && hist ? {
      deltas: hist.deltas, played: hist.played, targets: hist.targets, vetoes: hist.vetoes, strikes: hist.strikes,
      pacts: hist.pacts, powers: hist.powers, backlash: hist.backlash, event: hist.event,
    } : null,
    planetHistory: Object.values(game.history).map((h) => h.globalPlanet),
  };
  if (eff.phase === "end") out.end = { scores: finalScores(game), awards: awards(game) };
  return out;
}

export function privateState(game, ctx, player, now) {
  const info = playerRoles(game, player);
  if (!info) return null;
  const eff = effectivePhase(game, now);
  const { team, roles } = info;
  const members = teamMembers(game, ctx.players || []);
  const me = {
    pid: player.pid, name: player.name, team, roles, late: !!player.late,
    teammates: members[team].map((m) => ({ name: m.name, roles: m.roles, me: m.pid === player.pid })),
  };
  const out = { me };
  const turn = game.turn;
  const td = ctx.turn || { picks: {}, president: {}, voice: {}, offers: [], replies: {} };
  if ((eff.phase === "decide" || eff.phase === "validate") && turn > 0) {
    out.hands = {};
    out.targets = {};
    for (const role of roles) {
      if (!CARD_ROLES.includes(role)) continue;
      out.hands[role] = dealHand(game, turn, team, role);
      if (role === "culture") for (const id of out.hands[role]) out.targets[id] = cultureTargets(game, team, id, turn);
    }
    // own team only
    out.teamPicks = td.picks[team] || {};
    out.president = td.president[team] || null;
    out.voice = td.voice[team] || null;
    out.eligible = eligible(team, game.owners);
    if (roles.includes("president")) out.powerTargets = powerTargets(game, team);
    if (roles.includes("diplomat")) {
      const sent = td.offers.filter((o) => o.from === team).sort((a, b) => (b.at || 0) - (a.at || 0))[0] || null;
      const status = (o) => {
        if (game.teams[o.to].bot && isBot(game, members, o.to)) return botAcceptsOffer(game, o.to, o.type) ? "accepted" : "refused";
        const r = td.replies[`${o.from}-${o.to}`];
        if (!r || r.type !== o.type) return "pending";
        return r.accept ? "accepted" : "refused";
      };
      out.diplomacy = {
        sent: sent ? { to: sent.to, type: sent.type, status: status(sent) } : null,
        received: td.offers.filter((o) => o.to === team).map((o) => ({ from: o.from, type: o.type, status: status(o) })),
      };
    }
  }
  return out;
}

// Host-only extras (player list with pids, for moves in the lobby).
export function hostExtras(game, ctx) {
  const members = teamMembers(game, ctx.players || []);
  return {
    players: TEAM_IDS.flatMap((t) => members[t].map((m) => ({ pid: m.pid, name: m.name, team: t, roles: m.roles, late: m.late }))),
  };
}
