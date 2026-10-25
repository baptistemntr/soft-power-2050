// Simulates N bot-only games to check the balancing targets of the spec (§11).
// Usage: npm run simulate            (1000 games)
//        node scripts/simulate.mjs 5000
import * as E from "../netlify/lib/engine.mjs";
import { TEAM_IDS, TEAMS } from "../netlify/lib/data.mjs";
import { rng } from "../netlify/lib/rng.mjs";

export function simulate(n = 1000, seedPrefix = "sim") {
  const wins = Object.fromEntries(TEAM_IDS.map((t) => [t, 0]));
  let winnerZone = 0, gameOvers = 0, changes = 0, turns = 0, backlashes = 0, firstTurnChanges = 0;
  const planetEnd = [];
  const byStyle = { prudent: { games: 0, wins: 0 }, aggressive: { games: 0, wins: 0 } };
  const objectives = {}; // id -> { drawn, done }
  let decidedByObjective = 0;

  for (let i = 0; i < n; i++) {
    const r = rng(`${seedPrefix}:${i}`);
    let g = E.startGame(E.initGame({ gameId: `${seedPrefix}-${i}` }), [], 0);
    for (const t of TEAM_IDS) g.teams[t].botStyle = r() < 0.5 ? "prudent" : "aggressive";
    g = E.advance(g, 0); // roles -> event
    while (g.phase !== "end") {
      g = E.advance(g, 0); // event -> decide
      g = E.resolveTurn(g, {}).game;
      const h = g.history[g.turn];
      changes += h.ownersChanged; turns += 1;
      if (g.turn === 1) firstTurnChanges += h.ownersChanged;
      backlashes += h.backlash.length;
      g = E.advance(g, 0); // reveal -> event / end
    }
    const scores = E.finalScores(g);
    const w = scores[0].team;
    const byZone = scores.slice().sort((a, b) => b.zone - a.zone || b.influence - a.influence)[0].team;
    if (byZone !== w) decidedByObjective += 1;
    for (const s of scores) {
      const id = g.teams[s.team].objective.id;
      objectives[id] = objectives[id] || { drawn: 0, done: 0 };
      objectives[id].drawn += 1;
      if (s.objective) objectives[id].done += 1;
    }
    wins[w] += 1;
    winnerZone += scores[0].zone;
    if (g.gameOver) gameOvers += 1;
    planetEnd.push(g.globalPlanet);
    for (const t of TEAM_IDS) {
      const s = g.teams[t].botStyle;
      byStyle[s].games += 1;
      if (t === w) byStyle[s].wins += 1;
    }
  }
  return {
    games: n,
    winRate: Object.fromEntries(TEAM_IDS.map((t) => [t, wins[t] / n])),
    avgWinnerZone: winnerZone / n,
    gameOverRate: gameOvers / n,
    avgChangesPerTurn: changes / turns,
    avgFirstTurnChanges: firstTurnChanges / n,
    avgBacklashPerGame: backlashes / n,
    avgPlanetEnd: planetEnd.reduce((a, b) => a + b, 0) / n,
    objectiveRate: Object.fromEntries(Object.entries(objectives).map(([k, v]) => [k, v.done / v.drawn])),
    decidedByObjective: decidedByObjective / n,
    styleWinRate: Object.fromEntries(Object.entries(byStyle).map(([k, v]) => [k, v.wins / Math.max(1, v.games)])),
  };
}

export function checkTargets(res) {
  const rates = Object.values(res.winRate);
  return {
    "win rate per country in [10%, 30%]": rates.every((x) => x >= 0.1 && x <= 0.3),
    "winner zone in [6, 10]": res.avgWinnerZone >= 6 && res.avgWinnerZone <= 10,
    "planet game over in [20%, 40%]": res.gameOverRate >= 0.2 && res.gameOverRate <= 0.4,
    "owner changes per turn >= 3": res.avgChangesPerTurn >= 3,
    "backlashes per game ~1 (0.5..1.5)": res.avgBacklashPerGame >= 0.5 && res.avgBacklashPerGame <= 1.5,
  };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const n = Number(process.argv[2]) || 1000;
  const t0 = Date.now();
  const res = simulate(n);
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  console.log(`\nSOFT POWER 2050 — ${n} simulated games (${Date.now() - t0} ms)\n`);
  console.log("Win rate per country:");
  for (const t of TEAMS) console.log(`  ${t.flag} ${t.name.padEnd(7)} ${pct(res.winRate[t.id])}`);
  console.log(`Average winner zone:        ${res.avgWinnerZone.toFixed(2)} countries`);
  console.log(`Planet game over:           ${pct(res.gameOverRate)}   (avg final planet ${res.avgPlanetEnd.toFixed(1)}/50)`);
  console.log(`Owner changes per turn:     ${res.avgChangesPerTurn.toFixed(2)}   (turn 1: ${res.avgFirstTurnChanges.toFixed(2)})`);
  console.log(`Cultural backlashes/game:   ${res.avgBacklashPerGame.toFixed(2)}`);
  console.log(`Secret objectives fulfilled: ${Object.entries(res.objectiveRate).map(([k, v]) => `${k} ${pct(v)}`).join(" · ")}`);
  console.log(`Games where the objective changed the winner: ${pct(res.decidedByObjective)}`);
  console.log(`Win rate by bot style:      prudent ${pct(res.styleWinRate.prudent)} · aggressive ${pct(res.styleWinRate.aggressive)}`);
  console.log("\nTargets (§11):");
  for (const [k, ok] of Object.entries(checkTargets(res))) console.log(`  ${ok ? "✅" : "❌"} ${k}`);
  console.log("\nConstants:", JSON.stringify(E.C));
}
