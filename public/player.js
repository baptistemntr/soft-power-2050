/* SOFT POWER 2050 — player screen (phones and laptops). Polls /api/state?pid= every 1.5 s. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  // ------------------------------------------------------------------ identity
  function newPid() {
    const a = new Uint8Array(12);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.random() * 256; });
    return "p" + Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  let pid = ls.get("sp_pid");
  if (!pid || !/^[A-Za-z0-9_-]{8,64}$/.test(pid)) { pid = newPid(); ls.set("sp_pid", pid); }

  let D = null, S = null, offset = 0, fails = 0;
  let viewKey = "";
  let tab = null;                 // active role tab
  let pending = {};               // role -> { card, target, at } optimistic picks
  let cultureDraft = null;        // card waiting for a target
  let presDraft = null;           // { veto, power, targets }
  let voiceDraft = null;          // "eco" | "ecolo" | null
  let offerDraft = { to: null, type: null };
  let joinDraft = { name: ls.get("sp_name") || "", team: "auto", editing: false };
  let busy = false;

  const T = () => D.text;
  const TEAM = () => Object.fromEntries(D.teams.map((t) => [t.id, t]));
  const CARD = () => Object.fromEntries(D.cards.map((c) => [c.id, c]));
  const COUNTRY = () => Object.fromEntries(D.countries.map((c) => [c.id, c]));
  const ROLE = () => Object.fromEntries(D.roles.map((r) => [r.id, r]));
  const fill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ""));
  const nowServer = () => Date.now() + offset;

  // ------------------------------------------------------------------ API
  const timeout = (ms) => (AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);
  // POSTs are idempotent (each writes its own key), so they are retried on network/server errors.
  async function api(url, body, tries = body ? 3 : 1) {
    for (let i = 0; ; i++) {
      try {
        const res = await fetch(url, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: timeout(10000) } : { cache: "no-store", signal: timeout(8000) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
        return data;
      } catch (e) {
        if (i + 1 >= tries || (e.status && e.status < 500)) throw e.status ? e : Object.assign(new Error("Network problem, try again"), { status: 0 });
        await new Promise((r) => setTimeout(r, 350 * (i + 1)));
      }
    }
  }
  async function poll() {
    try {
      const s = await api(`/api/state?pid=${encodeURIComponent(pid)}`);
      fails = 0;
      $("reconnect").hidden = true;
      onState(s);
    } catch {
      fails++;
      if (fails >= 2) $("reconnect").hidden = false;
    }
    setTimeout(poll, fails ? Math.min(5000, 1500 + fails * 500) : 1500);
  }
  function toast(msg, bad) {
    const t = $("toast");
    t.textContent = msg; t.hidden = false; t.classList.toggle("bad", !!bad);
    clearTimeout(t._t); t._t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  async function send(url, body, okMsg) {
    if (busy) return null;
    busy = true;
    try { const r = await api(url, body); if (okMsg) toast(okMsg); return r; }
    catch (e) { toast(e.message, true); return null; }
    finally { busy = false; }
  }

  function onState(s) {
    if (s.serverNow) {
      const o = s.serverNow - Date.now();
      offset = Math.abs(o - offset) > 2000 || !S ? o : offset * 0.8 + o * 0.2;
    }
    const prev = S;
    S = s;
    if (prev && (prev.turn !== s.turn || prev.gameId !== s.gameId)) { pending = {}; cultureDraft = null; presDraft = null; voiceDraft = null; offerDraft = { to: null, type: null }; tab = null; }
    if (prev && prev.phase !== s.phase) { cultureDraft = null; }
    // drop optimistic picks once the server agrees (or after 8 s)
    const tp = (s.private && s.private.teamPicks) || {};
    for (const [r, p] of Object.entries(pending)) if ((tp[r] && tp[r].card === p.card && tp[r].target === p.target) || Date.now() - p.at > 8000) delete pending[r];
    render();
  }

  // ------------------------------------------------------------------ helpers
  function fxHtml(card) {
    const parts = [];
    for (const k of D.gauges) {
      const v = card.fx[k];
      if (v) parts.push(`<span class="${v > 0 ? "pos" : "neg"}">${D.gaugeInfo[k].icon}${v > 0 ? "+" : "−"}${Math.abs(v)}</span>`);
    }
    if (card.special === "climate_summit") parts.push(`<span class="pos">🌍+1 for all</span>`, `<span class="neg">💰−1</span>`);
    if (card.special === "un_speech") parts.push(`<span class="pos">+1 influence in your whole zone</span>`);
    if (card.influence) parts.push(`<span class="pos">🎯 +${card.influence}${card.special === "fete_plus1" ? " (+1 on 🎉)" : card.special === "fete_x2" ? " (×2 on 🎉)" : ""}${card.global ? " · 🌐 anywhere" : ""}</span>`);
    return parts.join("") || `<span class="muted">No gauge effect</span>`;
  }
  function cardHtml(card, o) {
    o = o || {};
    const tags = card.tags.length ? `<div class="tags">Helps: ${card.tags.map((t) => `${D.needs[t].icon} ${esc(D.needs[t].label)}`).join(" · ")}</div>` : "";
    const warn = card.rejection > 0 ? `<div class="warn">⚠️ Backlash +${card.rejection}</div>` : card.rejection < 0 ? `<div class="tags">😌 Backlash ${card.rejection}</div>` : "";
    const extra = o.extra ? `<div class="tags">${o.extra}</div>` : "";
    const tag = o.button === false ? "div" : "button";
    return `<${tag} class="gcard${o.chosen ? " chosen" : ""}${o.vetoed ? " vetoed" : ""}" ${tag === "button" ? `type="button" data-card="${card.id}" aria-pressed="${o.chosen ? "true" : "false"}"` : ""}>
      <div class="head"><span class="emoji" aria-hidden="true">${card.emoji}</span><span class="name">${esc(card.name)}</span></div>
      <div class="flavor">“${esc(card.flavor)}”</div>
      <div class="fx">${fxHtml(card)}</div>${tags}${warn}${extra}
    </${tag}>`;
  }
  function segs(v, color) {
    let h = "";
    for (let i = 0; i < 10; i++) h += `<i class="${i < v ? "on" : ""}${i < v && v <= 2 ? " low" : ""}" ${i < v && v > 2 ? `style="--seg:${color}"` : ""}></i>`;
    return `<div class="segs" aria-hidden="true">${h}</div>`;
  }
  function gaugesHtml(team) {
    const st = S.teams[team];
    const color = TEAM()[team].color;
    return `<div class="gauges two">${D.gauges.map((k) => `<div class="gauge" title="${esc(D.gaugeInfo[k].label)}"><span class="icon" aria-label="${esc(D.gaugeInfo[k].label)}">${D.gaugeInfo[k].icon}</span>${segs(st.gauges[k], color)}<span class="val">${st.gauges[k]}</span></div>`).join("")}</div>
      <div class="statline"><span>✨ ${esc(T().attract)} <b class="num">${st.attract.toFixed(1)}</b></span><span>🔥 ${esc(T().backlash)} <b class="num">${st.rejection}</b>/5</span><span>🗺️ <b class="num">${st.zone}</b></span></div>`;
  }
  const flagName = (t) => `${TEAM()[t].flag} ${esc(TEAM()[t].name)}`;
  const countryName = (c) => `${COUNTRY()[c].flag} ${esc(COUNTRY()[c].name)}`;
  const myPick = (role) => pending[role] || (S.private.teamPicks || {})[role] || null;

  // ------------------------------------------------------------------ render
  function render() {
    if (!D || !S) return;
    renderTop();
    const app = $("app");
    const key = JSON.stringify([S.phase, S.locked, S.turn, S.gameId, S.private, relevantTeams(), pending, cultureDraft, presDraft, voiceDraft, offerDraft, tab, joinDraft.editing, S.headlines.length, S.planetAlert]);
    if (key === viewKey) return;
    // keep typing in the join form
    if (app.contains(document.activeElement) && document.activeElement.tagName === "INPUT") return;
    viewKey = key;
    const scrollY = window.scrollY;
    app.innerHTML = view();
    bindView();
    window.scrollTo(0, scrollY);
  }

  // Only re-render for data this player actually sees (avoids redraws when other teams click).
  function relevantTeams() {
    const p = S.private;
    if (!p || !p.me || joinDraft.editing || S.phase === "lobby" || S.phase === "end" || S.phase === "reveal") return [S.teams, S.owners, S.totalPlayers];
    const mine = S.teams[p.me.team];
    const out = [mine.gauges, mine.rejection, mine.zone, mine.rolesDone, mine.powerUsed, mine.strikeUsed];
    if (p.me.roles.includes("diplomat")) out.push(Object.fromEntries(Object.entries(S.teams).map(([t, v]) => [t, [v.gauges, v.rejection, v.zone, v.bot]])));
    if (cultureDraft || (presDraft && presDraft.power)) out.push(S.owners);
    return out;
  }

  function renderTop() {
    const p = S.private;
    const pt = $("pteam");
    if (p && p.me) {
      const team = TEAM()[p.me.team];
      $("ptop").className = "ptop";
      document.body.className = `player t-${team.id}`;
      pt.innerHTML = `<span class="flag">${team.flag}</span> ${esc(team.name)} · <span class="muted">${esc(p.me.name)}</span>`;
    } else { document.body.className = "player"; pt.textContent = ""; }
    const a = $("palert");
    a.hidden = !(S.planetAlert && S.phase !== "lobby" && S.phase !== "nogame");
    if (!a.hidden) a.textContent = `${T().planetAlert} — ${S.globalPlanet}/50`;
  }

  function tick() {
    const el = $("ptimer");
    if (S && D && S.phaseEndsAt && (S.phase === "decide" || S.phase === "validate") && !S.locked) {
      const left = Math.max(0, Math.ceil((S.phaseEndsAt - nowServer()) / 1000));
      el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
      el.classList.toggle("urgent", left <= 10);
      if (left === 0 && S.phase === "decide") { S.phase = "validate"; S.phaseEndsAt += 30000; viewKey = ""; render(); }
    } else { el.textContent = S && S.phase === "validate" && S.locked ? "🔒" : ""; el.classList.remove("urgent"); }
    setTimeout(tick, 500);
  }

  function view() {
    const t = T();
    if (S.phase === "nogame") return `<section class="panel center"><h1>${esc(t.title)}</h1><p class="muted">Waiting for the host to open the game… Keep this page open.</p></section>`;
    const p = S.private;
    if (!p || joinDraft.editing) return joinView();
    switch (S.phase) {
      case "lobby": return waitingView();
      case "roles": return rolesView();
      case "event": return eventView();
      case "decide": return decideView();
      case "validate": return validateView();
      case "reveal": return revealView();
      case "end": return endView();
      default: return "";
    }
  }

  // ---- join
  function joinView() {
    const t = T();
    const lateNote = S.phase !== "lobby" ? `<p class="muted">The game has started: you will join the smallest team as a co-player.</p>` : "";
    const teams = D.teams.map((team) => `<button type="button" class="teambtn t-${team.id}${joinDraft.team === team.id ? " on" : ""}" data-team="${team.id}" aria-pressed="${joinDraft.team === team.id}">
        <span class="flag">${team.flag}</span><span class="tn">${esc(team.name)}</span><span class="cnt num">${S.teams[team.id].players.length}</span></button>`).join("");
    return `<section class="panel">
      <h1>${esc(t.join.title)}</h1>
      <p class="muted">${esc(t.tagline)}</p>
      <form id="joinForm" class="stack" autocomplete="off">
        <label for="nick" class="lbl">${esc(t.join.nick)}</label>
        <input id="nick" class="input" maxlength="16" minlength="2" required value="${esc(joinDraft.name)}" placeholder="e.g. Camille" enterkeyhint="go">
        ${S.phase === "lobby" ? `<div class="lbl">${esc(t.join.pickTeam)}</div>
        <div class="teamgrid">${teams}<button type="button" class="teambtn auto${joinDraft.team === "auto" ? " on" : ""}" data-team="auto" aria-pressed="${joinDraft.team === "auto"}"><span class="flag">🎲</span><span class="tn">Auto</span><span class="cnt"></span></button></div>` : lateNote}
        <button class="btn primary big" type="submit">${esc(t.join.go)} →</button>
        <p class="err" id="joinErr" role="alert"></p>
      </form></section>`;
  }

  function waitingView() {
    const t = T(), me = S.private.me, team = TEAM()[me.team];
    return `<section class="panel center t-${team.id} teamglow">
      <div class="bigflag">${team.flag}</div>
      <h1>${esc(fill(t.waiting, { flag: "", team: team.name }).replace("  ", " "))}</h1>
      <h2 class="sub">${esc(t.teammates)}</h2>
      <ul class="mates">${me.teammates.map((m) => `<li>${m.me ? "⭐ " : ""}${esc(m.name)}</li>`).join("")}</ul>
      <p class="muted">${S.totalPlayers} players connected. The host starts the game soon.</p>
      <button class="btn small" id="changeTeam" type="button">Change nickname or country</button>
    </section>`;
  }

  // ---- roles
  function roleCard(rid) {
    const r = ROLE()[rid];
    return `<article class="rolecard"><div class="remoji">${r.emoji}</div><h2>${esc(r.name)}</h2><p>${esc(r.desc)}</p><div class="tip"><b>🤫 ${esc(T().secretTip)}</b><br>${esc(r.tip)}</div></article>`;
  }
  function rolesView() {
    const me = S.private.me, team = TEAM()[me.team];
    const pw = team.power;
    return `<section class="stack">
      <div class="panel center"><p class="eyebrow">${esc(T().yourRoles)}${me.roles.length > 1 ? "s" : ""}</p><h1>${team.flag} ${esc(team.name)}</h1>
      ${me.roles.length > 1 ? `<p class="muted">You hold ${me.roles.length} roles: you'll pick one card for each.</p>` : ""}</div>
      <div class="rolecards">${me.roles.map(roleCard).join("")}</div>
      <div class="panel"><b>${pw.emoji} Your super-power: ${esc(pw.name)}</b><p class="muted">${esc(pw.desc)} Once per game, triggered by your president.</p>
      ${gaugesHtml(me.team)}</div>
    </section>`;
  }

  // ---- event
  function eventBox(compact) {
    const e = S.event;
    if (!e) return "";
    return `<div class="eventbox${compact ? " compact" : ""}"><div class="eyebrow">📰 ${esc(T().newspaper)} · ${S.year}</div><h2>${esc(e.title)}</h2>${compact ? "" : `<p class="flavor">${esc(e.subtitle)}</p>`}<p><b>${esc(T().whatItMeans)}:</b> ${esc(e.means)}</p></div>`;
  }
  function eventView() {
    return `<section class="stack">${eventBox(false)}<div class="panel"><p class="muted">🌡️ Business as usual: every country also loses 🌍 ${D.thresholds.warming} each turn.</p>${gaugesHtml(S.private.me.team)}<p class="muted center">Decisions open in a moment…</p></div></section>`;
  }

  // ---- decide
  function myCardRoles() { return S.private.me.roles.filter((r) => D.cardRoles.includes(r)); }
  function readyCount() {
    const st = S.teams[S.private.me.team];
    return { done: st.rolesDone.filter((r) => r !== "diplomat").length + Object.keys(pending).filter((r) => !st.rolesDone.includes(r)).length, total: D.cardRoles.length };
  }
  function decideView() {
    const me = S.private.me;
    const roles = me.roles;
    if (!tab || !roles.includes(tab)) tab = roles.find((r) => D.cardRoles.includes(r) && !myPick(r)) || roles[0];
    const rc = readyCount();
    const tabs = roles.length > 1 ? `<div class="tabs" role="tablist">${roles.map((r) => {
      const done = r === "diplomat" ? !!(S.private.diplomacy && S.private.diplomacy.sent) : !!myPick(r);
      return `<button type="button" role="tab" class="tab${tab === r ? " on" : ""}" data-tab="${r}" aria-selected="${tab === r}">${ROLE()[r].emoji} ${esc(ROLE()[r].name)}${done ? " ✓" : ""}</button>`;
    }).join("")}</div>` : "";
    return `<section class="stack">
      ${eventBox(true)}
      <details class="panel mine"><summary>${flagName(me.team)} — your gauges <span class="muted">(${esc(fill(T().rolesReady, rc))})</span></summary>${gaugesHtml(me.team)}</details>
      ${tabs}
      <div class="tabpanel">${tab === "diplomat" ? diplomatView() : roleDecideView(tab)}</div>
    </section>`;
  }
  function roleDecideView(role) {
    const hand = (S.private.hands || {})[role] || [];
    const pick = myPick(role);
    const C = CARD();
    const r = ROLE()[role];
    let html = `<h2 class="sectiontitle">${r.emoji} ${esc(r.name)} — ${esc(T().pickCard)}</h2>`;
    if (pick && pick.by && pick.by !== S.private.me.name) html += `<p class="muted">Chosen by ${esc(pick.by)} (you can change it).</p>`;
    html += `<div class="cards">${hand.map((id) => cardHtml(C[id], { chosen: pick && pick.card === id && !(cultureDraft && cultureDraft === id), extra: role === "culture" && pick && pick.card === id && pick.target ? `🎯 Target: ${countryName(pick.target)}` : "" })).join("")}</div>`;
    if (role === "culture" && cultureDraft) {
      const targets = (S.private.targets || {})[cultureDraft] || [];
      html += targetPicker(targets, pick && pick.card === cultureDraft ? [pick.target] : [], `🎯 ${esc(T().pickTarget)} — ${esc(C[cultureDraft].name)}`);
    }
    if (role === "president") html += `<p class="muted small">In the validation phase you'll also be able to veto one card and use your super-power.</p>`;
    return html;
  }
  function targetPicker(targets, selected, title, id) {
    const owners = S.owners;
    const list = targets.slice().sort((a, b) => (COUNTRY()[a].name < COUNTRY()[b].name ? -1 : 1)).map((c) => {
      const o = owners[c];
      const n = D.needs[COUNTRY()[c].need];
      return `<button type="button" class="target${selected.includes(c) ? " on" : ""}" data-target="${c}" aria-pressed="${selected.includes(c)}">
        <span>${countryName(c)}</span><span class="muted small">${n.icon} ${esc(n.label)}${o ? ` · ${TEAM()[o].flag}` : ""}</span></button>`;
    }).join("");
    return `<div class="picker" id="${id || "picker"}"><h3>${title}</h3><div class="minimap" id="minimap"></div><div class="targets">${list || `<p class="muted">No eligible country.</p>`}</div></div>`;
  }

  // ---- diplomat
  function diplomatView() {
    const me = S.private.me, dip = S.private.diplomacy || { sent: null, received: [] };
    const others = D.teams.filter((t) => t.id !== me.team);
    const rows = D.teams.map((team) => {
      const st = S.teams[team.id];
      return `<tr class="${team.id === me.team ? "me" : ""}"><td>${team.flag} ${esc(team.name)}${st.bot ? " 🤖" : ""}</td>${D.gauges.map((k) => `<td class="num">${st.gauges[k]}</td>`).join("")}<td class="num">${st.rejection}</td><td class="num"><b>${st.zone}</b></td></tr>`;
    }).join("");
    const canSend = S.phase === "decide";
    const status = { pending: "⏳ waiting", accepted: "✅ accepted", refused: "❌ refused" };
    const sent = dip.sent ? `<p>📤 Offer sent: ${D.diplo[dip.sent.type].emoji} ${esc(D.diplo[dip.sent.type].name)} → ${flagName(dip.sent.to)} — <b>${status[dip.sent.status]}</b></p>` : "";
    const form = canSend ? `<div class="offerform">
        <div class="lbl">To</div><div class="chips">${others.map((t) => `<button type="button" class="chipbtn${offerDraft.to === t.id ? " on" : ""}" data-offer-to="${t.id}" aria-pressed="${offerDraft.to === t.id}">${t.flag} ${esc(t.name)}</button>`).join("")}</div>
        <div class="lbl">Deal</div><div class="chips">${Object.entries(D.diplo).map(([k, v]) => `<button type="button" class="chipbtn${offerDraft.type === k ? " on" : ""}" data-offer-type="${k}" aria-pressed="${offerDraft.type === k}" title="${esc(v.desc)}">${v.emoji} ${esc(v.name)}</button>`).join("")}</div>
        ${offerDraft.type ? `<p class="muted small">${esc(D.diplo[offerDraft.type].desc)}</p>` : ""}
        <button type="button" class="btn primary" id="sendOffer" ${offerDraft.to && offerDraft.type ? "" : "disabled"}>${esc(T().sendOffer)}${dip.sent ? " (replaces the previous one)" : ""}</button></div>` : "";
    const received = dip.received.length ? dip.received.map((o) => `<div class="offer"><span>${flagName(o.from)} proposes ${D.diplo[o.type].emoji} <b>${esc(D.diplo[o.type].name)}</b><br><span class="muted small">${esc(D.diplo[o.type].desc)}</span></span>
        ${o.status === "pending" || S.phase === "decide" || (S.phase === "validate" && !S.locked) ? `<span class="row"><button type="button" class="btn small primary" data-reply="${o.from}" data-accept="1" ${o.status === "accepted" ? "disabled" : ""}>${esc(T().accept)}</button><button type="button" class="btn small" data-reply="${o.from}" data-accept="0" ${o.status === "refused" ? "disabled" : ""}>${esc(T().refuse)}</button></span>` : ""}
        <span class="small">${status[o.status]}</span></div>`).join("") : `<p class="muted">${esc(T().noOffers)}</p>`;
    return `<h2 class="sectiontitle">🤝 Diplomat — the world at a glance</h2>
      <div class="tablewrap"><table class="world"><thead><tr><th></th>${D.gauges.map((k) => `<th>${D.gaugeInfo[k].icon}</th>`).join("")}<th>🔥</th><th>🗺️</th></tr></thead><tbody>${rows}</tbody></table></div>
      <h3>${esc(T().sendOffer)}</h3>${sent}${form || (S.phase !== "decide" ? `<p class="muted">Offers can only be sent during the decision phase.</p>` : "")}
      <h3>${esc(T().offersReceived)}</h3>${received}`;
  }

  // ---- validate
  function teamChoicesHtml(o) {
    o = o || {};
    const C = CARD();
    const picks = S.private.teamPicks || {};
    const veto = o.veto;
    return D.cardRoles.map((r) => {
      const p = picks[r];
      const role = ROLE()[r];
      if (!p) return `<div class="choice empty">${role.emoji} ${esc(role.name)}: <span class="muted">☕ no card</span></div>`;
      const extra = p.target ? `🎯 ${countryName(p.target)}` : "";
      const vbtn = o.vetoable ? `<button type="button" class="btn small ${veto === r ? "danger" : ""}" data-veto="${r}" aria-pressed="${veto === r}">${veto === r ? "✋ " + esc(T().vetoed) : esc(T().veto)}</button>` : "";
      return `<div class="choice">${role.emoji} <span class="cname">${esc(C[p.card].emoji)} <b>${esc(C[p.card].name)}</b> ${extra}<br><span class="fx small">${fxHtml(C[p.card])}</span></span>${vbtn}${veto === r && !o.vetoable ? `<span class="chip">✋ ${esc(T().vetoed)}</span>` : ""}</div>`;
    }).join("");
  }
  function validateView() {
    const me = S.private.me, team = TEAM()[me.team], st = S.teams[me.team];
    const locked = S.locked;
    const parts = [];
    const serverPres = S.private.president;
    if (me.roles.includes("president") && !locked) {
      if (!presDraft) presDraft = serverPres ? { veto: serverPres.veto, power: serverPres.power, targets: serverPres.targets || [] } : { veto: null, power: false, targets: [] };
      const pw = team.power;
      const confirmed = serverPres && serverPres.veto === presDraft.veto && serverPres.power === presDraft.power && JSON.stringify(serverPres.targets || []) === JSON.stringify(presDraft.targets);
      let powerBlock;
      if (st.powerUsed) powerBlock = `<p class="muted">${pw.emoji} ${esc(T().powerUsed)}</p>`;
      else {
        powerBlock = `<button type="button" class="btn ${presDraft.power ? "primary" : ""}" id="togglePower" aria-pressed="${presDraft.power}">${pw.emoji} ${esc(T().usePower)}: ${esc(pw.name)}${presDraft.power ? " ✓" : ""}</button><p class="muted small">${esc(pw.desc)}</p>`;
        if (presDraft.power && pw.targets > 0) powerBlock += targetPicker(S.private.powerTargets || [], presDraft.targets, `🎯 Pick ${pw.targets} target${pw.targets > 1 ? "s" : ""} (${presDraft.targets.length}/${pw.targets})`, "powerPicker");
      }
      parts.push(`<div class="panel"><h2 class="sectiontitle">👑 President — validate your team's choices</h2>
        <div class="choices">${teamChoicesHtml({ vetoable: true, veto: presDraft.veto })}</div>
        <p class="muted small">You may veto one card (the strike can't be vetoed).</p>
        ${powerBlock}
        <button type="button" class="btn primary big" id="confirmPres">${confirmed ? "Confirmed ✓ (tap to update)" : esc(T().confirm)}</button></div>`);
    }
    if (me.roles.includes("voice") && !locked) {
      const sv = S.private.voice;
      if (voiceDraft === null && sv) voiceDraft = sv.strike || "none";
      let block;
      if (st.strikeUsed) block = `<p class="muted">📣 ${esc(T().strikeUsed)}</p>`;
      else block = `<p>${esc(T().strikeTarget)}</p><div class="chips">
          ${["eco", "ecolo"].map((r) => `<button type="button" class="chipbtn${voiceDraft === r ? " on" : ""}" data-strike="${r}" aria-pressed="${voiceDraft === r}">${ROLE()[r].emoji} Cancel ${esc(ROLE()[r].name)}</button>`).join("")}
          <button type="button" class="chipbtn${voiceDraft === "none" || !voiceDraft ? " on" : ""}" data-strike="none">🕊️ No strike</button></div>
          <p class="muted small">Once per game: cancels that card, 🤝+1, 💰−1.</p>
          <button type="button" class="btn ${voiceDraft && voiceDraft !== "none" ? "danger" : ""} big" id="confirmStrike">${voiceDraft && voiceDraft !== "none" ? esc(T().strike) : "Keep the peace"}${sv && (sv.strike || "none") === (voiceDraft || "none") ? " ✓" : ""}</button>`;
      parts.push(`<div class="panel"><h2 class="sectiontitle">📣 Voice of the people</h2>${block}</div>`);
    }
    if (me.roles.includes("diplomat") && !locked && S.private.diplomacy && S.private.diplomacy.received.length) parts.push(`<div class="panel">${diplomatView()}</div>`);
    if (!me.roles.includes("president") || locked) {
      const sp = serverPres || {};
      parts.unshift(`<div class="panel"><h2 class="sectiontitle">${locked ? "🔒 Choices are locked" : `👑 ${esc(T().presidentDeciding)}`}</h2><div class="choices">${teamChoicesHtml({ veto: sp.veto })}</div>${sp.power ? `<p>⚡ ${team.power.emoji} ${esc(team.power.name)} will be used!</p>` : ""}</div>`);
    }
    return `<section class="stack">${parts.join("")}<p class="muted center">Reveal in a moment on the big screen 👀</p></section>`;
  }

  // ---- reveal
  function revealView() {
    const me = S.private.me;
    const r = S.reveal;
    const d = r ? r.deltas[me.team] : null;
    const dl = (v) => (v ? `<b class="${v > 0 ? "pos" : "neg"}">${v > 0 ? "+" : "−"}${Math.abs(v)}</b>` : `<span class="muted">0</span>`);
    const deltas = d ? `<div class="deltas">${D.gauges.map((k) => `<div>${D.gaugeInfo[k].icon} ${dl(d[k])}</div>`).join("")}<div>🔥 ${dl(d.rejection)}</div></div>` : "";
    const mine = S.headlines.filter((h) => h.teams.includes(me.team));
    const general = S.headlines.filter((h) => !h.teams.includes(me.team)).slice(0, 3);
    return `<section class="stack">
      <div class="panel"><p class="eyebrow">${S.year} — ${esc(T().phases.reveal)}</p><h2>${flagName(me.team)}</h2>${deltas}${gaugesHtml(me.team)}</div>
      <div class="panel"><h3>📰 Your headlines</h3><ul class="heads">${(mine.length ? mine : general).map((h) => `<li>${esc(h.text)}</li>`).join("")}</ul></div>
      <div class="panel"><h3>🗺️ The map</h3><div class="minimap full" id="minimap"></div></div>
    </section>`;
  }

  // ---- end
  function endView() {
    const me = S.private.me, e = S.end;
    if (!e) return "";
    const team = TEAM();
    const mine = e.scores.find((s) => s.team === me.team);
    const award = e.awards.filter((a) => a.team === me.team);
    return `<section class="stack">
      <div class="panel center"><div class="verdict ${S.gameOver ? "lost" : "ok"}">${esc(S.gameOver ? T().gameOver : T().planetSurvived)}</div>
      <h1>${team[me.team].flag} #${mine.rank}</h1><p class="muted">${mine.zone} countries in your zone · ✨ ${mine.attract}</p></div>
      <div class="panel"><h3>🏁 Final ranking</h3><ol class="ranking ${S.gameOver ? "grey" : ""}">${e.scores.map((s) => `<li class="${s.team === me.team ? "me" : ""}">${team[s.team].flag} ${esc(team[s.team].name)} <b class="num">${s.zone}</b></li>`).join("")}</ol></div>
      ${award.length ? `<div class="panel"><h3>🏆 Your award${award.length > 1 ? "s" : ""}</h3>${award.map((a) => `<p><b>${esc(T().awards[a.key])}</b> — ${esc(a.value)}</p>`).join("")}</div>` : ""}
      <div class="panel center debatebox"><p class="eyebrow">Debate</p><h2>${esc(T().debate)}</h2></div>
    </section>`;
  }

  // ------------------------------------------------------------------ events
  function bindView() {
    const app = $("app");
    const jf = $("joinForm");
    if (jf) {
      $("nick").addEventListener("input", (e) => { joinDraft.name = e.target.value; });
      app.querySelectorAll("[data-team]").forEach((b) => b.addEventListener("click", () => {
        joinDraft.team = b.dataset.team;
        app.querySelectorAll("[data-team]").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
      }));
      jf.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = $("nick").value.trim();
        if ([...name].length < 2 || [...name].length > 16) { $("joinErr").textContent = T().join.tooShort; return; }
        ls.set("sp_name", name);
        const r = await send("/api/join", { pid, name, team: joinDraft.team });
        if (r) { joinDraft.editing = false; document.activeElement.blur(); viewKey = ""; const s = await api(`/api/state?pid=${encodeURIComponent(pid)}`).catch(() => null); if (s) onState(s); }
      });
    }
    const ct = $("changeTeam");
    if (ct) ct.onclick = () => { joinDraft.editing = true; joinDraft.name = S.private.me.name; joinDraft.team = S.private.me.team; viewKey = ""; render(); };

    app.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; cultureDraft = null; render(); }));

    // card picks
    app.querySelectorAll(".tabpanel [data-card]").forEach((b) => b.addEventListener("click", async () => {
      const id = b.dataset.card;
      const role = CARD()[id].role;
      if (role === "culture") { cultureDraft = id; render(); const pk = $("picker"); if (pk) pk.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      pending[role] = { card: id, at: Date.now() };
      render();
      const r = await send("/api/pick", { pid, role, card: id }, "Saved ✓");
      if (!r) { delete pending[role]; render(); }
    }));
    const chooseCultureTarget = async (c) => {
      const id = cultureDraft;
      if (!id) return;
      pending.culture = { card: id, target: c, at: Date.now() };
      cultureDraft = null;
      render();
      const r = await send("/api/pick", { pid, role: "culture", card: id, target: c }, "Saved ✓");
      if (!r) { delete pending.culture; render(); }
    };
    const picker = $("picker");
    if (picker) {
      picker.querySelectorAll("[data-target]").forEach((b) => b.addEventListener("click", () => chooseCultureTarget(b.dataset.target)));
      const targets = (S.private.targets || {})[cultureDraft] || [];
      mountMini(targets, [], chooseCultureTarget, targets.length > 12 ? null : [S.private.me.team, ...targets]);
    }

    // diplomacy
    app.querySelectorAll("[data-offer-to]").forEach((b) => b.addEventListener("click", () => { offerDraft.to = b.dataset.offerTo; render(); }));
    app.querySelectorAll("[data-offer-type]").forEach((b) => b.addEventListener("click", () => { offerDraft.type = b.dataset.offerType; render(); }));
    const so = $("sendOffer");
    if (so) so.onclick = async () => { const r = await send("/api/team", { pid, action: "offer", to: offerDraft.to, type: offerDraft.type }, "Offer sent 📤"); if (r) offerDraft = { to: null, type: null }; };
    app.querySelectorAll("[data-reply]").forEach((b) => b.addEventListener("click", () => send("/api/team", { pid, action: "reply", from: b.dataset.reply, accept: b.dataset.accept === "1" }, b.dataset.accept === "1" ? "Deal accepted 🤝" : "Offer refused")));

    // president
    app.querySelectorAll("[data-veto]").forEach((b) => b.addEventListener("click", () => { presDraft.veto = presDraft.veto === b.dataset.veto ? null : b.dataset.veto; render(); }));
    const tp = $("togglePower");
    if (tp) tp.onclick = () => { presDraft.power = !presDraft.power; if (!presDraft.power) presDraft.targets = []; render(); };
    const pp = $("powerPicker");
    if (pp) {
      const max = TEAM()[S.private.me.team].power.targets;
      const toggle = (c) => {
        const i = presDraft.targets.indexOf(c);
        if (i >= 0) presDraft.targets.splice(i, 1);
        else { if (presDraft.targets.length >= max) presDraft.targets.shift(); presDraft.targets.push(c); }
        render();
      };
      pp.querySelectorAll("[data-target]").forEach((b) => b.addEventListener("click", () => toggle(b.dataset.target)));
      const targets = S.private.powerTargets || [];
      mountMini(targets, presDraft.targets, toggle, targets.length > 12 ? null : [S.private.me.team, ...targets]);
    }
    const cp = $("confirmPres");
    if (cp) cp.onclick = async () => {
      const pw = TEAM()[S.private.me.team].power;
      if (presDraft.power && pw.targets > 0 && !presDraft.targets.length) { toast("Pick a target for your super-power", true); return; }
      await send("/api/team", { pid, action: "president", veto: presDraft.veto, power: presDraft.power, targets: presDraft.targets }, "Confirmed 👑");
    };
    // voice
    app.querySelectorAll("[data-strike]").forEach((b) => b.addEventListener("click", () => { voiceDraft = b.dataset.strike; render(); }));
    const cs = $("confirmStrike");
    if (cs) cs.onclick = () => send("/api/team", { pid, action: "strike", target: voiceDraft && voiceDraft !== "none" ? voiceDraft : null }, voiceDraft && voiceDraft !== "none" ? "Strike called 📣" : "Saved ✓");

    // reveal mini-map
    if (S.phase === "reveal" && $("minimap")) mountMini(null, [], null, null, S.private.me.team);
  }

  function mountMini(selectable, selected, onSelect, focus, highlight) {
    const el = $("minimap");
    if (!el) return;
    const m = SPMap.create(el, D, { mode: "mini", onSelect });
    m.update(S, { selectable, selected, focus, highlightTeam: highlight || S.private.me.team });
  }

  async function boot() {
    for (let i = 0; !D; i++) {
      try { D = await api("/api/state?static=1"); } catch { $("reconnect").hidden = false; await new Promise((r) => setTimeout(r, Math.min(5000, 800 * (i + 1)))); }
    }
    $("reconnect").hidden = true;
    poll();
    tick();
  }
  boot();
})();
