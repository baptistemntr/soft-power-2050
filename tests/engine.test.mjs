import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../netlify/lib/engine.mjs";
import { TEAM_IDS, FREE_COUNTRIES, DECKS, CARD, ROLE_IDS } from "../netlify/lib/data.mjs";
import { rng, shuffle } from "../netlify/lib/rng.mjs";

const { C } = E;

// A game in the decide phase of turn 1 where every team is human (no bot choices).
function humanGame(id = "t1", event = null) {
  const g = E.initGame({ gameId: id });
  for (const t of TEAM_IDS) g.teams[t].bot = false;
  g.phase = "decide"; g.turn = 1;
  if (event) g.events[0] = event;
  return g;
}
const hand = (g, t, r) => E.dealHand(g, g.turn, t, r);
// Put a specific card in the team's hand by brute force on the gameId seed.
function gameWithCard(cardId, team = "fra", event = null) {
  const role = CARD[cardId].role;
  for (let i = 0; i < 5000; i++) {
    const g = humanGame(`seed${i}`, event);
    if (hand(g, team, role).includes(cardId)) return g;
  }
  throw new Error("no seed found");
}
const resolve = (g, inputs = {}) => E.resolveTurn(g, inputs).game;

// ---------------------------------------------------------------- rng / setup
test("rng is deterministic", () => {
  const a = rng("x"), b = rng("x");
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
  assert.deepEqual(shuffle([1, 2, 3, 4], rng("s")), shuffle([1, 2, 3, 4], rng("s")));
});

test("events: turn 1 = ChatGPT, turn 6 = Summit, 4 distinct in between, seeded", () => {
  const ev = E.pickEvents("abc");
  assert.equal(ev.length, 6);
  assert.equal(ev[0], "ev_chatgpt");
  assert.equal(ev[5], "ev_summit");
  assert.equal(new Set(ev).size, 6);
  assert.deepEqual(E.pickEvents("abc"), ev);
});

test("initial state: gauges from the spec, global planet 24, no owners", () => {
  const g = E.initGame({ gameId: "g" });
  assert.deepEqual(g.teams.usa.gauges, { eco: 8, planet: 2, happy: 5, cohesion: 4 });
  assert.equal(g.globalPlanet, 24);
  assert.ok(FREE_COUNTRIES.every((c) => g.owners[c] === null));
  assert.equal(FREE_COUNTRIES.length, 23);
});

test("attract = mean of the four gauges, one decimal", () => {
  assert.equal(E.attract({ eco: 8, planet: 2, happy: 5, cohesion: 4 }), 4.8);
  assert.equal(E.attract({ eco: 5, planet: 6, happy: 7, cohesion: 7 }), 6.3);
});

// ---------------------------------------------------------------- cards
test("dealHand: 3 distinct cards of the role deck, deterministic", () => {
  const g = humanGame("deal");
  for (const r of ["president", "eco", "ecolo", "culture", "voice"]) {
    const h = hand(g, "usa", r);
    assert.equal(h.length, 3);
    assert.equal(new Set(h).size, 3);
    for (const id of h) assert.ok(DECKS[r].includes(id));
    assert.deepEqual(hand(g, "usa", r), h);
  }
  assert.deepEqual(E.dealHand(g, 1, "usa", "diplomat"), []);
});

test("dealHand: a played card does not come back; small deck is recycled", () => {
  const g = humanGame("deal2");
  const played = DECKS.voice.slice(0, 2);
  g.teams.usa.played.voice = played.map((id) => ({ id, turn: 1 }));
  const h2 = E.dealHand(g, 2, "usa", "voice");
  for (const id of played) assert.ok(!h2.includes(id));
  // the same turn's hand is not affected by cards played that turn
  assert.deepEqual(E.dealHand(g, 1, "usa", "voice"), hand(humanGame("deal2"), "usa", "voice"));
  g.teams.usa.played.voice = DECKS.voice.slice(0, 5).map((id) => ({ id, turn: 1 }));
  assert.equal(E.dealHand(g, 2, "usa", "voice").length, 3);
});

