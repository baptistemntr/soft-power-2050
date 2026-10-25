// Load test: 30 players poll every 1.5 s and keep clicking cards for the whole decide phase,
// then we check that the last choice of every role was kept (no lost write).
// Usage:  HOST_KEY=<local test key> netlify dev          (in another terminal)
//         HOST_KEY=<same key> node scripts/load.mjs [http://localhost:8888] [seconds=150] [players=30]
const BASE = process.argv[2] || "http://localhost:8888";
const SECONDS = Number(process.argv[3]) || 150;
const N = Number(process.argv[4]) || 30;
const KEY = process.env.HOST_KEY;
if (!KEY) { console.error("Set HOST_KEY (the same value netlify dev was started with)."); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stats = { requests: 0, errors: 0, byStatus: {}, latencies: [], picks: 0, rejectedPicks: 0 };
const errorSamples = [];

async function call(path, body) {
  const t0 = Date.now();
  let status = 0, json = null;
  try {
    const res = await fetch(`${BASE}${path}`, body ? { method: "POST", body: JSON.stringify(body) } : {});
    status = res.status;
    json = await res.json().catch(() => null);
  } catch (e) { json = { error: e.message }; }
  stats.requests++;
  stats.latencies.push(Date.now() - t0);
  stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
  if (status !== 200) { stats.errors++; if (status >= 500) stats.serverErrors = (stats.serverErrors || 0) + 1; if (errorSamples.length < 10) errorSamples.push(`${status} ${path} ${JSON.stringify(json)}`); }
  return { status, json };
}
const host = async (action, extra = {}) => (await call("/api/host", { key: KEY, action, ...extra })).json;

console.log(`Load test: ${N} players, ${SECONDS} s against ${BASE}`);
await host("reset");
const players = Array.from({ length: N }, (_, i) => ({ pid: `load${String(i).padStart(4, "0")}${Math.random().toString(36).slice(2, 8)}`, name: `Bot ${i + 1}` }));
await Promise.all(players.map((p) => call("/api/join", { pid: p.pid, name: p.name, team: "auto" })));
await host("balance");
await host("start");
await host("next"); // event
let st = (await host("next")).state; // decide
await host("setTimer", { seconds: Math.max(60, SECONDS + 10) });
console.log(`phase=${st.phase}, players=${st.totalPlayers}`);

const lastOk = {}; // "team/role" -> { card, target, at }
const endAt = Date.now() + SECONDS * 1000;
const stopClicksAt = endAt - 1500;

async function playerLoop(p) {
  await sleep(Math.random() * 1500);
  let nextClick = Date.now() + 2000 + Math.random() * 6000;
  while (Date.now() < endAt) {
    const { json } = await call(`/api/state?pid=${p.pid}`);
    const priv = json && json.private;
    if (priv && priv.hands && Date.now() >= nextClick && Date.now() < stopClicksAt) {
      for (const [role, hand] of Object.entries(priv.hands)) {
        const card = hand[Math.floor(Math.random() * hand.length)];
        const body = { pid: p.pid, role, card };
        if (priv.targets && priv.targets[card]) { const t = priv.targets[card]; body.target = t[Math.floor(Math.random() * t.length)]; }
        let r = await call("/api/pick", body);
        for (let k = 0; k < 2 && r.status >= 500; k++) { await sleep(350 * (k + 1)); r = await call("/api/pick", body); } // same retry as the real client
        stats.picks++;
        if (r.status === 200) {
          const k = `${priv.me.team}/${role}`;
          // keep the latest by server time
          if (!lastOk[k] || r.json.pick.at >= lastOk[k].at) lastOk[k] = { card, target: body.target, at: r.json.pick.at };
        } else stats.rejectedPicks++;
      }
      nextClick = Date.now() + 4000 + Math.random() * 8000;
    }
    await sleep(1500);
  }
  return priv => priv;
}

const t0 = Date.now();
const ticker = setInterval(() => process.stdout.write(`\r${Math.round((Date.now() - t0) / 1000)}s  requests=${stats.requests} errors=${stats.errors} picks=${stats.picks}   `), 2000);
await Promise.all(players.map(playerLoop));
clearInterval(ticker);
await sleep(1500);
await host("close");

// verify: each team's view of its picks equals the last successful pick of each role
let lost = 0, checked = 0;
const seenTeams = new Set();
for (const p of players) {
  const { json } = await call(`/api/state?pid=${p.pid}`);
  const team = json.private.me.team;
  if (seenTeams.has(team)) continue;
  seenTeams.add(team);
  for (const [role, pick] of Object.entries(json.private.teamPicks)) {
    const want = lastOk[`${team}/${role}`];
    if (!want) continue;
    checked++;
    if (want.card !== pick.card || (want.target || undefined) !== (pick.target || undefined)) {
      lost++;
      console.log(`\n❌ ${team}/${role}: expected ${want.card}${want.target ? "@" + want.target : ""}, stored ${pick.card}${pick.target ? "@" + pick.target : ""}`);
    }
  }
  for (const k of Object.keys(lastOk)) if (k.startsWith(`${team}/`) && !json.private.teamPicks[k.split("/")[1]]) { lost++; checked++; console.log(`\n❌ ${k}: pick missing`); }
}
const resolved = await host("reveal");

const lat = stats.latencies.sort((a, b) => a - b);
const pct = (q) => lat[Math.min(lat.length - 1, Math.floor(lat.length * q))];
console.log(`\n\nRequests: ${stats.requests} (${(stats.requests / SECONDS).toFixed(1)}/s) · statuses ${JSON.stringify(stats.byStatus)}`);
console.log(`Latency: p50 ${pct(0.5)} ms · p95 ${pct(0.95)} ms · max ${lat[lat.length - 1]} ms`);
console.log(`Picks: ${stats.picks} sent, ${stats.rejectedPicks} rejected · roles checked: ${checked} · lost: ${lost}`);
console.log(`Reveal: phase=${resolved.state.phase}, headlines=${resolved.state.headlines.length}`);
if (errorSamples.length) console.log(`Error samples:\n  ${errorSamples.join("\n  ")}`);
const ok = stats.errors === 0 && lost === 0 && resolved.state.phase === "reveal";
console.log(ok ? "✅ No error, no lost choice." : "❌ Problems detected.");
process.exitCode = ok ? 0 : 1;
