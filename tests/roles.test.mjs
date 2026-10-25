import { test } from "node:test";
import assert from "node:assert/strict";
import { assignRoles, lateJoinRoles, leastPopulated, balanceTeams, startGame, initGame, COHOLD_ORDER } from "../netlify/lib/engine.mjs";
import { ROLE_IDS, TEAM_IDS } from "../netlify/lib/data.mjs";

const covered = (assign) => new Set(assign.flat());

test("n = 0: bot team (no roles)", () => {
  assert.deepEqual(assignRoles(0), []);
});

test("n = 1: one player holds all six roles", () => {
  assert.deepEqual(assignRoles(1), [ROLE_IDS]);
});

test("n = 2..5 follow the spec table", () => {
  assert.deepEqual(assignRoles(2), [["president", "culture", "diplomat"], ["eco", "ecolo", "voice"]]);
  assert.deepEqual(assignRoles(3), [["president", "diplomat"], ["eco", "voice"], ["ecolo", "culture"]]);
  assert.deepEqual(assignRoles(4), [["president", "diplomat"], ["eco"], ["ecolo", "voice"], ["culture"]]);
  assert.deepEqual(assignRoles(5), [["president", "diplomat"], ["eco"], ["ecolo"], ["culture"], ["voice"]]);
});

test("n = 6: one role each", () => {
  assert.deepEqual(assignRoles(6), ROLE_IDS.map((r) => [r]));
});

test("n = 7, 8, 9: co-holders in order culture, eco, ecolo", () => {
  assert.deepEqual(assignRoles(7).slice(6), [["culture"]]);
  assert.deepEqual(assignRoles(8).slice(6), [["culture"], ["eco"]]);
  assert.deepEqual(assignRoles(9).slice(6), [["culture"], ["eco"], ["ecolo"]]);
});

test("for every n = 1..9 all six roles are covered, each player has >= 1 role", () => {
  for (let n = 1; n <= 9; n++) {
    const a = assignRoles(n);
    assert.equal(a.length, n, `n=${n}`);
    assert.equal(covered(a).size, 6, `n=${n}`);
    for (const r of a) assert.ok(r.length >= 1);
    // within the first 6 players a role is never held twice
    const firsts = a.slice(0, 6).flat();
    assert.equal(new Set(firsts).size, firsts.length, `n=${n} duplicates`);
  }
});

test("co-holder order cycles after 12 players", () => {
  const a = assignRoles(13);
  assert.deepEqual(a.slice(6).map((r) => r[0]), [...COHOLD_ORDER, "culture"]);
});

test("late joiners: co-holders, or all roles if the team was a bot", () => {
  assert.deepEqual(lateJoinRoles(0, 0), ROLE_IDS);
  assert.deepEqual(lateJoinRoles(3, 0), ["culture"]);
  assert.deepEqual(lateJoinRoles(3, 1), ["eco"]);
});

test("leastPopulated picks the smallest team, ties in map order", () => {
  assert.equal(leastPopulated({ usa: 2, fra: 1, swe: 1, chn: 3, bra: 2 }), "fra");
  assert.equal(leastPopulated({}), "usa");
  assert.equal(leastPopulated({ usa: 1, fra: 1, swe: 1, chn: 1, bra: 0 }), "bra");
});

test("balanceTeams spreads players round-robin by join time", () => {
  const players = Array.from({ length: 12 }, (_, i) => ({ pid: `p${i}`, joinedAt: i }));
  const m = balanceTeams(players);
  const counts = {};
  for (const t of Object.values(m)) counts[t] = (counts[t] || 0) + 1;
  for (const t of TEAM_IDS) assert.ok(counts[t] === 2 || counts[t] === 3);
});

test("startGame assigns roles by join order and marks empty teams as bots", () => {
  const players = [
    { pid: "b", name: "B", team: "fra", joinedAt: 2 },
    { pid: "a", name: "A", team: "fra", joinedAt: 1 },
    { pid: "c", name: "C", team: "usa", joinedAt: 3 },
  ];
  const g = startGame(initGame({ gameId: "r1" }), players, 1000);
  assert.equal(g.phase, "roles");
  assert.deepEqual(g.roster.a.roles, ["president", "culture", "diplomat"]);
  assert.deepEqual(g.roster.b.roles, ["eco", "ecolo", "voice"]);
  assert.deepEqual(g.roster.c.roles, ROLE_IDS);
  assert.equal(g.teams.fra.bot, false);
  assert.equal(g.teams.usa.bot, false);
  assert.equal(g.teams.swe.bot, true);
  assert.equal(g.teams.chn.bot, true);
});