// ---------------------------------------------------------------- map
test("eligible: neighbours of the team country, extended through its zone", () => {
  const owners = Object.fromEntries(FREE_COUNTRIES.map((c) => [c, null]));
  assert.deepEqual(E.eligible("usa", owners).sort(), ["can", "gbr", "jpn", "mex"]);
  owners.mex = "usa";
  assert.ok(E.eligible("usa", owners).includes("col"));
  assert.ok(!E.eligible("usa", owners).includes("bra"), "team countries are never eligible");
  owners.aus = "usa"; // far away (e.g. Hollywood): stays eligible, its neighbours too
  assert.ok(E.eligible("usa", owners).includes("aus"));
  assert.ok(E.eligible("usa", owners).includes("idn"));
});

function inf(over) {
  const out = {};
  for (const c of FREE_COUNTRIES) out[c] = Object.fromEntries(TEAM_IDS.map((t) => [t, 0]));
  for (const [c, scores] of Object.entries(over)) Object.assign(out[c], scores);
  return out;
}
const noOwners = () => Object.fromEntries(FREE_COUNTRIES.map((c) => [c, null]));

test("owners: threshold 4 and lead > 0.5", () => {
  const o = E.computeOwners(inf({ can: { usa: 4 }, mex: { usa: 3.9 }, gbr: { fra: 5, swe: 4.6 }, nor: { swe: 5, fra: 4.4 } }), noOwners());
  assert.equal(o.can, "usa");
  assert.equal(o.mex, null);
  assert.equal(o.gbr, null, "gap 0.4 is too small");
  assert.equal(o.nor, "swe");
});

test("owners: ties keep the current owner while it has >= 4, else neutral", () => {
  const prev = { ...noOwners(), gbr: "usa", nor: "usa", fin: "fra" };
  const o = E.computeOwners(inf({ gbr: { fra: 6, usa: 6 }, nor: { swe: 4.5, usa: 4.2 }, fin: { swe: 5, fra: 3.9 } }), prev);
  assert.equal(o.gbr, "usa", "exact tie keeps owner");
  assert.equal(o.nor, "usa", "small gap keeps owner");
  assert.equal(o.fin, "swe", "clear leader takes over");
  const o2 = E.computeOwners(inf({ gbr: { fra: 6, usa: 3.5 } }), { ...noOwners(), gbr: "usa" });
  assert.equal(o2.gbr, "fra");
  const o3 = E.computeOwners(inf({ gbr: { fra: 3.6, usa: 3.5 } }), { ...noOwners(), gbr: "usa" });
  assert.equal(o3.gbr, null, "owner under 4 -> neutral");
});

// ---------------------------------------------------------------- resolution
test("resolveTurn is idempotent", () => {
  const g = humanGame("idem");
  const r1 = E.resolveTurn(g, {});
  assert.equal(r1.resolved, true);
  assert.equal(r1.game.resolvedTurn, 1);
  assert.equal(r1.game.phase, "reveal");
  const r2 = E.resolveTurn(r1.game, {});
  assert.equal(r2.resolved, false);
  assert.strictEqual(r2.game, r1.game);
});

test("passive gain formula with erosion (no cards played)", () => {
  const g = humanGame("passive");
  g.influence.can.usa = 10;
  const out = resolve(g, {});
  // USA after ChatGPT without tech card: eco 9, planet 2, happy 4, cohesion 3 -> attract 4.5
  assert.deepEqual(out.teams.usa.gauges, { eco: 9, planet: 2, happy: 4, cohesion: 3 });
  // Canada (climat -> planet 2): 10*0.9 + 4.5/5 + 2/5 + 0
  assert.equal(out.influence.can.usa, 9 + 0.9 + 0.4);
  // Mexico (ville -> happy 4): 0.9 + 0.8
  assert.equal(out.influence.mex.usa, 1.7);
  assert.equal(out.owners.can, "usa");
  assert.equal(out.influence.aus.usa, 0, "not eligible");
});

test("cardMatch adds +1 per matching card (max 2), rejection >= 3 multiplies by 0.7", () => {
  const g = gameWithCard("eco_remote", "usa"); // tags ville, burnout
  const base = resolve(g, {}).influence.mex.usa;
  const withCard = resolve(g, { picks: { usa: { eco: { card: "eco_remote" } } } });
  const usa = withCard.teams.usa.gauges;
  const a = E.attract(usa);
  assert.ok(withCard.influence.mex.usa > base);
  assert.equal(withCard.influence.mex.usa, Math.round((a / 5 + usa.happy / 5 + 1) * 100) / 100);
  const g2 = gameWithCard("eco_remote", "usa");
  g2.teams.usa.rejection = 4; // 4 - 1 (no forcing card) = 3 -> penalty
  const pen = resolve(g2, { picks: { usa: { eco: { card: "eco_remote" } } } });
  assert.equal(pen.teams.usa.rejection, 3);
  assert.equal(pen.influence.mex.usa, Math.round((a / 5 + usa.happy / 5 + 1) * 0.7 * 100) / 100);
});

