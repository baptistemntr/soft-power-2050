/* SOFT POWER 2050 — board map (SVG), shared by host (big) and players (mini-map).
   Usage:
     const map = SPMap.create(el, staticData, { mode: "host" | "mini", onSelect(id) {} });
     map.update(state, { selectable: [ids] | null, selected: [ids], focus: [ids], animateFrom: changes });
     await map.animate(changes, { onStep(change, i) {} });
*/
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const W = 1000, H = 600;
  const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Fit the spec coordinates (x 17..92 %, y 9..82 %) to the viewBox, leaving room for labels.
  const fitX = (x) => 70 + ((x - 17) / 75) * 860;
  const fitY = (y) => 44 + ((y - 9) / 73) * 492;

  function el(name, attrs, parent) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function hexPoints(cx, cy, r) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 90);
      pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
    }
    return pts.join(" ");
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function patterns(defs, teams) {
    const make = {
      stripes: (p) => el("path", { d: "M0,8 L8,0", stroke: "#fff", "stroke-width": 1.6, "stroke-opacity": 0.35 }, p),
      dots: (p) => el("circle", { cx: 4, cy: 4, r: 1.4, fill: "#fff", "fill-opacity": 0.45 }, p),
      grid: (p) => el("path", { d: "M0,0 L8,0 M0,0 L0,8", stroke: "#000", "stroke-width": 1.2, "stroke-opacity": 0.25 }, p),
      diag: (p) => el("path", { d: "M0,0 L8,8", stroke: "#fff", "stroke-width": 1.6, "stroke-opacity": 0.35 }, p),
      waves: (p) => el("path", { d: "M0,5 Q2,2 4,5 T8,5", stroke: "#fff", "stroke-width": 1.2, fill: "none", "stroke-opacity": 0.45 }, p),
    };
    for (const t of teams) {
      const p = el("pattern", { id: `sp-pat-${t.id}`, width: 8, height: 8, patternUnits: "userSpaceOnUse" }, defs);
      (make[t.pattern] || make.dots)(p);
    }
  }

  function create(container, data, opts) {
    opts = opts || {};
    const mode = opts.mode || "host";
    const teamIds = data.teams.map((t) => t.id);
    const TEAM = Object.fromEntries(data.teams.map((t) => [t.id, t]));
    const strongAt = (data.thresholds && data.thresholds.strong) || 7;
    const pos = {};
    for (const c of data.countries) pos[c.id] = { x: fitX(c.x), y: fitY(c.y) };
    const radius = (id) => (teamIds.includes(id) ? 34 : 26);

    container.classList.add("spmap", `spmap-${mode}`);
    container.innerHTML = "";
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "World map of influence", preserveAspectRatio: "xMidYMid meet" }, container);
    const defs = el("defs", {}, svg);
    patterns(defs, data.teams);
    const gLinks = el("g", { class: "links" }, svg);
    const gTiles = el("g", { class: "tiles" }, svg);
    const tip = document.createElement("div");
    tip.className = "spmap-tip";
    tip.hidden = true;
    container.appendChild(tip);

    // ---- links
    const seaKey = (a, b) => [a, b].sort().join("-");
    const sea = new Set((data.seaRoutes || []).map(([a, b]) => seaKey(a, b)));
    const drawn = new Set();
    for (const [a, list] of Object.entries(data.neighbors)) {
      for (const b of list) {
        const k = seaKey(a, b);
        if (drawn.has(k)) continue;
        drawn.add(k);
        const A = pos[a], B = pos[b];
        if (sea.has(k)) {
          // wrap-around sea route: each end leaves the map towards the nearest side edge
          for (const [from, to] of [[a, b], [b, a]]) {
            const P = pos[from];
            const dir = P.x < W / 2 ? -1 : 1;
            const ex = dir < 0 ? 4 : W - 4;
            const ey = P.y + (P.y < H / 2 ? -30 : 30);
            el("path", { d: `M${P.x},${P.y} Q${(P.x + ex) / 2},${ey - 30} ${ex},${ey}`, class: "link sea" }, gLinks);
            const lbl = el("text", { x: dir < 0 ? ex + 4 : ex - 4, y: ey + 14, class: "sea-label", "text-anchor": dir < 0 ? "start" : "end" }, gLinks);
            const dest = data.countries.find((c) => c.id === to);
            lbl.textContent = `🌊 ${dest.flag}`;
          }
        } else {
          el("line", { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: "link" }, gLinks);
        }
      }
    }

    // ---- tiles
    const tiles = {};
    for (const c of data.countries) {
      const { x, y } = pos[c.id];
      const r = radius(c.id);
      const isTeam = teamIds.includes(c.id);
      const g = el("g", { class: `tile${isTeam ? " team" : ""}`, "data-id": c.id, transform: `translate(${x},${y})` }, gTiles);
      const inner = el("g", { class: "tile-inner" }, g);
      const base = el("polygon", { points: hexPoints(0, 0, r), class: "hex-base" }, inner);
      const fill = el("polygon", { points: hexPoints(0, 0, r), class: "hex-fill" }, inner);
      const pat = el("polygon", { points: hexPoints(0, 0, r), class: "hex-pat" }, inner);
      const ring = el("polygon", { points: hexPoints(0, 0, r), class: "hex-ring" }, inner);
      const flag = el("text", { x: 0, y: isTeam ? -4 : -5, class: isTeam ? "flag big" : "flag", "text-anchor": "middle", "dominant-baseline": "central" }, inner);
      flag.textContent = c.flag;
      let need = null;
      if (c.need) {
        need = el("text", { x: 0, y: 13, class: "need", "text-anchor": "middle", "dominant-baseline": "central" }, inner);
        need.textContent = data.needs[c.need].icon;
      } else {
        const t = el("text", { x: 0, y: 19, class: "team-name", "text-anchor": "middle", "dominant-baseline": "central" }, inner);
        t.textContent = c.name.toUpperCase();
      }
      const badgeG = el("g", { class: "badge", transform: `translate(${r * 0.72},${-r * 0.62})` }, inner);
      el("circle", { r: 9, class: "badge-bg" }, badgeG);
      const badge = el("text", { class: "badge-flag", "text-anchor": "middle", "dominant-baseline": "central" }, badgeG);
      const label = isTeam ? null : el("text", { x: 0, y: r + 11, class: "label", "text-anchor": "middle" }, g);
      if (label) label.textContent = c.name;
      if (isTeam) {
        fill.style.fill = TEAM[c.id].color;
        fill.style.fillOpacity = 1;
        pat.style.fill = `url(#sp-pat-${c.id})`;
        ring.style.stroke = TEAM[c.id].color;
      }
      badgeG.style.display = "none";
      tiles[c.id] = { g, fill, pat, ring, badge, badgeG, label, isTeam, country: c };
      g.addEventListener("pointerenter", (e) => showTip(c.id, e));
      g.addEventListener("pointermove", (e) => moveTip(e));
      g.addEventListener("pointerleave", hideTip);
      g.addEventListener("click", (e) => {
        if (opts.onSelect && g.classList.contains("selectable")) { opts.onSelect(c.id); e.stopPropagation(); return; }
        if (mode === "mini") showTip(c.id, e, true);
      });
      if (mode === "mini") g.setAttribute("tabindex", "-1");
    }

    let current = null;
    function ownerLook(id, owner, strong) {
      const t = tiles[id];
      if (t.isTeam) return;
      if (owner) {
        t.fill.style.fill = TEAM[owner].color;
        t.fill.style.fillOpacity = strong ? 0.9 : 0.35;
        t.pat.style.fill = `url(#sp-pat-${owner})`;
        t.pat.style.fillOpacity = strong ? 1 : 0.6;
        t.ring.style.stroke = TEAM[owner].color;
        t.badge.textContent = TEAM[owner].flag;
        t.badgeG.style.display = "";
        t.g.dataset.owner = owner;
        t.g.dataset.strength = strong ? "strong" : "weak";
      } else {
        t.fill.style.fillOpacity = 0;
        t.pat.style.fill = "none";
        t.ring.style.stroke = "none";
        t.badgeG.style.display = "none";
        delete t.g.dataset.owner;
        delete t.g.dataset.strength;
      }
    }

    function update(state, o) {
      o = o || {};
      current = state;
      const from = {};
      for (const ch of o.animateFrom || []) from[ch.country] = ch;
      for (const c of data.countries) {
        if (teamIds.includes(c.id)) continue;
        let owner = state.owners ? state.owners[c.id] : null;
        let strong = owner ? (state.influence[c.id][owner] || 0) >= strongAt : false;
        if (from[c.id]) { owner = from[c.id].from; strong = from[c.id].tier ? !from[c.id].strong : false; }
        ownerLook(c.id, owner, strong);
      }
      const sel = o.selectable ? new Set(o.selectable) : null;
      const chosen = new Set(o.selected || []);
      for (const [id, t] of Object.entries(tiles)) {
        t.g.classList.toggle("selectable", !!(sel && sel.has(id)));
        t.g.classList.toggle("dim", !!(sel && !sel.has(id) && !t.isTeam));
        t.g.classList.toggle("selected", chosen.has(id));
        if (sel && sel.has(id)) { t.g.setAttribute("tabindex", "0"); t.g.setAttribute("role", "button"); t.g.setAttribute("aria-label", `Target ${t.country.name}`); }
        else { t.g.removeAttribute("role"); t.g.removeAttribute("aria-label"); t.g.setAttribute("tabindex", "-1"); }
      }
      if (o.highlightTeam) for (const [id, t] of Object.entries(tiles)) t.g.classList.toggle("mine", id === o.highlightTeam);
      // zoom (mini-map): fit the focus countries
      if (o.focus && o.focus.length) {
        const pts = o.focus.map((id) => pos[id]).filter(Boolean);
        let x0 = Math.min(...pts.map((p) => p.x)) - 70, x1 = Math.max(...pts.map((p) => p.x)) + 70;
        let y0 = Math.min(...pts.map((p) => p.y)) - 60, y1 = Math.max(...pts.map((p) => p.y)) + 60;
        // keep the aspect ratio of the full map
        const w = Math.max(x1 - x0, (y1 - y0) * (W / H), 300), h = w * (H / W);
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        x0 = Math.max(0, Math.min(W - w, cx - w / 2)); y0 = Math.max(0, Math.min(H - h, cy - h / 2));
        svg.setAttribute("viewBox", `${x0.toFixed(0)} ${y0.toFixed(0)} ${Math.min(w, W).toFixed(0)} ${Math.min(h, H).toFixed(0)}`);
      } else svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    }

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    async function animate(changes, o) {
      o = o || {};
      const list = changes || [];
      for (let i = 0; i < list.length; i++) {
        const ch = list[i];
        const t = tiles[ch.country];
        if (!t) continue;
        if (o.onStep) o.onStep(ch, i);
        if (reduceMotion()) { ownerLook(ch.country, ch.to, ch.strong); continue; }
        t.g.classList.remove("pulse");
        void t.g.getBoundingClientRect();
        t.g.classList.add("pulse");
        await wait(160);
        ownerLook(ch.country, ch.to, ch.strong);
        await wait(240);
      }
      setTimeout(() => list.forEach((ch) => tiles[ch.country] && tiles[ch.country].g.classList.remove("pulse")), 700);
    }

    // ---- tooltip
    function tipHtml(id) {
      const c = data.countries.find((x) => x.id === id);
      if (teamIds.includes(id)) {
        const t = TEAM[id];
        const st = current && current.teams && current.teams[id];
        return `<strong>${c.flag} ${esc(c.name)}</strong><div class="muted">Team country${st ? ` · attractiveness ${st.attract}/10` : ""}</div>`;
      }
      const n = data.needs[c.need];
      let rows = "";
      if (current && current.influence && current.influence[id]) {
        const sc = Object.entries(current.influence[id]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
        rows = sc.map(([t, v]) => `<div class="tip-row"><span>${TEAM[t].flag} ${esc(TEAM[t].name)}</span><b>${v.toFixed(1)}</b></div>`).join("") || `<div class="muted">No influence yet</div>`;
      }
      const owner = current && current.owners && current.owners[id];
      return `<strong>${c.flag} ${esc(c.name)}</strong><div>${n.icon} ${esc(n.label)}</div>` +
        (owner ? `<div class="muted">Looks to ${TEAM[owner].flag} ${esc(TEAM[owner].name)}</div>` : `<div class="muted">Finds its own way</div>`) + rows;
    }
    function showTip(id, e, sticky) {
      if (mode === "mini" && !sticky) return;
      tip.innerHTML = tipHtml(id);
      tip.hidden = false;
      moveTip(e);
      if (sticky) { clearTimeout(tip._t); tip._t = setTimeout(hideTip, 3500); }
    }
    function moveTip(e) {
      if (tip.hidden) return;
      const rect = container.getBoundingClientRect();
      let x = e.clientX - rect.left + 14, y = e.clientY - rect.top + 14;
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      if (x + tw > rect.width) x = Math.max(4, e.clientX - rect.left - tw - 10);
      if (y + th > rect.height) y = Math.max(4, e.clientY - rect.top - th - 10);
      tip.style.transform = `translate(${x}px, ${y}px)`;
    }
    function hideTip() { tip.hidden = true; }

    return { update, animate, svg, tiles };
  }

  window.SPMap = { create };
})();
