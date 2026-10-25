import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COUNTRIES, COUNTRY, NEIGHBORS, TEAMS, TEAM_IDS, CARDS, CARD_ROLES, DECKS, EVENTS, EVENT,
  NEEDS, GAUGES, ROLES, TEXT, FIRST_EVENT, LAST_EVENT, YEARS, SEA_ROUTES,
  LANGS, DEFAULT_LANG, CONTENT_FR, ERRORS_FR, DIPLO_TYPES,
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
  const blob = JSON.stringify({ TEXT: TEXT.en, EVENTS, CARDS, ROLES, TEAMS }).toLowerCase();
  for (const w of ["conquer", "conquest", "capture", "convert", "rally", "colon", "invade", "annex"]) {
    assert.ok(!blob.includes(w), `forbidden word: ${w}`);
  }
});

// ---------------------------------------------------------------- languages
const shape = (o) => (o && typeof o === "object" ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, shape(o[k])])) : typeof o);
const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort().join(",");
function walk(a, b, path, fn) {
  if (typeof a === "string") return fn(a, b, path);
  for (const k of Object.keys(a)) walk(a[k], b[k], `${path}.${k}`, fn);
}

test("French is the default language and both languages exist", () => {
  assert.equal(DEFAULT_LANG, "fr");
  assert.deepEqual([...LANGS].sort(), ["en", "fr"]);
});

test("TEXT.fr has the same keys as TEXT.en and only known placeholders", () => {
  assert.deepEqual(shape(TEXT.fr), shape(TEXT.en));
  walk(TEXT.en, TEXT.fr, "TEXT", (en, fr, path) => {
    assert.ok(fr && fr.trim(), `${path} is empty in French`);
    const known = [...placeholders(en).split(","), ...(path.includes("headlines") ? ["{team}", "{tflag}", "{adj}"] : [])]; // team vars are always provided
    for (const ph of placeholders(fr).split(",").filter(Boolean)) assert.ok(known.includes(ph), `${path}: unknown ${ph}`);
  });
});

test("every piece of game content has a French version", () => {
  for (const c of CARDS) assert.ok(CONTENT_FR.cards[c.id] && CONTENT_FR.cards[c.id][0] && CONTENT_FR.cards[c.id][1], c.id);
  for (const e of EVENTS) {
    const fr = CONTENT_FR.events[e.id];
    assert.ok(fr && fr.length === 3 && fr.every(Boolean), e.id);
    assert.equal(placeholders(fr[2]), placeholders(e.means), `${e.id} placeholders`);
  }
  for (const r of ROLES) assert.ok(CONTENT_FR.roles[r.id].name && CONTENT_FR.roles[r.id].desc && CONTENT_FR.roles[r.id].tip, r.id);
  for (const c of COUNTRIES) assert.ok(CONTENT_FR.countries[c.id], c.id);
  for (const t of TEAMS) assert.ok(CONTENT_FR.teams[t.id].name && CONTENT_FR.teams[t.id].power.name && CONTENT_FR.teams[t.id].power.desc, t.id);
  for (const n of Object.keys(NEEDS)) assert.ok(CONTENT_FR.needs[n], n);
  for (const g of GAUGES) assert.ok(CONTENT_FR.gauges[g].label && CONTENT_FR.gauges[g].short, g);
  for (const d of Object.keys(DIPLO_TYPES)) assert.ok(CONTENT_FR.diplo[d].name && CONTENT_FR.diplo[d].desc, d);
});

test("every server error message has a French translation", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const dir = new URL("../netlify/functions/", import.meta.url);
  const msgs = new Set();
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), "utf8");
    for (const m of src.matchAll(/fail\(\d+, "([^"]+)"\)/g)) msgs.add(m[1]);
    for (const m of src.matchAll(/\? "([^"]+)" : "([^"]+)"/g)) { msgs.add(m[1]); msgs.add(m[2]); }
  }
  for (const m of msgs) if (!["GET only", "POST only"].includes(m)) assert.ok(ERRORS_FR[m], `missing French error: ${m}`);
});

test("no colonial vocabulary in French texts either", () => {
  const blob = JSON.stringify({ TEXT: TEXT.fr, CONTENT_FR }).toLowerCase();
  for (const w of ["conquér", "conquête", "conquis", "captur", "convertir", "converti", "rallier", "colonis", "colonie", "envahi", "annex"]) {
    assert.ok(!blob.includes(w), `forbidden word: ${w}`);
  }
});