test("a card not in the hand is ignored; a missing role plays nothing and gets a coffee headline", () => {
  const g = humanGame("miss");
  const notInHand = DECKS.eco.find((id) => !hand(g, "fra", "eco").includes(id));
  const out = resolve(g, { picks: { fra: { eco: { card: notInHand } } } });
  assert.equal(out.history[1].played.fra.eco, undefined);
  assert.ok(out.history[1].missing.fra.includes("eco"));
  assert.ok(out.headlines.some((h) => h.text.includes("coffee break") && h.text.includes("France")) ||
    out.history[1].headlines.length === 10, "coffee headline (unless crowded out)");
});

test("strike cancels the targeted eco/ecolo card, +1 cohesion -1 eco, once per game", () => {
  const g = gameWithCard("eco_robots", "fra");
  const before = { ...g.teams.fra.gauges };
  const out = resolve(g, { picks: { fra: { eco: { card: "eco_robots" } } }, voice: { fra: { strike: "eco" } } });
  assert.equal(out.history[1].played.fra.eco, undefined);
  assert.equal(out.history[1].strikes.fra, "eco");
  assert.equal(out.teams.fra.strikeUsed, true);
  // ChatGPT: eco+1 happy-1, no tech card played (cancelled) -> cohesion -1; strike: cohesion +1 eco -1
  assert.equal(out.teams.fra.gauges.eco, before.eco + 1 - 1);
  assert.equal(out.teams.fra.gauges.cohesion, before.cohesion - 1 + 1);
  assert.ok(out.headlines.some((h) => h.text.includes("General strike")));
  // second strike later is ignored
  const g2 = { ...out, phase: "decide", turn: 2, resolvedTurn: 1 };
  const out2 = resolve(g2, { voice: { fra: { strike: "ecolo" } } });
  assert.equal(out2.history[2].strikes.fra, undefined);
});

test("veto cancels one card of the team (not the strike)", () => {
  const g = gameWithCard("eco_drill", "bra");
  const out = resolve(g, {
    picks: { bra: { ecolo: { card: "eco_drill" } } },
    president: { bra: { veto: "ecolo" } },
    voice: { bra: { strike: "eco" } },
  });
  assert.equal(out.history[1].played.bra.ecolo, undefined);
  assert.equal(out.history[1].vetoes.bra, "ecolo");
  assert.equal(out.history[1].strikes.bra, "eco", "the strike still happens");
  assert.ok(out.headlines.some((h) => h.text.includes("vetoed 'Drill baby drill'")));
  // vetoing an empty role does nothing
  const out2 = resolve(humanGame("v2"), { president: { bra: { veto: "eco" } } });
  assert.equal(out2.history[1].vetoes.bra, undefined);
});

test("rejection: forcing cards add, none played -> -1 (min 0), scholarships remove", () => {
  const g = gameWithCard("cul_ads", "chn");
  const target = E.eligible("chn", g.owners)[0];
  const out = resolve(g, { picks: { chn: { culture: { card: "cul_ads", target } } } });
  assert.equal(out.teams.chn.rejection, 2);
  assert.equal(out.teams.usa.rejection, 0);
  assert.equal(out.influence[target].chn > 4, true, "ad blitz +4 on the target");
  const g2 = gameWithCard("cul_scholarships", "chn");
  g2.teams.chn.rejection = 4;
  const t2 = E.eligible("chn", g2.owners)[0];
  const out2 = resolve(g2, { picks: { chn: { culture: { card: "cul_scholarships", target: t2 } } } });
  assert.equal(out2.teams.chn.rejection, 4 - 2 - 1);
});

