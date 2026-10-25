import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MemStore } from "./memstore.mjs";
import { setStoreForTests, setClockForTests } from "../netlify/lib/store.mjs";
import { TEAM_IDS, CARD, DECKS } from "../netlify/lib/data.mjs";
import stateFn from "../netlify/functions/state.mjs";
import joinFn from "../netlify/functions/join.mjs";
import pickFn from "../netlify/functions/pick.mjs";
import teamFn from "../netlify/functions/team.mjs";
import hostFn from "../netlify/functions/host.mjs";

const KEY = "test-host-key-123";
let mem, clock;

beforeEach(() => {
  mem = new MemStore();
  setStoreForTests(mem);
  clock = 1_000_000;
  setClockForTests(() => clock);
  process.env.HOST_KEY = KEY;
});

const post = async (fn, path, body) => {
  const res = await fn(new Request(`http://localhost${path}`, { method: "POST", body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json(), headers: res.headers };
};
const host = (action, extra = {}) => post(hostFn, "/api/host", { key: KEY, action, ...extra });
const join = (pid, name, team = "auto") => post(joinFn, "/api/join", { pid, name, team });
const pick = (pid, role, card, target) => post(pickFn, "/api/pick", { pid, role, card, target });
const team = (pid, action, extra = {}) => post(teamFn, "/api/team", { pid, action, ...extra });
const state = async (pid, headers = {}) => {
  const res = await stateFn(new Request(`http://localhost/api/state${pid ? `?pid=${pid}` : ""}`, { headers }));
  return { status: res.status, body: await res.json(), headers: res.headers };
};
const pid = (i) => `player-${String(i).padStart(4, "0")}`;

async function lobbyWith(n, teamOf = () => "auto") {
  await host("check");
  for (let i = 0; i < n; i++) { clock += 10; await join(pid(i), `P${i}`, teamOf(i)); }
}
async function toDecide() {
  await host("start");
  await host("next"); // roles -> event
  await host("next"); // event -> decide
}
async function holderOf(t, role) {
  for (let i = 0; i < 40; i++) {
    const s = (await state(pid(i))).body.private;
    if (s && s.me.team === t && s.me.roles.includes(role)) return { pid: pid(i), s };
  }
  return null;
}

// ---------------------------------------------------------------- host auth
test("host actions need the right key; missing HOST_KEY is reported", async () => {
  assert.equal((await post(hostFn, "/api/host", { key: "nope", action: "check" })).status, 403);
  delete process.env.HOST_KEY;
  assert.equal((await host("check")).status, 500);
  process.env.HOST_KEY = KEY;
  const r = await host("check");
  assert.equal(r.status, 200);
  assert.equal(r.body.state.phase, "lobby");
  assert.equal(r.headers.get("cache-control"), "no-store");
});

test("state before the host opens the game", async () => {
  const r = await state();
  assert.equal(r.body.phase, "nogame");
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal((await join(pid(1), "Ana")).status, 409);
});

test("static data endpoint", async () => {
  const res = await stateFn(new Request("http://localhost/api/state?static=1"));
  const d = await res.json();
  assert.equal(d.countries.length, 28);
  assert.ok(d.cards.length > 30 && d.text.title);
});

// ---------------------------------------------------------------- join
test("join validates pid and nickname, sanitises names", async () => {
  await host("check");
  assert.equal((await join("bad", "Ana")).status, 400);
  assert.equal((await join(pid(1), "A")).status, 400);
  assert.equal((await join(pid(1), "x".repeat(17))).status, 400);
  const r = await join(pid(1), "  <b>Ana</b>  ");
  assert.equal(r.status, 200);
  assert.equal(r.body.player.name, "bAna/b");
  assert.equal((await post(joinFn, "/api/join", "nope")).status, 400);
});

test("auto puts players in the smallest team; explicit team is respected", async () => {
  await host("check");
  await join(pid(1), "Ana", "fra");
  const r = await join(pid(2), "Bo", "auto");
  assert.equal(r.body.player.team, "usa");
  for (let i = 3; i < 7; i++) await join(pid(i), `P${i}`, "auto");
  const s = await state();
  for (const t of TEAM_IDS) assert.ok(s.body.teams[t].players.length >= 1);
  assert.equal(s.body.totalPlayers, 6);
});

test("rejoining (reload) keeps the same place", async () => {
  await host("check");
  await join(pid(1), "Ana", "swe");
  clock += 1000;
  await join(pid(1), "Ana", "swe");
  const s = await state(pid(1));
  assert.equal(s.body.private.me.team, "swe");
  assert.equal(s.body.totalPlayers, 1);
});

test("host can move a player and balance teams in the lobby; pids only for the host", async () => {
  await lobbyWith(6, () => "usa");
  let s = await state();
  assert.equal(s.body.teams.usa.players.length, 6);
  assert.equal(s.body.host, undefined);
  assert.ok(!JSON.stringify(s.body).includes(pid(0)), "pids never public");
  await host("movePlayer", { pid: pid(0), team: "chn" });
  s = await state(null, { "x-host-key": KEY });
  assert.equal(s.body.teams.chn.players.length, 1);
  assert.ok(s.body.host.players.find((p) => p.pid === pid(0) && p.team === "chn"));
  await host("balance");
  s = await state();
  for (const t of TEAM_IDS) assert.ok(s.body.teams[t].players.length >= 1);
});

// ---------------------------------------------------------------- start / roles
test("start assigns roles; empty teams become bots", async () => {
  await lobbyWith(3, (i) => ["fra", "fra", "usa"][i]);
  const r = await host("start");
  assert.equal(r.body.state.phase, "roles");
  assert.equal(r.body.state.teams.swe.bot, true);
  assert.equal(r.body.state.teams.fra.bot, false);
  const a = (await state(pid(0))).body.private.me;
  assert.deepEqual(a.roles, ["president", "culture", "diplomat"]);
  assert.equal(a.teammates.length, 2);
  assert.equal((await host("start")).status, 409);
});

// ---------------------------------------------------------------- picks
test("pick: only own roles, only cards in hand, only in decide, culture target must be eligible", async () => {
  await lobbyWith(10);
  await host("start");
  const eco = await holderOf("usa", "eco");
  assert.ok(eco);
  // roles phase: too early
  const hand0 = DECKS.eco[0];
  assert.equal((await pick(eco.pid, "eco", hand0)).status, 409);
  await host("next"); await host("next");
  const s = (await state(eco.pid)).body.private;
  const card = s.hands.eco[0];
  const notMine = DECKS.eco.find((id) => !s.hands.eco.includes(id));
  assert.equal((await pick(eco.pid, "eco", notMine)).status, 400);
  const otherRole = ["president", "ecolo", "culture", "voice"].find((r) => !s.me.roles.includes(r));
  assert.equal((await pick(eco.pid, otherRole, card)).status, 403);
  const ok = await pick(eco.pid, "eco", card);
  assert.equal(ok.status, 200);
  const after = await state(eco.pid);
  assert.equal(after.body.private.teamPicks.eco.card, card);
  assert.ok(after.body.teams.usa.rolesDone.includes("eco"));

  const cul = await holderOf("usa", "culture");
  const cs = (await state(cul.pid)).body.private;
  const ccard = cs.hands.culture[0];
  assert.equal((await pick(cul.pid, "culture", ccard, "zzz")).status, 400);
  const notEligible = ["aus", "zaf", "idn", "arg"].find((c) => !cs.targets[ccard].includes(c));
  if (notEligible) assert.equal((await pick(cul.pid, "culture", ccard, notEligible)).status, 400);
  assert.equal((await pick(cul.pid, "culture", ccard, cs.targets[ccard][0])).status, 200);
});

test("state never leaks other teams' hands or choices before the reveal", async () => {
  await lobbyWith(10);
  await toDecide();
  const a = await holderOf("usa", "eco");
  const b = await holderOf("fra", "eco");
  const bCard = b.s.hands.eco[0];
  await pick(b.pid, "eco", bCard);
  const sa = (await state(a.pid)).body;
  assert.equal(sa.private.teamPicks.eco, undefined, "USA does not see France's pick");
  assert.equal(JSON.stringify(sa.private.teamPicks).includes(bCard), false);
  assert.ok(!("picks" in sa) && !("hands" in sa));
  assert.ok(sa.teams.fra.rolesDone.includes("eco"), "only the fact that the role has chosen is public");
  const pub = (await state()).body;
  assert.equal(pub.private, undefined);
  assert.equal(JSON.stringify(pub).includes("teamPicks"), false);
});

// ---------------------------------------------------------------- diplomacy
test("offers: only diplomats, one per turn, reply once per type", async () => {
  await lobbyWith(10);
  await toDecide();
  const dUsa = await holderOf("usa", "diplomat");
  const dFra = await holderOf("fra", "diplomat");
  const dSwe = await holderOf("swe", "diplomat");
  const notDip = await holderOf("usa", "eco");
  if (!notDip.s.me.roles.includes("diplomat")) assert.equal((await team(notDip.pid, "offer", { to: "fra", type: "trade" })).status, 403);
  assert.equal((await team(dUsa.pid, "offer", { to: "usa", type: "trade" })).status, 400);
  assert.equal((await team(dUsa.pid, "offer", { to: "fra", type: "bribe" })).status, 400);
  assert.equal((await team(dUsa.pid, "offer", { to: "swe", type: "trade" })).status, 200);
  assert.equal((await team(dUsa.pid, "offer", { to: "fra", type: "trade" })).status, 200); // replaces the first
  assert.equal((await team(dSwe.pid, "offer", { to: "fra", type: "trade" })).status, 200);
  const sf = (await state(dFra.pid)).body.private.diplomacy;
  assert.equal(sf.received.length, 2);
  const su = (await state(dUsa.pid)).body.private.diplomacy;
  assert.deepEqual(su.sent, { to: "fra", type: "trade", status: "pending" });
  assert.equal((await team(dFra.pid, "reply", { from: "usa", accept: true })).status, 200);
  assert.equal((await team(dFra.pid, "reply", { from: "swe", accept: true })).status, 409, "one trade per turn");
  assert.equal((await team(dFra.pid, "reply", { from: "swe", accept: false })).status, 200);
  assert.equal((await team(dFra.pid, "reply", { from: "chn", accept: true })).status, 404);
  assert.equal((await state(dUsa.pid)).body.private.diplomacy.sent.status, "accepted");
});

// ---------------------------------------------------------------- validate / reveal
test("validate: president veto + power, voice strike, then idempotent reveal", async () => {
  await lobbyWith(12);
  await toDecide();
  const eco = await holderOf("swe", "eco");
  const card = eco.s.hands.eco[0];
  await pick(eco.pid, "eco", card);
  const pres = await holderOf("swe", "president");
  const voice = await holderOf("swe", "voice");
  // too early for validation actions
  assert.equal((await team(pres.pid, "president", { veto: "eco" })).status, 409);
  await host("close");
  let s = (await state(pres.pid)).body;
  assert.equal(s.phase, "validate");
  assert.equal(s.private.teamPicks.eco.card, card, "the president sees the team's choices");
  assert.equal((await pick(eco.pid, "eco", card)).status, 409, "decisions closed");
  if (!voice.s.me.roles.includes("president")) assert.equal((await team(voice.pid, "president", { veto: "eco" })).status, 403);
  assert.equal((await team(pres.pid, "president", { veto: "eco", power: true })).status, 200);
  assert.equal((await team(voice.pid, "strike", { target: "president" })).status, 400);
  assert.equal((await team(voice.pid, "strike", { target: "ecolo" })).status, 200);
  const r1 = await host("next"); // validate -> reveal
  assert.equal(r1.body.state.phase, "reveal");
  assert.ok(r1.body.state.headlines.length >= 5);
  assert.equal(r1.body.state.reveal.vetoes.swe, "eco");
  assert.equal(r1.body.state.reveal.strikes.swe, "ecolo");
  assert.equal(r1.body.state.teams.swe.powerUsed, true);
  const game1 = mem.data.get("game");
  const r2 = await host("reveal");
  assert.equal(mem.data.get("game"), game1, "second reveal changes nothing");
  assert.equal(r2.body.state.resolvedTurn, 1);
});

test("decide expires on its own: state shows validate, then locked", async () => {
  await lobbyWith(5);
  await toDecide();
  clock += 151_000;
  let s = (await state()).body;
  assert.equal(s.phase, "validate");
  assert.equal(s.locked, false);
  clock += 30_000;
  s = (await state()).body;
  assert.equal(s.locked, true);
  const pres = await holderOf("usa", "president");
  assert.equal((await team(pres.pid, "president", { veto: null })).status, 409);
});

test("host timer: setTimer 90 s in the middle of the game", async () => {
  await lobbyWith(2);
  await toDecide();
  const r = await host("setTimer", { seconds: 90 });
  assert.equal(r.body.state.decideSeconds, 90);
  assert.equal(r.body.state.phaseEndsAt, clock + 90_000);
});

// ---------------------------------------------------------------- reload / late / reset / full game
test("a reloading player finds team, roles and choices", async () => {
  await lobbyWith(5);
  await toDecide();
  const p = await holderOf("bra", "ecolo");
  const c = p.s.hands.ecolo[1];
  await pick(p.pid, "ecolo", c);
  const again = (await state(p.pid)).body.private;
  assert.equal(again.me.team, "bra");
  assert.deepEqual(again.me.roles, p.s.me.roles);
  assert.equal(again.teamPicks.ecolo.card, c);
  assert.deepEqual(again.hands, p.s.hands);
});

test("late joiners go to the smallest team as co-holders (bot team -> all roles)", async () => {
  await lobbyWith(4, (i) => ["usa", "fra", "swe", "chn"][i]);
  await toDecide();
  const r = await join(pid(50), "Late");
  assert.equal(r.body.player.team, "bra");
  assert.equal(r.body.player.roles.length, 6);
  let s = (await state()).body;
  assert.equal(s.teams.bra.bot, false);
  const r2 = await join(pid(51), "Later");
  assert.equal(r2.body.player.team, "usa");
  assert.deepEqual(r2.body.player.roles, ["culture"]);
  const me = (await state(pid(51))).body.private;
  assert.ok(me.hands.culture.length === 3);
  // existing roles were not touched
  assert.deepEqual((await state(pid(0))).body.private.me.roles.length, 6);
});

test("reset starts a fresh game with no players", async () => {
  await lobbyWith(3);
  const before = (await state()).body.gameId;
  const r = await host("reset");
  assert.notEqual(r.body.state.gameId, before);
  assert.equal(r.body.state.totalPlayers, 0);
  assert.equal((await state(pid(0))).body.private, null);
});

test("full game with 12 players to the end screen", async () => {
  await lobbyWith(12);
  await host("start");
  await host("next");
  for (let turn = 1; turn <= 6; turn++) {
    let s = (await host("next")).body.state; // event -> decide
    if (s.phase === "end") break;
    assert.equal(s.phase, "decide");
    for (let i = 0; i < 12; i++) {
      const p = (await state(pid(i))).body.private;
      for (const [role, hand] of Object.entries(p.hands)) {
        const card = hand[i % 3];
        const target = CARD[card].role === "culture" ? p.targets[card][0] : undefined;
        await pick(pid(i), role, card, target);
      }
    }
    await host("close");
    s = (await host("next")).body.state;
    assert.equal(s.phase, "reveal");
    assert.equal(s.turn, turn);
    s = (await host("next")).body.state;
    if (s.phase === "end") break;
  }
  const end = (await state()).body;
  assert.equal(end.phase, "end");
  assert.equal(end.end.scores.length, 5);
  assert.ok(end.end.awards.length >= 4);
});
