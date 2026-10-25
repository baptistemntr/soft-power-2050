// End-to-end test: 1 host + 12 headless players play a full game against `netlify dev`.
// Usage:  HOST_KEY=<local test key> netlify dev        (in another terminal)
//         HOST_KEY=<same key> node scripts/e2e.mjs [http://localhost:8888]
// Screenshots of every phase go to ./screenshots (host 1920×1080, players 390×844 and 1366×768).
// Timers are accelerated with the host "Close now" action (same code path as the timer running out).
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || process.env.BASE || "http://localhost:8888";
const KEY = process.env.HOST_KEY;
if (!KEY) { console.error("Set HOST_KEY (the same value netlify dev was started with)."); process.exit(1); }
const OUT = new URL("../screenshots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

async function loadPlaywright() {
  try { return await import("playwright"); } catch { /* not local */ }
  const root = execSync("npm root -g").toString().trim();
  return createRequire(`${root}/`)("playwright");
}
const { chromium } = await loadPlaywright();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const issues = [];
const consoleErrors = [];
const host = async (action, extra = {}) => {
  const r = await fetch(`${BASE}/api/host`, { method: "POST", body: JSON.stringify({ key: KEY, action, ...extra }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${action}: ${j.error}`);
  return j.state;
};

// Press → on the host screen and check the server really moved to one of the expected phases.
async function press(hp, expected, label) {
  await hp.keyboard.press("ArrowRight");
  for (let k = 0; k < 24; k++) {
    const st = await (await fetch(`${BASE}/api/state`)).json();
    if (expected.includes(st.phase)) return st;
    await sleep(500);
  }
  const st = await (await fetch(`${BASE}/api/state`)).json();
  issues.push(`${label}: host → did not reach ${expected.join("/")} (server phase ${st.phase})`);
  return st;
}

// ------------------------------------------------------------------ layout checks
async function checkLayout(page, label) {
  const res = await page.evaluate(() => {
    const out = [];
    const W = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > W + 1) out.push(`horizontal scroll (${document.documentElement.scrollWidth} > ${W})`);
    const sel = ".tpanel, .tpanel *, .lobby .col li, .gcard .name, .teambtn, .tab, .choice, .target, .award, .step, .recap, .paper h1, .ticker .tick, .ptop *, .chipbtn, .btn";
    for (const el of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || el.closest("[hidden]")) continue;
      if (el.matches(".ticker .tick, .lobby .col li, .pteam")) continue; // ellipsis on purpose
      if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== "auto" && cs.overflowX !== "scroll" && !el.closest(".tabs, .tablewrap")) {
        out.push(`overflow: ${el.className || el.tagName} "${(el.textContent || "").trim().slice(0, 40)}" (${el.scrollWidth}>${el.clientWidth})`);
      }
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > W + 1 || r.left < -1) && !el.closest(".tabs, .tablewrap, .spmap")) out.push(`off-screen: ${el.className || el.tagName} "${(el.textContent || "").trim().slice(0, 30)}"`);
    }
    // small touch targets (players)
    if (document.body.classList.contains("player")) {
      for (const el of document.querySelectorAll("button")) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height && r.height < 43.5 && !el.closest("[hidden]")) out.push(`small button (${Math.round(r.height)}px): "${el.textContent.trim().slice(0, 30)}"`);
      }
    }
    // host: team panels must fit their box
    for (const p of document.querySelectorAll(".tpanel")) if (p.scrollHeight > p.clientHeight + 2) out.push(`team panel too tall (${p.scrollHeight}>${p.clientHeight})`);
    return [...new Set(out)].slice(0, 12);
  });
  for (const r of res) issues.push(`[${label}] ${r}`);
}
async function shot(page, name) {
  await page.screenshot({ path: `${OUT}${name}.png`, fullPage: name.startsWith("player") });
  await checkLayout(page, name);
}

// ------------------------------------------------------------------ main
const browser = await chromium.launch();
const NAMES = ["Léa", "Hugo", "Chloé", "Yanis", "Inès", "Tom", "Camille", "Mehdi", "Sarah", "Lucas", "Zoé", "Maximilien"];
try {
  await host("reset");
  const hostCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await hostCtx.addInitScript((k) => localStorage.setItem("sp_host_key", k), KEY);
  const hp = await hostCtx.newPage();
  hp.on("console", (m) => m.type() === "error" && consoleErrors.push(`host: ${m.text()}`));
  hp.on("pageerror", (e) => consoleErrors.push(`host: ${e.message}`));
  await hp.goto(`${BASE}/host.html`);
  await hp.waitForSelector(".lobby");

  // players: 10 phones + 2 laptops
  const players = [];
  for (let i = 0; i < 12; i++) {
    const laptop = i >= 10;
    const ctx = await browser.newContext(laptop ? { viewport: { width: 1366, height: 768 } } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(`p${i}: ${m.text()}`));
    page.on("pageerror", (e) => consoleErrors.push(`p${i}: ${e.message}`));
    page.on("response", async (r) => { if (r.status() >= 400 && r.url().includes("/api/")) consoleErrors.push(`p${i} [turn ${globalThis.curTurn} ${new Date().toISOString().slice(14,19)}]: ${r.status()} ${r.url().split("/api/")[1]} ${await r.text().catch(() => "")} ${r.request().postData() || ""}`); });
    players.push({ i, page, laptop, name: NAMES[i] });
  }
  await Promise.all(players.map(async (p) => {
    await p.page.goto(`${BASE}/`);
    await p.page.waitForSelector("#joinForm");
  }));
  await shot(players[0].page, "player-phone-01-join");
  for (const p of players) {
    await p.page.fill("#nick", p.name);
    await p.page.click('[data-team="auto"]');
    await p.page.click('#joinForm button[type="submit"]');
    await sleep(150);
  }
  // French is the default; one laptop player switches to English
  await players[11].page.click('[data-lang="en"]').catch(() => issues.push("language switch button missing"));
  await Promise.all(players.map((p) => p.page.waitForSelector(".mates", { timeout: 30000 }).catch(async (e) => { await p.page.screenshot({ path: `${OUT}debug-join-${p.i}.png` }); throw e; })));
  await sleep(2000);
  await shot(hp, "host-01-lobby");
  await shot(players[0].page, "player-phone-02-waiting");

  // start
  await hp.click("#ovStart");
  await Promise.all(players.map((p) => p.page.waitForSelector(".rolecard", { timeout: 15000 })));
  await sleep(800);
  await shot(hp, "host-02-roles");
  await shot(players[0].page, "player-phone-03-roles");
  await shot(players[10].page, "player-laptop-03-roles");

  const roleOf = async (p) => p.page.evaluate(async () => {
    const s = await (await fetch(`/api/state?pid=${localStorage.getItem("sp_pid")}`)).json();
    return s.private.me;
  });
  for (const p of players) p.me = await roleOf(p);

  for (let turn = 1; turn <= 6; turn++) {
    globalThis.curTurn = turn;
    await press(hp, ["event"], `turn ${turn} event`);
    await hp.waitForSelector(".paper");
    await Promise.all(players.map((p) => p.page.waitForSelector(".eventbox", { timeout: 15000 })));
    await sleep(900);
    if (turn === 1) { await shot(hp, "host-03-event"); await shot(players[0].page, "player-phone-04-event"); }

    await press(hp, ["decide"], `turn ${turn} decide`);
    await Promise.all(players.map((p) => p.page.waitForSelector(".tabpanel", { timeout: 15000 })));
    // every player picks a card for each of their roles
    await Promise.all(players.map(async (p) => {
      const pg = p.page;
      for (const role of p.me.roles) {
        if (await pg.locator(`[data-tab="${role}"]`).count()) { await pg.locator(`[data-tab="${role}"]`).click(); await sleep(150); }
        if (role === "diplomat") {
          if (turn % 2 === 1) {
            const to = pg.locator("[data-offer-to]");
            const nTo = await to.count();
            if (nTo) {
              await to.nth((p.i + turn) % nTo).click();
              await pg.click(`[data-offer-type="${["trade", "climate", "culture"][turn % 3]}"]`);
              await pg.click("#sendOffer");
              await sleep(300);
            }
          }
          continue;
        }
        const cards = pg.locator(".tabpanel [data-card]");
        const nc = await cards.count();
        if (!nc) continue;
        await cards.nth((p.i + turn) % nc).click();
        await sleep(200);
        if (role === "culture") {
          const t = await pg.waitForSelector("#picker [data-target]", { timeout: 5000 }).catch(() => null);
          if (t) { const all = pg.locator("#picker [data-target]"); await all.nth((p.i + turn) % (await all.count())).click(); }
        }
        await sleep(250);
      }
    }));
    await sleep(2500);
    // diplomats answer offers received
    await Promise.all(players.filter((p) => p.me.roles.includes("diplomat")).map(async (p) => {
      if (await p.page.locator('[data-tab="diplomat"]').count()) await p.page.locator('[data-tab="diplomat"]').click();
      await sleep(300);
      const acc = p.page.locator('[data-reply][data-accept="1"]:not([disabled])');
      if (await acc.count()) { await acc.first().click(); await sleep(300); }
    }));
    await sleep(1600);
    if (turn === 1) {
      await shot(hp, "host-04-decide");
      const phone = players.find((p) => !p.laptop && p.me.roles.length > 1) || players[0];
      await shot(phone.page, "player-phone-05-decide");
      await shot(players[10].page, "player-laptop-05-decide");
      const dip = players.find((p) => p.me.roles.includes("diplomat") && !p.laptop);
      if (dip) { if (await dip.page.$('[data-tab="diplomat"]')) await dip.page.click('[data-tab="diplomat"]'); await sleep(400); await shot(dip.page, "player-phone-06-diplomat"); }
      const cul = players.find((p) => p.me.roles.includes("culture") && !p.laptop);
      if (cul) {
        if (await cul.page.$('[data-tab="culture"]')) await cul.page.click('[data-tab="culture"]');
        await sleep(300);
        const c = cul.page.locator(".tabpanel [data-card]");
        if (await c.count()) { await c.first().click(); await sleep(500); await shot(cul.page, "player-phone-07-culture-target"); }
        const all = cul.page.locator("#picker [data-target]");
        if (await all.count()) await all.first().click();
      }
    }
    // validate
    console.log(`turn ${turn}: closing decisions at ${new Date().toISOString().slice(14, 19)}`);
    await hp.keyboard.press("ArrowRight"); // close decisions
    for (let k = 0; k < 20; k++) {
      const ph = (await (await fetch(`${BASE}/api/state`)).json()).phase;
      if (ph === "validate") break;
      if (k === 19) { issues.push(`turn ${turn}: host key press did not close decisions`); await host("close"); }
      await sleep(500);
    }
    await Promise.all(players.map((p) => p.page.waitForFunction(() => !!document.querySelector("#confirmPres, .choices"), null, { timeout: 15000 })
      .catch(async (e) => { await p.page.screenshot({ path: `${OUT}debug-validate-p${p.i}.png`, fullPage: true }); console.log(`p${p.i}`, p.me.roles, (await p.page.innerText("#app")).slice(0, 300)); throw e; })));
    await sleep(800);
    for (const p of players) {
      const pg = p.page;
      if (p.me.roles.includes("president") && await pg.$("#confirmPres")) {
        if (turn === 2) {
          const v = pg.locator("[data-veto]");
          if (await v.count()) { await v.first().click(); await sleep(200); }
        }
        if (turn === 2 && await pg.$("#togglePower")) {
          await pg.click("#togglePower"); await sleep(250);
          const tg = pg.locator("#powerPicker [data-target]");
          const n = await tg.count();
          for (let k = 0; k < Math.min(3, n); k++) { await tg.nth(k).click(); await sleep(200); }
        }
        await pg.click("#confirmPres");
        await sleep(300);
      }
      if (p.me.roles.includes("voice") && turn === 3 && await pg.$('[data-strike="eco"]')) {
        await pg.click('[data-strike="eco"]'); await sleep(200); await pg.click("#confirmStrike"); await sleep(300);
      }
    }
    await sleep(1500);
    if (turn === 2) {
      const pres = players.find((p) => p.me.roles.includes("president") && !p.laptop);
      if (pres) await shot(pres.page, "player-phone-08-validate-president");
      const other = players.find((p) => !p.me.roles.includes("president") && !p.laptop);
      if (other) await shot(other.page, "player-phone-09-validate-waiting");
      await shot(hp, "host-05-validate");
    }
    // reveal
    const before = await hp.evaluate(() => document.querySelectorAll(".tile[data-owner]").length);
    await hp.keyboard.press("ArrowRight");
    await hp.waitForSelector(".tpanel .dl", { timeout: 75000 });
    const after = await hp.evaluate(() => document.querySelectorAll(".tile[data-owner]").length);
    const st = await (await fetch(`${BASE}/api/state`)).json();
    console.log(`turn ${turn}: ${st.changes.filter((c) => !c.tier).length} map changes, owned ${before}→${after}, planet ${st.globalPlanet}, headlines ${st.headlines.length}`);
    if (turn === 2) {
      const r = st.reveal;
      if (!Object.keys(r.vetoes).length) issues.push("turn 2: no veto recorded");
      if (!Object.keys(r.powers).length) issues.push("turn 2: no super-power recorded");
    }
    if (turn === 3 && !Object.keys(st.reveal.strikes).length) issues.push("turn 3: no strike recorded");
    if (turn <= 2) { await shot(hp, `host-06-reveal-t${turn}`); }
    await Promise.all(players.map((p) => p.page.waitForSelector(".deltas", { timeout: 45000 })));
    if (turn === 1) { await shot(players[0].page, "player-phone-10-reveal"); await shot(players[11].page, "player-laptop-10-reveal"); }
    if (st.gameOver) { console.log("planet game over"); break; }
  }

  // end
  await hp.keyboard.press("ArrowRight");
  await hp.waitForSelector(".podium", { timeout: 15000 });
  await sleep(1200);
  await shot(hp, "host-07-end-podium");
  await hp.keyboard.press("ArrowRight"); await sleep(1600);
  await shot(hp, "host-08-end-awards");
  await hp.keyboard.press("ArrowRight"); await sleep(800);
  await shot(hp, "host-09-end-debate");
  await Promise.all(players.map((p) => p.page.waitForSelector(".ranking", { timeout: 15000 })));
  await shot(players[0].page, "player-phone-11-end");
  await shot(players[10].page, "player-laptop-11-end");

  // reload keeps the player in place
  await players[3].page.reload();
  await players[3].page.waitForSelector(".ranking", { timeout: 15000 });
} catch (e) {
  issues.push(`FATAL: ${e.message}`);
  console.error(e);
} finally {
  await browser.close();
}

console.log(`\nScreenshots in ${OUT}`);
if (consoleErrors.length) console.log(`Console errors:\n  ${[...new Set(consoleErrors)].slice(0, 20).join("\n  ")}`);
if (issues.length) { console.log(`Issues (${issues.length}):\n  ${issues.join("\n  ")}`); process.exitCode = 1; }
else console.log("✅ No layout issue detected, full game played.");
