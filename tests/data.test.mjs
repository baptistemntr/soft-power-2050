import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COUNTRIES, COUNTRY, NEIGHBORS, TEAMS, TEAM_IDS, CARDS, CARD_ROLES, DECKS, EVENTS, EVENT,
  NEEDS, GAUGES, ROLES, TEXT, FIRST_EVENT, LAST_EVENT, YEARS, SEA_ROUTES,
} from "../netlify/lib/data.mjs";

test("28 countries, 5 teams, unique ids", () => {
  assert.equal(COUNTRIES.length, 28);
  assert.equal(TEAMS.length, 5);
  assert.equal(new Set(COUNTRIES.map((c) => c.id)).size, 28);
  for (const t of TEAM_IDS) assert.ok(COUNTRY[t], `team country ${t}`);
});

test("free countries have a valid need and coordinates", () => {
  for (const c of COUNTRIES) {
    if (TEAM_IDS.includes(c.id)) assert.equal(c.need, null);
    else assert.ok(NEEDS[c.need], `${c.id} need ${c.need}`);
    assert.ok(c.x >= 0 && c.x <= 100 && c.y >= 0 && c.y <= 100);
    assert.ok(c.flag && c.name);
  }
});

test("neighbours are symmetric, known and non-reflexive", () => {
  for (const [a, list] of Object.entries(NEIGHBORS)) {
    assert.ok(COUNTRY[a]);
    for (const b of list) {
      assert.ok(COUNTRY[b], `${a} -> ${b}`);
      assert.notEqual(a, b);
      assert.ok(NEIGHBORS[b].includes(a), `${b} should list ${a}`);
    }
  }
  for (const [a, b] of SEA_ROUTES) assert.ok(NEIGHBORS[a].includes(b));
});

test("every team country has at least 4 neighbours, every country at least 2", () => {
  for (const t of TEAM_IDS) assert.ok(NEIGHBORS[t].length >= 4, t);
  for (const c of COUNTRIES) assert.ok(NEIGHBORS[c.id].length >= 2, c.id);
});

test("teams have valid gauges, colours and powers", () => {
  const colors = new Set();
  for (const t of TEAMS) {
    for (const g of GAUGES) assert.ok(Number.isInteger(t.gauges[g]) && t.gauges[g] >= 0 && t.gauges[g] <= 10);
    assert.match(t.color, /^#[0-9A-F]{6}$/i);
    colors.add(t.color);
    assert.ok(t.power && t.power.id && t.power.name);
  }
  assert.equal(colors.size, 5);
});

test("card ids are unique and every card is valid", () => {
  assert.equal(new Set(CARDS.map((c) => c.id)).size, CARDS.length);
  for (const c of CARDS) {
    assert.ok(CARD_ROLES.includes(c.role), c.id);
    assert.ok(c.name && c.emoji && c.flavor, c.id);
    for (const g of GAUGES) assert.ok(Number.isInteger(c.fx[g]), `${c.id}.${g}`);
    assert.deepEqual(Object.keys(c.fx).sort(), [...GAUGES].sort());
    for (const tag of c.tags) assert.ok(NEEDS[tag], `${c.id} tag ${tag}`);
    assert.ok(Number.isInteger(c.rejection));
    if (c.role === "culture") assert.ok(c.influence > 0, c.id);
    else assert.equal(c.influence, 0);
  }
  for (const r of CARD_ROLES) assert.ok(DECKS[r].length >= 6, `deck ${r}`);
});

test("events: unique, texts complete, first/last exist", () => {
  assert.equal(new Set(EVENTS.map((e) => e.id)).size, EVENTS.length);
  assert.equal(EVENTS.length, 12);
  for (const e of EVENTS) assert.ok(e.title && e.subtitle && e.means, e.id);
  assert.ok(EVENT[FIRST_EVENT] && EVENT[LAST_EVENT]);
  assert.deepEqual(YEARS, [2030, 2034, 2038, 2042, 2046, 2050]);
});

test("roles: 6 roles with texts", () => {
  assert.deepEqual(ROLES.map((r) => r.id), ["president", "eco", "ecolo", "culture", "voice", "diplomat"]);
  for (const r of ROLES) assert.ok(r.desc && r.tip && r.emoji);
});

test("no colonial vocabulary in any UI text", () => {
  const blob = JSON.stringify({ TEXT, EVENTS, CARDS, ROLES, TEAMS }).toLowerCase();
  for (const w of ["conquer", "conquest", "capture", "convert", "rally", "colon", "invade", "annex"]) {
    assert.ok(!blob.includes(w), `forbidden word: ${w}`);
  }
});