test("cultural backlash at rejection >= 5: influence halved, owners recomputed, rejection = 1", () => {
  const g = gameWithCard("cul_pressure", "chn");
  g.teams.chn.rejection = 2;
  g.influence.kor.chn = 20; g.owners.kor = "chn";
  g.influence.kor.usa = 9;
  const out = resolve(g, { picks: { chn: { culture: { card: "cul_pressure", target: "vnm" } } } });
  assert.equal(out.teams.chn.rejection, 1);
  assert.deepEqual(out.history[1].backlash, ["chn"]);
  assert.equal(out.stats.backlashes.chn, 1);
  assert.ok(out.headlines.some((h) => h.text.startsWith("🚫 Cultural backlash!") && h.text.includes("China")));
  // kor: (20*0.9 + gain) / 2 vs usa 9*0.9 + gain -> USA now leads
  assert.ok(out.influence.kor.chn < 14);
  assert.equal(out.owners.kor, out.influence.kor.usa > out.influence.kor.chn + C.OWNER_GAP ? "usa" : out.owners.kor);
});

test("planet: alert under 18, immediate game over under 10, end game over under 15", () => {
  const g = humanGame("planet");
  for (const t of TEAM_IDS) g.teams[t].gauges.planet = 3; // 15, ChatGPT does not touch planet
  const out = resolve(g, {});
  assert.equal(out.globalPlanet, 15);
  assert.equal(out.planetAlert, true);
  assert.equal(out.gameOver, false, "15 at turn 1 is not game over");
  const g2 = humanGame("planet2");
  for (const t of TEAM_IDS) g2.teams[t].gauges.planet = 1;
  assert.equal(resolve(g2, {}).gameOver, true, "under 10 -> immediate game over");
  const g3 = humanGame("planet3", "ev_crash");
  g3.turn = 6; g3.events[5] = "ev_crash";
  for (const t of TEAM_IDS) g3.teams[t].gauges.planet = 2; g3.teams.bra.gauges.planet = 6; // 14
  assert.equal(resolve(g3, {}).gameOver, true, "turn 6 under 15 -> game over");
  g3.teams.bra.gauges.planet = 7; // 15
  assert.equal(resolve(g3, {}).gameOver, false);
});

test("summit (turn 6) forces the planet banner and boosts passive gains x1.5", () => {
  const g = humanGame("summit", "ev_summit");
  const out = resolve(g, {});
  assert.equal(out.planetAlert, true);
  const ref = resolve(humanGame("summit", "ev_crash"), {});
  // Canada for USA: passive + match only, compare ratio using each turn's attract
  const a = E.attract(out.teams.usa.gauges);
  assert.equal(out.influence.can.usa, Math.round((a / 5 + out.teams.usa.gauges.planet / 5) * 1.5 * 100) / 100);
  assert.ok(ref.influence.can.usa < out.influence.can.usa);
});

// ---------------------------------------------------------------- events
test("ChatGPT: tech card -> happy +1, otherwise cohesion -1", () => {
  const g = gameWithCard("eco_aitraining", "swe");
  const s = { ...g.teams.swe.gauges };
  const out = resolve(g, { picks: { swe: { eco: { card: "eco_aitraining" } } } });
  // event eco+1 happy-1 +1 ; card eco+1 happy+1
  assert.deepEqual(out.teams.swe.gauges, { ...s, eco: s.eco + 2, happy: s.happy + 1 });
  assert.equal(out.teams.usa.gauges.cohesion, 3);
});

test("event gauge rules", () => {
  const d = E.eventGaugeDeltas;
  const pre = { eco: 5, planet: 5, happy: 5, cohesion: 5 };
  assert.deepEqual(d("ev_heatwave", pre, []), { eco: 0, planet: -1, happy: -1, cohesion: 0 });
  assert.deepEqual(d("ev_heatwave", { ...pre, planet: 6 }, ["eco_carbontax"]), { eco: 0, planet: -1, happy: 1, cohesion: 0 });
  assert.equal(d("ev_tangping", pre, []).eco, -1);
  assert.equal(d("ev_tangping", { ...pre, happy: 6 }, ["voi_tangping"]).eco, 0);
  assert.equal(d("ev_tangping", pre, ["voi_tangping"]).happy, 1);
  assert.equal(d("ev_oil", { ...pre, planet: 3 }, ["eco_solar"]).eco, -1);
  assert.equal(d("ev_oil", pre, []).eco, 0);
  assert.equal(d("ev_burnout", pre, ["voi_4day"]).happy, 1);
  assert.equal(d("ev_burnout", pre, []).happy, -1);
  assert.equal(d("ev_crash", pre, []).eco, -2);
  assert.equal(d("ev_crash", { ...pre, cohesion: 6 }, []).eco, -1);
  assert.equal(d("ev_quit", pre, ["eco_ubi"]).cohesion, 0);
  assert.equal(d("ev_floods", pre, []).planet, -1);
  assert.equal(d("ev_robotstrike", pre, ["eco_robots"]).cohesion, -2);
  assert.equal(d("ev_robotstrike", pre, ["eco_uber", "voi_wages"]).cohesion, -1);
  assert.deepEqual(d("ev_olympics", pre, []), { eco: 0, planet: 0, happy: 0, cohesion: 0 });
});

