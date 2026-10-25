// SOFT POWER 2050 — rules engine. PURE FUNCTIONS ONLY: no I/O, no Date.now(), no Math.random().
import {
  GAUGES, GAUGE_INFO, NEEDS, TEAMS, TEAM_IDS, COUNTRY, COUNTRIES, FREE_COUNTRIES, NEIGHBORS,
  ROLE_IDS, CARD_ROLES, CARD, DECKS, EVENTS, FIRST_EVENT, LAST_EVENT, YEARS, TURNS, TEXT, DIPLO_TYPES,
} from "./data.mjs";
import { rng, shuffle } from "./rng.mjs";

// ---------------------------------------------------------------------------
// Balancing constants (tuned with scripts/simulate.mjs — see README)
// ---------------------------------------------------------------------------
export const C = {
  OWNER_MIN: 4,          // minimum influence to be in someone's zone
  OWNER_GAP: 0.5,        // lead needed over the second team
  EROSION: 0.9,          // influence decay at the start of each resolution
  BACKLASH_AT: 5,        // rejection that triggers a cultural backlash
  REJ_PENALTY_AT: 3,     // rejection from which passive gains are reduced
  REJ_PENALTY: 0.7,      // passive gain multiplier when rejection >= REJ_PENALTY_AT
  PLANET_WARN: 20,       // alert banner below this global planet score (spec: 18)
  PLANET_LOSE: 17,       // game over at the end below this (spec: 15)
  PLANET_INSTANT: 5,     // immediate game over below this, any turn (spec: 10)
  PASSIVE_DIV: 5,        // passive = attract / PASSIVE_DIV
  MATCH_DIV: 5,          // match = gauge / MATCH_DIV
  STRONG_AT: 7,          // influence shown at full opacity on the map
  WARMING: 2,            // "business as usual": every team loses this much 🌍 each turn (added rule, see README)
};

export const COHOLD_ORDER = ["culture", "eco", "ecolo", "president", "voice", "diplomat"];
const TEAM = Object.fromEntries(TEAMS.map((t) => [t.id, t]));

export const round1 = (x) => Math.round(x * 10) / 10;
const round2 = (x) => Math.round(x * 100) / 100;
export const clamp = (v, lo = 0, hi = 10) => Math.max(lo, Math.min(hi, v));
const clone = (o) => JSON.parse(JSON.stringify(o));
// lower-case a card name for a sentence, keeping acronyms (UN, AI, UNESCO)
export const lowerName = (s) => s.split(" ").map((w) => (/[A-Z].*[A-Z]/.test(w) ? w : w.toLowerCase())).join(" ");
const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));

export function attract(g) {
  return round1((g.eco + g.planet + g.happy + g.cohesion) / 4);
}

