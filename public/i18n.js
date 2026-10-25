/* SOFT POWER 2050 — languages (shared by host and players).
   The static data from /api/state?static=1 carries English content + a French overlay (`fr`).
   SPI18n.localize(raw, lang) returns the same shape with names and texts in that language. */
(function () {
  "use strict";
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  function localize(R, lang) {
    if (!R.text[lang]) lang = R.defaultLang;
    const sub = (s) => String(s).replace(/\{lose\}/g, R.thresholds.lose);
    const D = Object.assign({}, R, { lang, text: R.text[lang] });
    const fr = lang === "fr" ? R.fr : null;
    if (!fr) {
      D.events = R.events.map((e) => Object.assign({}, e, { means: sub(e.means) }));
      return D;
    }
    D.teams = R.teams.map((t) => Object.assign({}, t, {
      name: fr.teams[t.id].name, adj: fr.teams[t.id].adj,
      power: Object.assign({}, t.power, fr.teams[t.id].power),
    }));
    D.countries = R.countries.map((c) => Object.assign({}, c, { name: fr.countries[c.id] || c.name, mapName: (fr.mapNames || {})[c.id] }));
    D.needs = Object.fromEntries(Object.entries(R.needs).map(([k, v]) => [k, Object.assign({}, v, { label: fr.needs[k] })]));
    D.gaugeInfo = Object.fromEntries(Object.entries(R.gaugeInfo).map(([k, v]) => [k, Object.assign({}, v, fr.gauges[k])]));
    D.roles = R.roles.map((r) => Object.assign({}, r, fr.roles[r.id]));
    D.cards = R.cards.map((c) => Object.assign({}, c, { name: fr.cards[c.id][0], flavor: fr.cards[c.id][1] }));
    D.events = R.events.map((e) => {
      const f = fr.events[e.id];
      return Object.assign({}, e, { title: f[0], subtitle: f[1], means: sub(f[2]) });
    });
    D.diplo = Object.fromEntries(Object.entries(R.diplo).map(([k, v]) => [k, Object.assign({}, v, fr.diplo[k])]));
    return D;
  }

  // Server texts: headlines come as { en, fr }, error messages in English.
  const pick = (v, lang) => (v && typeof v === "object" ? v[lang] || v.en : v);
  const err = (msg, D) => (D && D.lang === "fr" && D.errorsFr && D.errorsFr[msg]) || msg;
  const fill = (tpl, v) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ""));

  function current(storeKey, R) {
    const saved = ls.get(storeKey);
    return saved && R.text[saved] ? saved : R.defaultLang;
  }
  function remember(storeKey, lang) { ls.set(storeKey, lang); document.documentElement.lang = lang; }

  window.SPI18n = { localize, pick, err, fill, current, remember };
})();