test("event multipliers on country needs", () => {
  assert.equal(E.eventMultiplier("ev_tangping", "burnout"), 1.5);
  assert.equal(E.eventMultiplier("ev_oil", "energie"), 1.5);
  assert.equal(E.eventMultiplier("ev_olympics", "fete"), 1.5);
  assert.equal(E.eventMultiplier("ev_burnout", "burnout"), 2);
  assert.equal(E.eventMultiplier("ev_floods", "climat"), 2);
  assert.equal(E.eventMultiplier("ev_floods", "fete"), 1);
});

test("culture influence: fete bonuses, Olympics x2, Art de vivre x2, TikTok", () => {
  assert.equal(E.cultureInfluence("cul_series", "can", "ev_crash"), 3);
  assert.equal(E.cultureInfluence("cul_fashion", "esp", "ev_crash"), 3);
  assert.equal(E.cultureInfluence("cul_festival", "col", "ev_crash"), 4);
  assert.equal(E.cultureInfluence("cul_festival", "can", "ev_olympics"), 4);
  assert.equal(E.cultureInfluence("cul_food", "can", "ev_crash", true), 4);
  assert.equal(E.cultureInfluence("cul_influencers", "can", "ev_tiktok"), 1);
  assert.equal(E.cultureInfluence("cul_series", null, "ev_crash"), 0);
});

test("TikTok: global culture cards must target an eligible country", () => {
  const g = humanGame("tt", "ev_tiktok");
  assert.equal(E.cultureTargets(g, "usa", "cul_series").length, 4);
  g.events[0] = "ev_crash";
  assert.equal(E.cultureTargets(g, "usa", "cul_series").length, 23);
  assert.equal(E.cultureTargets(g, "usa", "cul_ads").length, 4);
});

test("culture target that is not eligible is ignored (card fx still apply)", () => {
  const g = gameWithCard("cul_food", "fra");
  const out = resolve(g, { picks: { fra: { culture: { card: "cul_food", target: "aus" } } } });
  assert.equal(out.influence.aus.fra, 0);
  assert.equal(out.history[1].played.fra.culture, "cul_food");
});

// ---------------------------------------------------------------- powers
test("Hollywood: +4 on any country, once", () => {
  const g = humanGame("hw");
  const out = resolve(g, { president: { usa: { power: true, targets: ["aus"] } } });
  assert.equal(out.influence.aus.usa, 4);
  assert.equal(out.teams.usa.powerUsed, true);
  const g2 = { ...out, phase: "decide", turn: 2 };
  const out2 = resolve(g2, { president: { usa: { power: true, targets: ["arg"] } } });
  assert.equal(out2.influence.arg.usa, 0, "already used");
  const out3 = resolve(humanGame("hw3"), { president: { usa: { power: true, targets: ["fra"] } } });
  assert.equal(out3.teams.usa.powerUsed, false, "invalid target: not consumed");
});

test("Lagom, Silk Roads, Carnaval, Art de vivre", () => {
  const g = humanGame("pw");
  g.teams.swe.rejection = 4;
  const out = resolve(g, {
    president: {
      swe: { power: true }, chn: { power: true, targets: ["ind", "kor", "vnm", "aus"] },
      bra: { power: true }, fra: { power: true },
    },
  });
  assert.equal(out.teams.swe.rejection, 0);
  assert.equal(out.teams.swe.gauges.happy, 7 - 1 + 1);
  assert.equal(out.teams.chn.rejection, 1);
  assert.deepEqual(out.history[1].powers.chn.targets, ["ind", "kor", "vnm"]);
  assert.ok(out.influence.esp.bra >= 3, "carnaval reaches far fete countries");
  assert.equal(out.teams.fra.powerUsed, true);
});