export function globalPlanet(game) {
  return TEAM_IDS.reduce((s, t) => s + game.teams[t].gauges.planet, 0);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
export function pickEvents(gameId) {
  const pool = EVENTS.map((e) => e.id).filter((id) => id !== FIRST_EVENT && id !== LAST_EVENT);
  const middle = shuffle(pool, rng(`${gameId}:events`)).slice(0, TURNS - 2);
  return [FIRST_EVENT, ...middle, LAST_EVENT];
}

export function initGame({ gameId, now = 0, decideSeconds = 150 }) {
  const teams = {};
  for (const t of TEAMS) {
    teams[t.id] = {
      gauges: { ...t.gauges }, rejection: 0, powerUsed: false, strikeUsed: false,
      bot: false, botStyle: "prudent",
      played: Object.fromEntries(CARD_ROLES.map((r) => [r, []])),
    };
  }
  const influence = {}, owners = {};
  for (const c of FREE_COUNTRIES) {
    influence[c] = Object.fromEntries(TEAM_IDS.map((t) => [t, 0]));
    owners[c] = null;
  }
  return {
    v: 1, gameId, createdAt: now,
    phase: "lobby", turn: 0, phaseEndsAt: null,
    decideSeconds, validateSeconds: 30, eventSeconds: 30,
    events: pickEvents(gameId),
    teams, influence, owners,
    roster: {},          // pid -> { name, team, roles, joinedAt } (frozen at start)
    moves: {},           // pid -> team (host moves in lobby)
    resolvedTurn: 0, history: {}, headlines: [], changes: [],
    globalPlanet: TEAM_IDS.reduce((s, t) => s + teams[t].gauges.planet, 0),
    planetAlert: false, gameOver: false,
    stats: {
      deals: Object.fromEntries(TEAM_IDS.map((t) => [t, 0])),
      backlashes: Object.fromEntries(TEAM_IDS.map((t) => [t, 0])),
      rejGained: Object.fromEntries(TEAM_IDS.map((t) => [t, 0])),
      cardInfluence: {}, // "team:cardId" -> influence contributed
    },
  };
}

// ---------------------------------------------------------------------------
// Roles (§5)
// ---------------------------------------------------------------------------
const ROLE_TABLE = {
  1: [ROLE_IDS.slice()],
  2: [["president", "culture", "diplomat"], ["eco", "ecolo", "voice"]],
  3: [["president", "diplomat"], ["eco", "voice"], ["ecolo", "culture"]],
  4: [["president", "diplomat"], ["eco"], ["ecolo", "voice"], ["culture"]],
  5: [["president", "diplomat"], ["eco"], ["ecolo"], ["culture"], ["voice"]],
};

// Returns, for a team of n players (sorted by join time), the list of roles of each player.
export function assignRoles(n) {
  if (n <= 0) return [];
  if (ROLE_TABLE[n]) return ROLE_TABLE[n].map((r) => r.slice());
  const out = ROLE_IDS.map((r) => [r]);
  for (let i = 6; i < n; i++) out.push([COHOLD_ORDER[(i - 6) % COHOLD_ORDER.length]]);
  return out;
}

// Roles of a player who joins after the lobby. `humans` = players already in that team,
// `lateBefore` = late joiners already placed in that team. Roles already given are never changed.
export function lateJoinRoles(humans, lateBefore) {
  if (humans === 0) return ROLE_IDS.slice();
  return [COHOLD_ORDER[lateBefore % COHOLD_ORDER.length]];
}

// Team with the fewest players (ties -> map order).
export function leastPopulated(counts) {
  let best = TEAM_IDS[0];
  for (const t of TEAM_IDS) if ((counts[t] || 0) < (counts[best] || 0)) best = t;
  return best;
}

export function balanceTeams(players) {
  // players: [{pid, joinedAt}] -> { pid: team } round-robin by join time
  const sorted = players.slice().sort((a, b) => a.joinedAt - b.joinedAt || (a.pid < b.pid ? -1 : 1));
  return Object.fromEntries(sorted.map((p, i) => [p.pid, TEAM_IDS[i % TEAM_IDS.length]]));
}

// Lobby -> roles. players: [{ pid, name, team, joinedAt }] (team already resolved, moves applied).
export function startGame(game, players, now) {
  const g = clone(game);
  g.roster = {};
  for (const t of TEAM_IDS) {
    const members = players.filter((p) => p.team === t)
      .sort((a, b) => a.joinedAt - b.joinedAt || (a.pid < b.pid ? -1 : 1));
    const roles = assignRoles(members.length);
    members.forEach((p, i) => { g.roster[p.pid] = { name: p.name, team: t, roles: roles[i], joinedAt: p.joinedAt }; });
    g.teams[t].bot = members.length === 0;
  }
  g.phase = "roles";
  g.turn = 0;
  g.phaseEndsAt = now + 30000;
  return g;
}

// ---------------------------------------------------------------------------
// Phases (§3)
// ---------------------------------------------------------------------------
export function effectivePhase(game, now) {
  if (game.phase === "decide" && game.phaseEndsAt && now >= game.phaseEndsAt) {
    const endsAt = game.phaseEndsAt + game.validateSeconds * 1000;
    return { phase: "validate", phaseEndsAt: endsAt, locked: now >= endsAt };
  }
  if (game.phase === "validate") {
    return { phase: "validate", phaseEndsAt: game.phaseEndsAt, locked: !!game.phaseEndsAt && now >= game.phaseEndsAt };
  }
  return { phase: game.phase, phaseEndsAt: game.phaseEndsAt, locked: false };
}

// Host "Next" for every phase except validate (which requires the turn inputs -> resolveTurn).
export function advance(game, now) {
  const g = clone(game);
  const eff = effectivePhase(g, now);
  switch (eff.phase) {
    case "roles":
      g.phase = "event"; g.turn = 1; g.phaseEndsAt = now + g.eventSeconds * 1000; break;
    case "event":
      g.phase = "decide"; g.phaseEndsAt = now + g.decideSeconds * 1000; g.decideEndedAt = null; break;
    case "decide":
      return closePhase(g, now);
    case "reveal":
      if (g.turn >= TURNS || g.gameOver) { g.phase = "end"; g.phaseEndsAt = null; }
      else { g.phase = "event"; g.turn += 1; g.phaseEndsAt = now + g.eventSeconds * 1000; }
      break;
    default:
      break;
  }
  return g;
}

// Is the decide phase still accepting picks/offers? A short grace period absorbs requests
// sent just before the deadline but processed just after (busy wifi, cold functions).
export const DECIDE_GRACE_MS = 2500;
export function decideOpen(game, now) {
  if (game.phase === "decide") return !game.phaseEndsAt || now < game.phaseEndsAt + DECIDE_GRACE_MS;
  if (game.phase === "validate" && game.decideEndedAt) return now < game.decideEndedAt + DECIDE_GRACE_MS;
  return false;
}

// Host "Close now".
export function closePhase(game, now) {
  const g = clone(game);
  const eff = effectivePhase(g, now);
  if (eff.phase === "decide") { g.phase = "validate"; g.decideEndedAt = Math.min(now, g.phaseEndsAt || now); g.phaseEndsAt = now + g.validateSeconds * 1000; }
  else if (eff.phase === "validate") { g.phase = "validate"; g.phaseEndsAt = Math.min(eff.phaseEndsAt || now, now); }
  return g;
}

export function setTimer(game, seconds, now) {
  const g = clone(game);
  const s = clamp(Math.round(seconds), 60, 240);
  const diff = (s - g.decideSeconds) * 1000;
  g.decideSeconds = s;
  // If we are in decide, shift the running timer too (but never below 5 s from now).
  if (g.phase === "decide" && g.phaseEndsAt && g.phaseEndsAt > now) g.phaseEndsAt = Math.max(now + 5000, g.phaseEndsAt + diff);
  return g;
}

// ---------------------------------------------------------------------------
// Cards (§10)
// ---------------------------------------------------------------------------
export function dealHand(game, turn, team, role) {
  if (!CARD_ROLES.includes(role)) return [];
  const used = new Set((game.teams[team].played[role] || []).filter((p) => p.turn < turn).map((p) => p.id));
  let deck = DECKS[role].filter((id) => !used.has(id));
  if (deck.length < 3) deck = DECKS[role].slice();
  return shuffle(deck, rng(`${game.gameId}:${turn}:${team}:${role}`)).slice(0, 3);
}

// ---------------------------------------------------------------------------
// Map (§6, §7)
// ---------------------------------------------------------------------------
export function eligible(team, owners) {
  const out = new Set();
  const anchors = [team, ...FREE_COUNTRIES.filter((c) => owners[c] === team)];
  for (const a of anchors) for (const n of NEIGHBORS[a]) if (!TEAM_IDS.includes(n)) out.add(n);
  for (const c of FREE_COUNTRIES) if (owners[c] === team) out.add(c);
  return FREE_COUNTRIES.filter((c) => out.has(c));
}

export function cultureTargets(game, team, cardId, turn = game.turn) {
  const card = CARD[cardId];
  if (!card || card.role !== "culture") return [];
  const ev = game.events[turn - 1];
  if (card.global && ev !== "ev_tiktok") return FREE_COUNTRIES.slice();
  return eligible(team, game.owners);
}

export function powerTargets(game, team) {
  const p = TEAM[team].power;
  if (p.scope === "any") return FREE_COUNTRIES.slice();
  if (p.scope === "eligible") return eligible(team, game.owners);
  return [];
}

export function computeOwners(influence, prevOwners) {
  const owners = {};
  for (const c of FREE_COUNTRIES) {
    const scores = TEAM_IDS.map((t) => [t, influence[c][t] || 0]).sort((a, b) => b[1] - a[1]);
    const [best, bestScore] = scores[0];
    const secondScore = scores[1][1];
    const prev = prevOwners[c];
    if (bestScore >= C.OWNER_MIN && bestScore > secondScore + C.OWNER_GAP) owners[c] = best;
    else if (prev && (influence[c][prev] || 0) >= C.OWNER_MIN) owners[c] = prev;
    else owners[c] = null;
  }
  return owners;
}

export function eventMultiplier(eventId, need) {
  const table = {
    ev_tangping: { burnout: 1.5 },
    ev_oil: { energie: 1.5 },
    ev_olympics: { fete: 1.5 },
    ev_burnout: { burnout: 2 },
    ev_floods: { climat: 2 },
  };
  return (table[eventId] && table[eventId][need]) || 1;
}

// Gauge deltas of the event for one team. `pre` = gauges before cards, `played` = card ids played.
export function eventGaugeDeltas(eventId, pre, played) {
  const d = { eco: 0, planet: 0, happy: 0, cohesion: 0 };
  const cards = played.map((id) => CARD[id]).filter(Boolean);
  const hasTag = (...tags) => cards.some((c) => c.tags.some((t) => tags.includes(t)));
  const hasId = (...ids) => played.some((id) => ids.includes(id));
  switch (eventId) {
    case "ev_chatgpt":
      d.eco += 1; d.happy -= 1;
      if (hasTag("tech") || hasId("eco_aitraining")) d.happy += 1; else d.cohesion -= 1;
      break;
    case "ev_heatwave":
      d.planet -= 1;
      if (pre.planet < 6) d.happy -= 1;
      if (hasTag("climat")) d.happy += 1;
      break;
    case "ev_tangping":
      if (pre.happy < 6) d.eco -= 1;
      if (hasTag("burnout")) d.happy += 1;
      break;
    case "ev_oil":
      if (pre.planet <= 3) d.eco -= 2;
      if (hasTag("energie")) d.eco += 1;
      break;
    case "ev_burnout":
      d.happy -= 1;
      if (hasId("eco_4day", "voi_4day", "eco_remote")) d.happy += 2;
      break;
    case "ev_crash":
      d.eco -= pre.cohesion >= 6 ? 1 : 2;
      break;
    case "ev_quit":
      d.cohesion -= 1;
      if (hasTag("egalite", "burnout")) d.cohesion += 1;
      break;
    case "ev_floods":
      d.planet -= 1;
      break;
    case "ev_robotstrike":
      if (hasId("eco_robots", "eco_uber")) d.cohesion -= 2;
      if (hasTag("egalite")) d.cohesion += 1;
      break;
    default:
      break;
  }
  return d;
}

export function cultureInfluence(cardId, targetId, eventId, artDeVivre = false) {
  const card = CARD[cardId];
  if (!card || !targetId) return 0;
  const need = COUNTRY[targetId] && COUNTRY[targetId].need;
  let v = card.influence;
  if (eventId === "ev_tiktok" && cardId === "cul_influencers") v = 1;
  if (card.special === "fete_plus1" && need === "fete") v += 1;
  if (card.special === "fete_x2" && need === "fete") v *= 2;
  if (eventId === "ev_olympics") v *= 2;
  if (artDeVivre) v *= 2;
  return v;
}

// ---------------------------------------------------------------------------
// Bots (§15)
// ---------------------------------------------------------------------------
function gaugeFx(card) {
  if (card.special === "climate_summit") return { eco: -1, planet: 1, happy: 0, cohesion: 0 };
  return card.fx;
}

function targetGap(game, team, c) {
  const inf = game.influence[c];
  const mine = inf[team] || 0;
  const leader = Math.max(...TEAM_IDS.filter((t) => t !== team).map((t) => inf[t] || 0));
  return { gap: Math.max(0, leader - mine), mine };
}

// Best targets: not already in my zone, smallest gap to the leader, then highest own score.
export function bestTargets(game, team, candidates, count = 1) {
  const notMine = candidates.filter((c) => game.owners[c] !== team);
  const pool = notMine.length ? notMine : candidates;
  return pool
    .map((c) => ({ c, ...targetGap(game, team, c) }))
    .sort((a, b) => a.gap - b.gap || b.mine - a.mine || (a.c < b.c ? -1 : 1))
    .slice(0, count)
    .map((x) => x.c);
}

export function botChoices(game, team, style = "prudent", turn = game.turn) {
  const tm = game.teams[team];
  const g = tm.gauges;
  const picks = {};
  const owned = FREE_COUNTRIES.filter((c) => game.owners[c] === team).length;
  for (const role of CARD_ROLES) {
    const hand = dealHand(game, turn, team, role);
    if (!hand.length) continue;
    const scored = hand.map((id) => {
      const card = CARD[id];
      const fx = gaugeFx(card);
      const after = Object.fromEntries(GAUGES.map((k) => [k, clamp(g[k] + fx[k])]));
      const dAttract = (GAUGES.reduce((s, k) => s + after[k] - g[k], 0)) / 4;
      const dPlanet = after.planet - g.planet;
      const dEco = after.eco - g.eco;
      let score;
      if (style === "aggressive") {
        score = dEco + card.influence + (card.special === "un_speech" ? owned * 0.3 : 0) + dAttract * 0.01;
        if (card.rejection > 0 && tm.rejection > 2) score -= 100;
      } else {
        score = dAttract + 0.5 * dPlanet + card.influence * 0.05 + (card.special === "un_speech" ? owned * 0.25 : 0);
        if (card.rejection > 0) score -= 100;
      }
      return { id, score };
    }).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
    const id = scored[0].id;
    const pick = { card: id };
    if (role === "culture") {
      const cands = cultureTargets(game, team, id, turn);
      const [target] = bestTargets(game, team, cands, 1);
      if (target) pick.target = target;
    }
    picks[role] = pick;
  }
  const president = { veto: null, power: false, targets: [] };
  const powerTurn = style === "aggressive" ? 2 : 4;
  if (!tm.powerUsed && turn === powerTurn) {
    const p = TEAM[team].power;
    president.power = true;
    if (p.targets > 0) president.targets = bestTargets(game, team, powerTargets(game, team), p.targets);
  }
  return { picks, president, voice: { strike: null } };
}

export function botAcceptsOffer(game, team, type) {
  if (type === "trade" || type === "culture") return true;
  if (type === "climate") return game.teams[team].gauges.planet <= 5;
  return false;
}

// ---------------------------------------------------------------------------
// Turn resolution (§8)
// ---------------------------------------------------------------------------
const teamLabel = (t) => ({ tflag: TEAM[t].flag, team: TEAM[t].name, adj: TEAM[t].adj });

// Decide which offers are accepted. Returns [{ from, to, type }].
export function acceptedOffers(game, offers = [], replies = {}) {
  // one offer per sender: keep the latest
  const latest = {};
  for (const o of offers) {
    if (!o || !TEAM_IDS.includes(o.from) || !TEAM_IDS.includes(o.to) || o.from === o.to || !DIPLO_TYPES[o.type]) continue;
    if (!latest[o.from] || (o.at || 0) >= (latest[o.from].at || 0)) latest[o.from] = o;
  }
  const candidates = [];
  for (const o of Object.values(latest)) {
    const r = replies[`${o.from}-${o.to}`];
    let ok;
    let at = o.at || 0;
    if (game.teams[o.to].bot) ok = botAcceptsOffer(game, o.to, o.type);
    else { ok = !!(r && r.accept && r.type === o.type); if (r) at = r.at || at; }
    if (ok) candidates.push({ from: o.from, to: o.to, type: o.type, at });
  }
  candidates.sort((a, b) => a.at - b.at || (a.from < b.from ? -1 : 1));
  const seen = new Set();
  const out = [];
  for (const c of candidates) {
    const k = `${c.to}:${c.type}`;
    if (seen.has(k)) continue; // a team accepts at most one offer of each type per turn
    seen.add(k);
    out.push({ from: c.from, to: c.to, type: c.type });
  }
  return out;
}

export function resolveTurn(game, inputs = {}) {
  const turn = game.turn;
  if (game.resolvedTurn === turn) return { game, resolved: false };
  const g = clone(game);
  const ev = g.events[turn - 1];
  const year = YEARS[turn - 1];
  const startOwners = { ...g.owners };
  const startGauges = Object.fromEntries(TEAM_IDS.map((t) => [t, { ...g.teams[t].gauges }]));
  const startRej = Object.fromEntries(TEAM_IDS.map((t) => [t, g.teams[t].rejection]));
  const elig = Object.fromEntries(TEAM_IDS.map((t) => [t, eligible(t, startOwners)]));
  const H = []; // headlines: { text, teams, prio }
  const add = (prio, text, teams = []) => H.push({ prio, text, teams });

  // 2-3. Gather choices (bots generate theirs)
  const choice = {};
  for (const t of TEAM_IDS) {
    if (g.teams[t].bot) choice[t] = botChoices(g, t, g.teams[t].botStyle || "prudent", turn);
    else choice[t] = {
      picks: (inputs.picks && inputs.picks[t]) || {},
      president: (inputs.president && inputs.president[t]) || {},
      voice: (inputs.voice && inputs.voice[t]) || {},
    };
  }

  // Validate picks against hands and targets
  const played = {};   // t -> role -> cardId
  const targets = {};  // t -> culture target
  const missing = {};  // t -> [roles]
  for (const t of TEAM_IDS) {
    played[t] = {}; missing[t] = [];
    for (const role of CARD_ROLES) {
      const p = choice[t].picks[role];
      const hand = dealHand(g, turn, t, role);
      if (p && hand.includes(p.card)) {
        played[t][role] = p.card;
        if (role === "culture") {
          const ok = cultureTargets(g, t, p.card, turn);
          if (p.target && ok.includes(p.target)) targets[t] = p.target;
        }
      } else missing[t].push(role);
    }
  }

  // 4. Strike, then veto
  const strikes = {}, vetoes = {};
  for (const t of TEAM_IDS) {
    const s = choice[t].voice && choice[t].voice.strike;
    if ((s === "eco" || s === "ecolo") && !g.teams[t].strikeUsed) {
      g.teams[t].strikeUsed = true;
      strikes[t] = s;
      const cancelled = played[t][s];
      delete played[t][s];
      const name = cancelled ? lowerName(CARD[cancelled].name) : (s === "eco" ? "economy plan" : "ecology plan");
      add(9, fill(TEXT.headlines.strike, { ...teamLabel(t), card: name }), [t]);
    }
    const v = choice[t].president && choice[t].president.veto;
    if (v && CARD_ROLES.includes(v) && played[t][v]) {
      vetoes[t] = v;
      add(9, fill(TEXT.headlines.veto, { ...teamLabel(t), card: CARD[played[t][v]].name }), [t]);
      delete played[t][v];
      if (v === "culture") delete targets[t];
    }
  }
  const playedList = Object.fromEntries(TEAM_IDS.map((t) => [t, CARD_ROLES.map((r) => played[t][r]).filter(Boolean)]));

  // 5. Erosion
  for (const c of FREE_COUNTRIES) for (const t of TEAM_IDS) g.influence[c][t] = round2(g.influence[c][t] * C.EROSION);

  // 6. Event gauge effects (conditions on start-of-turn gauges and played cards)
  for (const t of TEAM_IDS) {
    const d = eventGaugeDeltas(ev, startGauges[t], playedList[t]);
    d.planet -= C.WARMING;
    for (const k of GAUGES) g.teams[t].gauges[k] += d[k];
  }

  // 7. Card gauge effects (order president, eco, ecolo, culture, voice), then rejection
  for (const t of TEAM_IDS) {
    for (const role of CARD_ROLES) {
      const id = played[t][role];
      if (!id) continue;
      const card = CARD[id];
      for (const k of GAUGES) g.teams[t].gauges[k] += card.fx[k];
      if (card.special === "climate_summit") {
        for (const u of TEAM_IDS) g.teams[u].gauges.planet += 1;
        g.teams[t].gauges.eco -= 1;
        add(5, fill(TEXT.headlines.summitCard, teamLabel(t)), [t]);
      }
    }
    if (strikes[t]) { g.teams[t].gauges.cohesion += 1; g.teams[t].gauges.eco -= 1; }
  }
  for (const t of TEAM_IDS) {
    const cards = playedList[t].map((id) => CARD[id]);
    const added = cards.reduce((s, c) => s + c.rejection, 0);
    let r = g.teams[t].rejection + added;
    if (!cards.some((c) => c.rejection > 0)) r -= 1;
    g.teams[t].rejection = clamp(r);
    g.stats.rejGained[t] += cards.filter((c) => c.rejection > 0).reduce((s, c) => s + c.rejection, 0);
  }

  // 8. Diplomatic offers (gauge part)
  const pacts = acceptedOffers(g, inputs.offers || [], inputs.replies || {});
  const cultureExchanges = [];
  for (const p of pacts) {
    const pair = [p.from, p.to];
    if (p.type === "trade") for (const t of pair) g.teams[t].gauges.eco += 1;
    if (p.type === "climate") for (const t of pair) { g.teams[t].gauges.planet += 1; g.teams[t].gauges.eco -= 1; }
    if (p.type === "culture") {
      const both = elig[p.from].filter((c) => elig[p.to].includes(c));
      if (both.length) cultureExchanges.push({ pair, countries: both });
      else for (const t of pair) g.teams[t].gauges.happy += 1;
    }
    for (const t of pair) g.stats.deals[t] += 1;
    add(7, fill(TEXT.headlines.pact, {
      aflag: TEAM[p.from].flag, a: TEAM[p.from].name, bflag: TEAM[p.to].flag, b: TEAM[p.to].name,
      deal: DIPLO_TYPES[p.type].name.toLowerCase(),
    }), pair);
  }

  // 9. Super-powers (gauge / rejection part). Targets validated now.
  const powers = {};
  for (const t of TEAM_IDS) {
    const pr = choice[t].president || {};
    if (!pr.power || g.teams[t].powerUsed) continue;
    const p = TEAM[t].power;
    let tg = [];
    if (p.targets > 0) {
      const ok = p.scope === "any" ? FREE_COUNTRIES : elig[t];
      tg = [...new Set((pr.targets || []).filter((c) => ok.includes(c)))].slice(0, p.targets);
      if (!tg.length) continue; // invalid targets: power not consumed
    }
    g.teams[t].powerUsed = true;
    powers[t] = { id: p.id, targets: tg };
    if (p.id === "lagom") { g.teams[t].rejection = 0; g.teams[t].gauges.happy += 1; }
    if (p.id === "silkroads") { g.teams[t].rejection = clamp(g.teams[t].rejection + 1); g.stats.rejGained[t] += 1; }
    if (p.id === "carnaval") g.teams[t].gauges.happy += 1;
    add(8, fill(TEXT.headlines.power, { ...teamLabel(t), emoji: p.emoji, power: p.name }), [t]);
  }

  // 10. Clamp
  for (const t of TEAM_IDS) for (const k of GAUGES) g.teams[t].gauges[k] = clamp(g.teams[t].gauges[k]);

  // 11. Attractiveness
  const att = Object.fromEntries(TEAM_IDS.map((t) => [t, attract(g.teams[t].gauges)]));

  // 12. Passive gains (eligibility on start-of-turn owners)
  const help = {}; // "c:t" -> { cardId: amount }
  const credit = (c, t, cardId, amount) => {
    const k = `${c}:${t}`;
    help[k] = help[k] || {};
    help[k][cardId] = (help[k][cardId] || 0) + amount;
    const sk = `${t}:${cardId}`;
    g.stats.cardInfluence[sk] = round2((g.stats.cardInfluence[sk] || 0) + amount);
  };
  for (const t of TEAM_IDS) {
    for (const c of elig[t]) {
      const need = COUNTRY[c].need;
      const passive = att[t] / C.PASSIVE_DIV;
      const gaugeKey = NEEDS[need].gauge;
      const match = (gaugeKey === "attract" ? att[t] : g.teams[t].gauges[gaugeKey]) / C.MATCH_DIV;
      const matching = playedList[t].filter((id) => CARD[id].tags.includes(need));
      const cardMatch = Math.min(2, matching.length);
      let mult = 1;
      if (g.teams[t].rejection >= C.REJ_PENALTY_AT) mult *= C.REJ_PENALTY;
      mult *= eventMultiplier(ev, need);
      if (ev === "ev_summit") mult *= 1.5;
      g.influence[c][t] += (passive + match + cardMatch) * mult;
      matching.slice(0, 2).forEach((id) => credit(c, t, id, mult));
    }
  }

  // 13. Targeted bonuses
  const bump = (c, t, v) => { if (FREE_COUNTRIES.includes(c)) g.influence[c][t] += v; };
  for (const t of TEAM_IDS) {
    const cid = played[t].culture;
    if (cid && targets[t]) {
      const v = cultureInfluence(cid, targets[t], ev, powers[t] && powers[t].id === "artdevivre");
      bump(targets[t], t, v);
      credit(targets[t], t, cid, v);
    }
    if (played[t].president === "pre_un") {
      for (const c of FREE_COUNTRIES) if (startOwners[c] === t) { bump(c, t, 1); credit(c, t, "pre_un", 1); }
    }
    const pw = powers[t];
    if (pw) {
      if (pw.id === "hollywood") pw.targets.forEach((c) => bump(c, t, 4));
      if (pw.id === "silkroads") pw.targets.forEach((c) => bump(c, t, 2));
      if (pw.id === "carnaval") {
        for (const c of FREE_COUNTRIES) if (COUNTRY[c].need === "fete") bump(c, t, 3);
        for (const c of elig[t]) bump(c, t, 1);
      }
    }
  }
  for (const ex of cultureExchanges) for (const t of ex.pair) for (const c of ex.countries) bump(c, t, 1);
  for (const c of FREE_COUNTRIES) for (const t of TEAM_IDS) g.influence[c][t] = round2(g.influence[c][t]);

  // 14. Owners
  g.owners = computeOwners(g.influence, startOwners);

  // 15. Cultural backlash
  const backlash = [];
  for (const t of TEAM_IDS) {
    if (g.teams[t].rejection >= C.BACKLASH_AT) {
      backlash.push(t);
      for (const c of FREE_COUNTRIES) g.influence[c][t] = round2(g.influence[c][t] / 2);
      g.teams[t].rejection = 1;
      g.stats.backlashes[t] += 1;
      const lastForcing = playedList[t].map((id) => CARD[id]).find((c) => c.rejection > 0);
      add(10, fill(TEXT.headlines.backlash, { ...teamLabel(t), idea: lastForcing ? lowerName(lastForcing.name) : TEXT.ideaBacklash }), [t]);
    }
  }
  if (backlash.length) g.owners = computeOwners(g.influence, startOwners);

  // 16. Planet
  g.globalPlanet = globalPlanet(g);
  g.planetAlert = g.globalPlanet < C.PLANET_WARN || ev === "ev_summit";
  if (g.globalPlanet < C.PLANET_INSTANT || (turn >= TURNS && g.globalPlanet < C.PLANET_LOSE)) g.gameOver = true;

  // 17. Map changes + headlines
  const changes = [];
  for (const c of COUNTRIES) {
    if (!FREE_COUNTRIES.includes(c.id)) continue;
    const from = startOwners[c.id], to = g.owners[c.id];
    const scoreNow = to ? g.influence[c.id][to] : 0;
    const prevStrong = from ? game.influence[c.id][from] >= C.STRONG_AT : false;
    const strong = scoreNow >= C.STRONG_AT;
    if (from !== to) changes.push({ country: c.id, from, to, strong });
    else if (to && strong !== prevStrong) changes.push({ country: c.id, from, to, strong, tier: true });
  }
  const ideaFor = (c, t) => {
    const h = help[`${c}:${t}`];
    if (h) {
      const best = Object.entries(h).sort((a, b) => b[1] - a[1])[0];
      if (best) return lowerName(CARD[best[0]].name);
    }
    return fill(TEXT.ideaFallback, { need: NEEDS[COUNTRY[c].need].label.toLowerCase() });
  };
  for (const ch of changes) {
    if (ch.tier) continue;
    const cty = COUNTRY[ch.country];
    const base = { cflag: cty.flag, country: cty.name };
    if (ch.to && ch.from) {
      add(6, fill(TEXT.headlines.switches, { ...base, tflag: TEAM[ch.to].flag, team: TEAM[ch.to].name, oflag: TEAM[ch.from].flag, other: TEAM[ch.from].name }), [ch.to, ch.from]);
    } else if (ch.to) {
      add(4, fill(TEXT.headlines.joins, { ...base, tflag: TEAM[ch.to].flag, team: TEAM[ch.to].name, idea: ideaFor(ch.country, ch.to) }), [ch.to]);
    } else {
      add(2, fill(TEXT.headlines.leaves, { ...base, oflag: TEAM[ch.from].flag, other: TEAM[ch.from].name }), [ch.from]);
    }
  }
  for (const t of TEAM_IDS) {
    if (g.teams[t].bot) continue;
    for (const role of missing[t]) add(3, fill(TEXT.headlines.coffee, { ...teamLabel(t), office: TEXT.offices[role] }), [t]);
    for (const k of GAUGES) {
      const v = g.teams[t].gauges[k];
      if (v <= 1 && v < startGauges[t][k]) add(3, fill(TEXT.headlines.low, { ...teamLabel(t), icon: GAUGE_INFO[k].icon, gauge: GAUGE_INFO[k].short }), [t]);
    }
  }
  for (const t of TEAM_IDS) {
    for (const k of GAUGES) {
      const v = g.teams[t].gauges[k];
      if (v >= 10 && startGauges[t][k] < 10) add(1, fill(TEXT.headlines.high, { ...teamLabel(t), icon: GAUGE_INFO[k].icon, gauge: GAUGE_INFO[k].short.toLowerCase() }), [t]);
    }
  }
  add(g.globalPlanet < C.PLANET_WARN ? 8 : 1, fill(g.globalPlanet < C.PLANET_WARN ? TEXT.headlines.planet : TEXT.headlines.planetOk, { score: g.globalPlanet }), []);
  const top = TEAM_IDS.slice().sort((a, b) => att[b] - att[a])[0];
  add(1, fill(TEXT.headlines.attractive, { ...teamLabel(top), year }), [top]);
  if (!changes.some((c) => !c.tier)) add(1, TEXT.headlines.quiet, []);
  // Pad to at least 5 with a short status of each team
  const byAtt = TEAM_IDS.slice().sort((a, b) => att[b] - att[a]);
  for (const t of byAtt) {
    if (H.length >= 5) break;
    const zone = FREE_COUNTRIES.filter((c) => g.owners[c] === t).length;
    add(0, fill(TEXT.headlines.mood, { ...teamLabel(t), att: att[t], zone }), [t]);
  }
  // Keep 5..10, most important first but in a stable story order
  const headlines = H.map((h, i) => ({ ...h, i })).sort((a, b) => b.prio - a.prio || a.i - b.i).slice(0, 10)
    .map(({ text, teams }) => ({ text, teams }));

  // 18. History + write
  const deltas = {};
  for (const t of TEAM_IDS) {
    deltas[t] = Object.fromEntries(GAUGES.map((k) => [k, g.teams[t].gauges[k] - startGauges[t][k]]));
    deltas[t].rejection = g.teams[t].rejection - startRej[t];
    for (const role of CARD_ROLES) if (played[t][role]) g.teams[t].played[role].push({ id: played[t][role], turn });
  }
  g.history[turn] = {
    event: ev, year, played, targets, vetoes, strikes, missing, pacts, powers, backlash, deltas,
    changes, headlines, globalPlanet: g.globalPlanet,
    ownersChanged: changes.filter((c) => !c.tier).length,
  };
  g.headlines = headlines;
  g.changes = changes;
  g.resolvedTurn = turn;
  g.phase = "reveal";
  g.phaseEndsAt = null;
  return { game: g, resolved: true };
}

// ---------------------------------------------------------------------------
// End of game (§7, §14)
// ---------------------------------------------------------------------------
export function finalScores(game) {
  const rows = TEAM_IDS.map((t) => ({
    team: t,
    zone: FREE_COUNTRIES.filter((c) => game.owners[c] === t).length,
    influence: round1(FREE_COUNTRIES.reduce((s, c) => s + (game.influence[c][t] || 0), 0)),
    attract: attract(game.teams[t].gauges),
  }));
  rows.sort((a, b) => b.zone - a.zone || b.influence - a.influence || b.attract - a.attract || (a.team < b.team ? -1 : 1));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

export function awards(game) {
  const by = (f, dir = 1) => TEAM_IDS.slice().sort((a, b) => dir * (f(b) - f(a)) || (a < b ? -1 : 1))[0];
  const g = (t) => game.teams[t].gauges;
  const out = [];
  const happiest = by((t) => g(t).happy * 10 + attract(g(t)));
  out.push({ key: "happiest", team: happiest, value: `🙂 ${g(happiest).happy}/10` });
  const polluter = by((t) => g(t).planet * 10 - g(t).eco, -1);
  out.push({ key: "polluter", team: polluter, value: `🌍 ${g(polluter).planet}/10` });
  const bl = by((t) => game.stats.backlashes[t] * 100 + game.stats.rejGained[t]);
  out.push({ key: "backlash", team: bl, value: `🚫 ×${game.stats.backlashes[bl]} · 🔥 ${game.stats.rejGained[bl]}` });
  const dip = by((t) => game.stats.deals[t]);
  out.push({ key: "diplomat", team: dip, value: `🤝 ${game.stats.deals[dip]} deal(s)` });
  const best = Object.entries(game.stats.cardInfluence).sort((a, b) => b[1] - a[1])[0];
  if (best) {
    const [team, cardId] = best[0].split(":");
    out.push({ key: "copied", team, card: cardId, value: `${CARD[cardId].emoji} ${CARD[cardId].name}` });
  }
  return out;
}

export { TEAM };
