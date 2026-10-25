/* SOFT POWER 2050 — host screen (projected). Polls /api/state every 1.5 s, drives the game through /api/host. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
  };
  const KEY_STORE = "sp_host_key";

  let D = null;            // static data
  let S = null;            // last state
  let map = null;
  let offset = 0;          // serverNow - Date.now()
  let hostKey = store.get(KEY_STORE) || "";
  let animatedTurn = Number(sessionStorage.getItem("sp_animated") || 0);
  let animating = false;
  let revealDone = false;
  let endSlide = 0;
  let tickerIdx = 0, tickerList = [], tickerTimer = null;
  let lastRendered = "";
  let resetArmed = 0;
  let qrFor = "";

  const T = () => D.text;
  const TEAM = () => Object.fromEntries(D.teams.map((t) => [t.id, t]));
  const fill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ""));
  const nowServer = () => Date.now() + offset;

  // ------------------------------------------------------------------ API
  async function getJSON(url, opts) {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined, ...opts });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { status: res.status });
    return body;
  }
  let inFlight = false;
  async function hostAction(action, extra) {
    if (!hostKey) { openControl("Enter the host key first."); return null; }
    if (inFlight) return null; // ignore double presses while an action is running
    inFlight = true;
    try {
      for (let i = 0; ; i++) {
        try {
          const r = await getJSON("/api/host", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: hostKey, action, ...(extra || {}) }) });
          msg("");
          onState(r.state);
          return r.state;
        } catch (e) {
          if (e.status === 403) { msg("Wrong host key."); openControl(); return null; }
          // network / server hiccup: host actions are idempotent, retry twice
          if ((!e.status || e.status >= 500) && i < 2) { flash(`⏳ Retrying "${action}"…`); await new Promise((r) => setTimeout(r, 800 * (i + 1))); continue; }
          msg(e.message); flash(`⚠️ ${e.message}`);
          return null;
        }
      }
    } finally { inFlight = false; }
  }
  function flash(t) { $("ticker").innerHTML = `<span class="tick">${esc(t)}</span>`; tickerList = []; }
  async function poll() {
    try {
      const headers = hostKey ? { "x-host-key": hostKey } : {};
      const s = await getJSON("/api/state", { headers });
      onState(s);
    } catch { /* keep the last state on screen */ }
    setTimeout(poll, 1500);
  }
  function msg(t) { $("ctlMsg").textContent = t || ""; }
  function openControl(t) { $("control").open = true; if (t) msg(t); $("keyInput").focus(); }

  // ------------------------------------------------------------------ state
  function onState(s) {
    if (!s) return;
    if (s.serverNow) {
      const o = s.serverNow - Date.now();
      offset = Math.abs(o - offset) > 2000 || !S ? o : offset * 0.8 + o * 0.2;
    }
    const prev = S;
    S = s;
    if (prev && prev.gameId !== s.gameId) { animatedTurn = 0; sessionStorage.setItem("sp_animated", "0"); endSlide = 0; }
    if (!prev || prev.phase !== s.phase || prev.turn !== s.turn) { revealDone = false; if (s.phase !== "end") endSlide = 0; }
    render();
  }

  // ------------------------------------------------------------------ render
  function render() {
    if (!S || !D) return;
    renderTop();
    renderTeams();
    renderPlanet();
    renderControl();
    if (S.phase === "nogame") return renderNoGame();
    if (!animating) {
      if (S.phase === "reveal" && S.resolvedTurn === S.turn && animatedTurn !== S.turn) startReveal();
      else map.update(S, {});
    }
    renderOverlay();
    renderTicker();
    renderNote();
  }

  function renderTop() {
    const t = T();
    $("turn").textContent = S.turn > 0 ? fill(t.turnLabel, { year: S.year, turn: S.turn, turns: S.turns }) : "2030";
    $("phase").textContent = S.phase === "nogame" ? "Waiting" : (S.phase === "validate" && S.locked ? "Locked 🔒" : t.phases[S.phase] || S.phase);
    const alertOn = S.planetAlert && S.phase !== "lobby";
    $("planetAlert").hidden = !alertOn;
    if (alertOn) $("planetAlert").textContent = `${t.planetAlert} — ${S.globalPlanet}/50`;
  }

  function tickTimer() {
    if (S && D) {
      const el = $("timer"), bar = $("progress");
      if (S.phaseEndsAt && ["decide", "validate", "event", "roles"].includes(S.phase) && !(S.phase === "validate" && S.locked)) {
        const left = Math.max(0, Math.ceil((S.phaseEndsAt - nowServer()) / 1000));
        const total = S.phase === "decide" ? S.decideSeconds : 30;
        el.textContent = `${String(Math.floor(left / 60)).padStart(1, "0")}:${String(left % 60).padStart(2, "0")}`;
        el.classList.toggle("urgent", left <= 10 && (S.phase === "decide" || S.phase === "validate"));
        bar.style.width = `${Math.max(0, Math.min(100, (left / total) * 100))}%`;
        // decide just expired on the clock: show validate without waiting for the next poll
        if (left === 0 && S.phase === "decide") { S.phase = "validate"; S.phaseEndsAt = S.phaseEndsAt + 30000; render(); }
      } else {
        el.textContent = S.phase === "validate" && S.locked ? "0:00" : "";
        el.classList.remove("urgent");
        bar.style.width = "0%";
      }
    }
    requestAnimationFrame(() => setTimeout(tickTimer, 250));
  }

  function segs(v, color) {
    let h = "";
    for (let i = 0; i < 10; i++) h += `<i class="${i < v ? "on" : ""}${i < v && v <= 2 ? " low" : ""}" ${i < v && v > 2 ? `style="--seg:${color}"` : ""}></i>`;
    return `<div class="segs" aria-hidden="true">${h}</div>`;
  }
  function gaugeRow(k, v, color) {
    const g = D.gaugeInfo[k];
    return `<div class="gauge" title="${esc(g.label)}"><span class="icon">${g.icon}</span>${segs(v, color)}<span class="val">${v}</span></div>`;
  }
  function fire(r) {
    let h = "";
    for (let i = 0; i < 5; i++) h += `<span class="${i < r ? "" : "off"}">🔥</span>`;
    return `<span class="fire" aria-label="Backlash ${r} of 5">${h}</span>`;
  }

  function renderTeams() {
    const t = T();
    const leader = S.phase !== "lobby" ? D.teams.map((x) => x.id).sort((a, b) => S.teams[b].zone - S.teams[a].zone)[0] : null;
    const roleEmoji = Object.fromEntries(D.roles.map((r) => [r.id, r.emoji]));
    $("teams").innerHTML = D.teams.map((team) => {
      const st = S.teams[team.id];
      const n = st.players.length;
      let who = esc(st.bot ? t.bot : `${n} player${n === 1 ? "" : "s"}`);
      if (S.phase === "reveal" && revealDone && S.reveal && S.reveal.deltas[team.id]) {
        const d = S.reveal.deltas[team.id];
        const parts = [...D.gauges.map((k) => [D.gaugeInfo[k].icon, d[k]]), ["🔥", d.rejection]].filter(([, v]) => v)
          .map(([i, v]) => `<b class="${v > 0 ? "pos" : "neg"}">${i}${v > 0 ? "+" : "−"}${Math.abs(v)}</b>`);
        who = `<span class="dl">${parts.join(" ") || "no change"}</span>`;
      }
      const showPills = (S.phase === "decide" || S.phase === "validate") && !st.bot;
      const pills = showPills
        ? `<div class="pills">${D.roles.map((r) => `<span class="pill ${st.rolesDone.includes(r.id) || (r.id === "president" && S.phase === "validate" && st.presidentDone) ? "done" : ""}">${r.emoji}${st.rolesDone.includes(r.id) ? " ✓" : ""}</span>`).join("")}</div>`
        : "";
      return `<div class="tpanel t-${team.id}${leader === team.id && st.zone > 0 ? " leader" : ""}">
        <div class="flag" aria-hidden="true">${team.flag}</div>
        <div class="tname">${esc(team.name)} <small>${who}</small></div>
        <div class="zone"><b>${st.zone}</b><span>${esc(t.zone.toLowerCase())}</span></div>
        <div class="body">
          <div class="gauges">${D.gauges.map((k) => gaugeRow(k, st.gauges[k], team.color)).join("")}</div>
          <div class="meta">
            <span>✨ <b class="num">${st.attract.toFixed(1)}</b></span>
            <span>${fire(Math.min(5, st.rejection))}</span>
            <span class="power ${st.powerUsed ? "used" : ""}" title="${esc(team.power.desc)}">${team.power.emoji} ${esc(team.power.name)}</span>
          </div>
          ${pills}
        </div>
      </div>`;
    }).join("");
    void roleEmoji;
  }

  function renderPlanet() {
    const v = S.globalPlanet ?? 24;
    const th = D.thresholds;
    $("planetText").textContent = `${T().planetScore}: ${v}/50 · ⚠ ${th.warn} · ☠ ${th.lose}`;
    $("thermoFill").style.left = `calc(${(v / 50) * 100}% - 3px)`;
    const mw = $("markWarn"), ml = $("markLose");
    mw.style.left = `${(th.warn / 50) * 100}%`; mw.dataset.l = `⚠ ${th.warn}`;
    ml.style.left = `${(th.lose / 50) * 100}%`; ml.dataset.l = `☠ ${th.lose}`;
  }

  function renderNoGame() {
    map.update({ owners: {}, influence: {}, teams: {} }, {});
    const ov = $("overlay");
    ov.hidden = false; ov.className = "overlay";
    ov.innerHTML = `<div class="keybox">
      <h1 class="display" style="font-size:6vh">${esc(T().title)}</h1>
      <p class="muted" style="font-size:2.2vh">${hostKey ? "Opening the game…" : "Enter the host key to open the game."}</p>
      ${hostKey ? "" : `<form id="ovKey"><input id="ovKeyInput" type="password" placeholder="Host key" aria-label="Host key"> <button class="btn primary">Open</button></form>`}
    </div>`;
    const f = $("ovKey");
    if (f) f.onsubmit = (e) => { e.preventDefault(); saveKey($("ovKeyInput").value); };
    if (hostKey && !renderNoGame.tried) { renderNoGame.tried = true; hostAction("check"); }
  }

  function renderOverlay() {
    const ov = $("overlay");
    const t = T();
    const key = `${S.phase}|${S.turn}|${S.phase === "lobby" ? JSON.stringify(S.teams) + S.totalPlayers : ""}|${revealDone}|${endSlide}|${S.gameOver}`;
    if (key === lastRendered && !ov.hidden === needsOverlay()) return;
    lastRendered = key;
    ov.className = "overlay";
    switch (S.phase) {
      case "lobby": {
        ov.hidden = false;
        const url = location.origin + "/";
        ov.innerHTML = `<div class="lobby">
          <div class="qr"><div id="qr"></div><div class="url">${esc(url.replace(/^https?:\/\//, ""))}</div></div>
          <div>
            <h2>${esc(t.join.title)} 📱</h2>
            <div class="muted" style="font-size:2vh">Scan the QR code, pick a nickname and a country. No account needed.</div>
            <div class="cols">${D.teams.map((team) => {
              const names = S.teams[team.id].players;
              return `<div class="col t-${team.id}"><h3><span>${team.flag} ${esc(team.name)}</span><span class="num">${names.length}</span></h3><ul>${names.map((n) => `<li>${esc(n)}</li>`).join("") || `<li class="muted">${esc(t.bot)}</li>`}</ul></div>`;
            }).join("")}</div>
            <div class="total">${S.totalPlayers} player${S.totalPlayers === 1 ? "" : "s"} connected</div>
            <div class="actions"><button class="btn" id="ovBalance">⚖️ Balance teams</button><button class="btn primary" id="ovStart">Start game ▶</button></div>
          </div></div>`;
        qrFor = "";
        drawQR(url);
        $("ovBalance").onclick = () => hostAction("balance");
        $("ovStart").onclick = () => hostAction("start");
        break;
      }
      case "roles":
        ov.hidden = false;
        ov.innerHTML = `<div class="hero"><h1>${esc(t.tagline)}</h1><p>📱 Look at your phone: your role card is waiting.</p><p>Win the biggest zone of influence by 2050 — by making the world <em>want</em> your model. But if the planet falls under ${D.thresholds.lose}/50, everybody loses.</p></div>`;
        break;
      case "event": {
        ov.hidden = false;
        const e = S.event;
        ov.innerHTML = `<article class="paper"><div class="mast"><b>${esc(t.newspaper)}</b><span>${S.year} · Turn ${S.turn}/${S.turns}</span></div>
          <h1>${esc(e.title)}</h1><p class="sub">${esc(e.subtitle)}</p>
          <div class="means"><b>${esc(t.whatItMeans)}</b>${esc(e.means)}<br><span style="opacity:.75">🌡️ Business as usual: every country also loses 🌍 ${D.thresholds.warming} this turn.</span></div></article>`;
        break;
      }
      case "reveal":
        ov.hidden = true;
        break;
      case "end":
        ov.hidden = false;
        ov.innerHTML = endHtml();
        break;
      default:
        ov.hidden = true;
    }
  }
  function needsOverlay() { return ["lobby", "roles", "event", "end"].includes(S.phase); }

  function drawQR(url) {
    const el = $("qr");
    if (!el || qrFor === url) return;
    qrFor = url;
    el.innerHTML = "";
    const size = Math.round(Math.min(window.innerHeight * 0.42, 460));
    if (window.QRCode) new window.QRCode(el, { text: url, width: size, height: size, colorDark: "#0B1022", colorLight: "#ffffff", correctLevel: window.QRCode.CorrectLevel.M });
    else el.textContent = url;
  }

  function endHtml() {
    const t = T();
    const team = TEAM();
    const e = S.end;
    if (!e) return "";
    const lost = S.gameOver;
    const verdict = `<div class="verdict ${lost ? "lost" : "ok"}">${esc(lost ? t.gameOver : t.planetSurvived)}<small>🌍 Common planet: ${S.globalPlanet}/50</small></div>`;
    if (endSlide === 0) {
      const top = e.scores.slice(0, 3);
      const order = [top[1], top[0], top[2]].filter(Boolean);
      const steps = order.map((s) => `<div class="step t-${s.team} p${s.rank}"><div class="rank">${["", "🥇", "🥈", "🥉"][s.rank]}</div><div class="f">${team[s.team].flag}</div><div class="n">${esc(team[s.team].name)}</div><div class="s">${s.zone} countries · ✨ ${s.attract}</div></div>`).join("");
      const others = e.scores.slice(3).map((s) => `${s.rank}. ${team[s.team].flag} ${esc(team[s.team].name)} (${s.zone})`).join(" · ");
      return `<div class="end"><h2>2050 — ${esc(t.phases.end)}</h2>${verdict}<div class="podium ${lost ? "grey" : ""}">${steps}</div><div class="others">${others}</div><div class="hint">→ awards</div></div>`;
    }
    if (endSlide === 1) {
      const cards = e.awards.map((a, i) => `<div class="award t-${a.team}" style="animation-delay:${i * 0.25}s"><div class="t">${esc(t.awards[a.key])}</div><div class="w">${team[a.team].flag} ${esc(team[a.team].name)}</div><div class="v">${esc(a.value)}</div></div>`).join("");
      return `<div class="end"><h2>🏆 Awards</h2><div class="awards">${cards}</div><div class="hint">→ debate</div></div>`;
    }
    return `<div class="end"><div class="muted" style="font-size:2.4vh">Time to debate 🎙️</div><div class="debate">${esc(t.debate)}</div>${verdict}</div>`;
  }

  function renderNote() { $("mapNote").hidden = true; }

  // ------------------------------------------------------------------ ticker
  function renderTicker() {
    let list;
    if ((S.phase === "reveal" || S.phase === "end") && S.headlines.length) list = S.headlines.map((h) => h.text);
    else if (S.phase === "lobby" || S.phase === "nogame") list = [T().tagline];
    else if (S.phase === "validate") list = [S.locked ? "🔒 Choices are locked. Ready to reveal!" : "👑 Presidents are validating: vetoes, super-powers and strikes happen now…", `📰 ${S.event.title}`];
    else if (S.phase === "decide" && S.event) list = [`📰 ${S.event.title}`, `💡 ${S.event.means}`];
    else if (S.event) list = [`📰 ${S.event.title} — ${S.event.subtitle}`];
    else list = [T().tagline];
    const k = list.join("|");
    if (k === tickerList.join("|")) return;
    tickerList = list; tickerIdx = 0;
    showTick();
    clearInterval(tickerTimer);
    if (list.length > 1) tickerTimer = setInterval(() => { if (!animating) { tickerIdx = (tickerIdx + 1) % tickerList.length; showTick(); } }, 4500);
  }
  function showTick(i) {
    if (i != null) tickerIdx = i % Math.max(1, tickerList.length);
    const count = tickerList.length > 1 ? `<span class="count">${tickerIdx + 1}/${tickerList.length}</span>` : "";
    $("ticker").innerHTML = `${count}<span class="tick">${esc(tickerList[tickerIdx] || "")}</span>`;
  }

  // ------------------------------------------------------------------ reveal animation
  async function startReveal() {
    animating = true;
    animatedTurn = S.turn;
    sessionStorage.setItem("sp_animated", String(S.turn));
    const changes = S.changes || [];
    map.update(S, { animateFrom: changes });
    renderTicker();
    await new Promise((r) => setTimeout(r, 600));
    await map.animate(changes, { onStep: (_, i) => showTick(i) });
    animating = false;
    revealDone = true;
    map.update(S, {});
    render();
  }

  // ------------------------------------------------------------------ controls
  function renderControl() {
    const s = S;
    const btn = $("btnNext");
    btn.textContent = nextLabel();
    $("btnClose").disabled = !(s.phase === "decide" || (s.phase === "validate" && !s.locked));
    if (document.activeElement !== $("timerRange")) { $("timerRange").value = s.decideSeconds || 150; $("timerOut").textContent = `${s.decideSeconds || 150} s`; }
    const list = $("playerList");
    if (!s.host) { list.innerHTML = hostKey ? "" : `<span class="muted small">Save the key to see players.</span>`; return; }
    const teamOpts = (sel) => D.teams.map((t) => `<option value="${t.id}"${t.id === sel ? " selected" : ""}>${t.flag} ${esc(t.name)}</option>`).join("");
    const html = s.host.players.map((p) => s.phase === "lobby"
      ? `<div class="p"><span>${esc(p.name)}</span><select data-pid="${esc(p.pid)}" aria-label="Team of ${esc(p.name)}">${teamOpts(p.team)}</select></div>`
      : `<div class="p"><span>${esc(p.name)}${p.late ? " ⏱" : ""}</span><span class="muted">${TEAM()[p.team].flag} ${p.roles.map((r) => D.roles.find((x) => x.id === r).emoji).join("")}</span></div>`).join("");
    if (list.dataset.k !== html) {
      if (list.contains(document.activeElement) && document.activeElement.tagName === "SELECT") return;
      list.dataset.k = html;
      list.innerHTML = html || `<span class="muted small">No players yet.</span>`;
      list.querySelectorAll("select").forEach((sel) => { sel.onchange = () => hostAction("movePlayer", { pid: sel.dataset.pid, team: sel.value }); });
    }
  }
  function nextLabel() {
    if (!S) return "Next ▶";
    switch (S.phase) {
      case "nogame": return "Open game ▶";
      case "lobby": return "Start game ▶";
      case "roles": return "First event ▶";
      case "event": return "Open decisions ▶";
      case "decide": return "Close decisions ⏹";
      case "validate": return "Reveal ▶";
      case "reveal": return S.turn >= S.turns || S.gameOver ? "Final verdict ▶" : "Next turn ▶";
      case "end": return endSlide < 2 ? "Next slide ▶" : "—";
      default: return "Next ▶";
    }
  }
  function next() {
    if (!S) return;
    if (S.phase === "nogame") return hostAction("check");
    if (S.phase === "reveal" && animating) return; // let the animation finish
    if (S.phase === "end") { if (endSlide < 2) { endSlide++; lastRendered = ""; render(); } return; }
    if (S.phase === "decide") return hostAction("close");
    return hostAction("next");
  }
  function saveKey(v) {
    hostKey = (v || "").trim();
    if (hostKey) store.set(KEY_STORE, hostKey); else store.del(KEY_STORE);
    renderNoGame.tried = false;
    hostAction("check").then((s) => { if (s) { $("control").open = false; lastRendered = ""; } });
  }
  function reset() {
    const t = Date.now();
    if (t - resetArmed < 2500) {
      resetArmed = 0;
      animatedTurn = 0; sessionStorage.setItem("sp_animated", "0"); endSlide = 0;
      hostAction("reset");
      msg("Game reset ✔");
    } else { resetArmed = t; msg("Press again to reset the game"); }
  }

  function bind() {
    $("keyInput").value = hostKey;
    $("keyForm").onsubmit = (e) => { e.preventDefault(); saveKey($("keyInput").value); };
    $("btnNext").onclick = next;
    $("btnClose").onclick = () => hostAction("close");
    $("timerRange").oninput = () => { $("timerOut").textContent = `${$("timerRange").value} s`; };
    $("btnTimer").onclick = () => hostAction("setTimer", { seconds: Number($("timerRange").value) });
    $("btnReset").ondblclick = () => { resetArmed = Date.now(); reset(); };
    $("btnReset").onclick = () => msg("Double-click to reset (or press R twice)");
    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input, select, textarea")) return;
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
      else if (e.key === "r" || e.key === "R") reset();
    });
    window.addEventListener("resize", () => { qrFor = ""; if (S && S.phase === "lobby") { lastRendered = ""; render(); } });
  }

  async function boot() {
    bind();
    for (let i = 0; !D; i++) {
      try { D = await getJSON("/api/state?static=1"); } catch { await new Promise((r) => setTimeout(r, Math.min(5000, 800 * (i + 1)))); }
    }
    map = SPMap.create($("map"), D, { mode: "host" });
    if (!hostKey) openControl();
    poll();
    tickTimer();
  }
  boot();
})();