// ---------------------------------------------------------------- diplomacy
test("offers: accepted trade gives eco +1 to both; unanswered = refused", () => {
  const g = humanGame("dip");
  const offers = [{ from: "fra", to: "swe", type: "trade", at: 1 }, { from: "usa", to: "chn", type: "trade", at: 2 }];
  const out = resolve(g, { offers, replies: { "fra-swe": { accept: true, type: "trade", at: 3 } } });
  assert.equal(out.teams.fra.gauges.eco, 6 + 1 + 1);
  assert.equal(out.teams.swe.gauges.eco, 5 + 1 + 1);
  assert.equal(out.teams.usa.gauges.eco, 8 + 1);
  assert.deepEqual(out.history[1].pacts, [{ from: "fra", to: "swe", type: "trade" }]);
  assert.ok(out.headlines.some((h) => h.text.includes("France and 🇸🇪 Sweden sign a trade deal")));
  assert.equal(out.stats.deals.fra, 1);
});

test("offers: reply must match the type; one accepted offer per type per recipient", () => {
  const g = humanGame("dip2");
  const offers = [
    { from: "fra", to: "swe", type: "climate", at: 1 },
    { from: "usa", to: "swe", type: "climate", at: 2 },
    { from: "chn", to: "swe", type: "trade", at: 3 },
  ];
  const replies = {
    "fra-swe": { accept: true, type: "climate", at: 5 },
    "usa-swe": { accept: true, type: "climate", at: 4 },
    "chn-swe": { accept: true, type: "culture", at: 6 },
  };
  const acc = E.acceptedOffers(g, offers, replies);
  assert.deepEqual(acc, [{ from: "usa", to: "swe", type: "climate" }]);
});

test("offers: bots accept trade and culture, climate only if planet <= 5", () => {
  const g = humanGame("dip3");
  g.teams.bra.bot = true; g.teams.chn.bot = true;
  const acc = E.acceptedOffers(g, [
    { from: "usa", to: "bra", type: "climate", at: 1 },
    { from: "fra", to: "chn", type: "climate", at: 1 },
    { from: "swe", to: "bra", type: "culture", at: 1 },
  ], {});
  assert.deepEqual(acc.map((a) => `${a.from}-${a.to}`).sort(), ["fra-chn", "swe-bra"]);
});

test("offers: culture exchange gives +1 on shared eligible countries, else happy +1", () => {
  const g = humanGame("dip4");
  const out = resolve(g, { offers: [{ from: "fra", to: "swe", type: "culture", at: 1 }], replies: { "fra-swe": { accept: true, type: "culture" } } });
  const ref = resolve(humanGame("dip4"), {});
  assert.equal(Math.round((out.influence.gbr.fra - ref.influence.gbr.fra) * 100) / 100, 1);
  assert.equal(out.teams.fra.gauges.happy, ref.teams.fra.gauges.happy);
  const out2 = resolve(humanGame("dip5"), { offers: [{ from: "usa", to: "chn", type: "culture", at: 1 }], replies: { "usa-chn": { accept: true, type: "culture" } } });
  assert.ok(out2.influence.jpn.usa > 0); // jpn is eligible for both
  const out3 = resolve(humanGame("dip6"), { offers: [{ from: "bra", to: "chn", type: "culture", at: 1 }], replies: { "bra-chn": { accept: true, type: "culture" } } });
  assert.equal(out3.teams.bra.gauges.happy, 6 - 1 + 1);
});

// ---------------------------------------------------------------- phases, headlines, end
test("phase machine: roles -> event -> decide -> validate (derived) -> locked", () => {
  let g = E.startGame(E.initGame({ gameId: "ph" }), [], 0);
  assert.equal(g.phase, "roles");
  g = E.advance(g, 1000);
  assert.equal(g.phase, "event"); assert.equal(g.turn, 1);
  g = E.advance(g, 2000);
  assert.equal(g.phase, "decide"); assert.equal(g.phaseEndsAt, 2000 + 150000);
  assert.equal(E.effectivePhase(g, 100000).phase, "decide");
  const v = E.effectivePhase(g, 152000);
  assert.deepEqual(v, { phase: "validate", phaseEndsAt: 182000, locked: false });
  assert.equal(E.effectivePhase(g, 182000).locked, true);
  const closed = E.closePhase(g, 5000);
  assert.equal(closed.phase, "validate"); assert.equal(closed.phaseEndsAt, 35000);
  assert.equal(E.effectivePhase(E.closePhase(closed, 6000), 6000).locked, true);
});

test("setTimer clamps 60..240 and shifts a running decide timer", () => {
  let g = humanGame("tm");
  g.phaseEndsAt = 100000;
  g = E.setTimer(g, 90, 0);
  assert.equal(g.decideSeconds, 90);
  assert.equal(g.phaseEndsAt, 100000 - 60000);
  assert.equal(E.setTimer(g, 10, 0).decideSeconds, 60);
  assert.equal(E.setTimer(g, 999, 0).decideSeconds, 240);
});

test("reveal of turn 6 (or game over) leads to end", () => {
  const g = { ...humanGame("e"), phase: "reveal", turn: 6 };
  assert.equal(E.advance(g, 0).phase, "end");
  const g2 = { ...humanGame("e"), phase: "reveal", turn: 3, gameOver: true };
  assert.equal(E.advance(g2, 0).phase, "end");
  const g3 = { ...humanGame("e"), phase: "reveal", turn: 3 };
  const n = E.advance(g3, 0);
  assert.equal(n.phase, "event"); assert.equal(n.turn, 4);
});

test("headlines: 5 to 10 per turn, never colonial words", () => {
  for (let i = 0; i < 30; i++) {
    let g = E.startGame(E.initGame({ gameId: `h${i}` }), [], 0);
    g = E.advance(g, 0);
    for (let t = 1; t <= 6 && !g.gameOver; t++) {
      g = E.advance(g, 0);
      g = resolve(g, {});
      assert.ok(g.headlines.length >= 5 && g.headlines.length <= 10, `${g.headlines.length}`);
      for (const h of g.headlines) assert.ok(!/conquer|captur|convert|rall/i.test(h.text), h.text);
      g = E.advance(g, 0);
    }
  }
});

test("finalScores: zone size, then total influence, then attractiveness", () => {
  const g = E.initGame({ gameId: "fs" });
  g.owners.can = "usa"; g.owners.mex = "usa"; g.owners.gbr = "fra"; g.owners.esp = "fra";
  g.influence.esp.fra = 10; g.influence.can.usa = 5; g.influence.mex.usa = 4;
  const s = E.finalScores(g);
  assert.equal(s[0].team, "fra"); assert.equal(s[0].zone, 2); assert.equal(s[0].rank, 1);
  assert.equal(s[1].team, "usa");
  // swe (attract 6.3) beats bra (5.5) on the last tiebreak
  assert.ok(s.findIndex((r) => r.team === "swe") < s.findIndex((r) => r.team === "bra"));
});

test("awards are computed for every category", () => {
  let g = E.startGame(E.initGame({ gameId: "aw" }), [], 0);
  g = E.advance(g, 0);
  for (let t = 1; t <= 6 && !g.gameOver; t++) { g = E.advance(g, 0); g = resolve(g, {}); g = E.advance(g, 0); }
  const keys = E.awards(g).map((a) => a.key);
  for (const k of ["happiest", "polluter", "backlash", "diplomat"]) assert.ok(keys.includes(k));
});

test("bots never crash: 60 full games with mixed styles, exhausted decks", () => {
  for (let i = 0; i < 60; i++) {
    let g = E.startGame(E.initGame({ gameId: `bot${i}` }), [], 0);
    TEAM_IDS.forEach((t, k) => { g.teams[t].botStyle = (i + k) % 2 ? "aggressive" : "prudent"; });
    if (i % 3 === 0) for (const t of TEAM_IDS) g.teams[t].played.voice = DECKS.voice.map((id) => ({ id, turn: 0 }));
    g = E.advance(g, 0);
    for (let t = 1; t <= 6 && !g.gameOver; t++) {
      g = E.advance(g, 0);
      g = resolve(g, {});
      for (const team of TEAM_IDS) for (const v of Object.values(g.teams[team].gauges)) assert.ok(v >= 0 && v <= 10);
      g = E.advance(g, 0);
    }
    assert.equal(g.phase, "end");
  }
});

test("roles list in data matches engine expectations", () => {
  assert.equal(ROLE_IDS.length, 6);
});
