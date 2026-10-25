// SOFT POWER 2050 — pure data (no logic, no I/O).
// Edit cards, events and texts here. Everything shown to players lives in this file.

export const GAUGES = ["eco", "planet", "happy", "cohesion"];

export const GAUGE_INFO = {
  eco: { icon: "💰", label: "Growth", short: "Growth" },
  planet: { icon: "🌍", label: "Planet", short: "Planet" },
  happy: { icon: "🙂", label: "Happiness & meaningful work", short: "Happiness" },
  cohesion: { icon: "🤝", label: "Social cohesion", short: "Cohesion" },
};

// need -> which gauge of a team the country looks at ("attract" = overall attractiveness)
export const NEEDS = {
  emploi: { icon: "👷", label: "Jobs for young people", gauge: "eco" },
  tech: { icon: "💻", label: "Tech & innovation", gauge: "eco" },
  climat: { icon: "🌊", label: "Climate resilience", gauge: "planet" },
  energie: { icon: "⚡", label: "Clean energy", gauge: "planet" },
  burnout: { icon: "😮‍💨", label: "Escape burnout", gauge: "happy" },
  ville: { icon: "🏙️", label: "Liveable cities", gauge: "happy" },
  egalite: { icon: "⚖️", label: "Fairer society", gauge: "cohesion" },
  fete: { icon: "🎉", label: "Culture & joy", gauge: "attract" },
};

export const TEAMS = [
  {
    id: "usa", name: "USA", adj: "American", flag: "🇺🇸", color: "#E8743B", pattern: "stripes",
    gauges: { eco: 8, planet: 3, happy: 6, cohesion: 6 }, // spec: 8/2/5/4 (rebalanced, see README)
    power: { id: "hollywood", name: "Hollywood", emoji: "🎥", desc: "+4 influence on ANY country of the map, even far away.", targets: 1, scope: "any" },
  },
  {
    id: "fra", name: "France", adj: "French", flag: "🇫🇷", color: "#2E86DE", pattern: "dots",
    gauges: { eco: 6, planet: 5, happy: 7, cohesion: 6 }, // spec: 6/5/7/4
    power: { id: "artdevivre", name: "Art de vivre", emoji: "🥐", desc: "This turn, your Culture card's influence is doubled.", targets: 0, scope: null },
  },
  {
    id: "swe", name: "Sweden", adj: "Swedish", flag: "🇸🇪", color: "#F4C430", pattern: "grid",
    gauges: { eco: 5, planet: 6, happy: 7, cohesion: 6 }, // spec: 5/6/7/7
    power: { id: "lagom", name: "Lagom", emoji: "🧘", desc: "Backlash drops to 0 and 🙂 +1.", targets: 0, scope: null },
  },
  {
    id: "chn", name: "China", adj: "Chinese", flag: "🇨🇳", color: "#C0392B", pattern: "diag",
    gauges: { eco: 7, planet: 3, happy: 3, cohesion: 4 }, // spec: 7/3/3/5
    power: { id: "silkroads", name: "Silk Roads", emoji: "🛤️", desc: "+2 influence on 3 eligible countries of your choice, but backlash +1.", targets: 3, scope: "eligible" },
  },
  {
    id: "bra", name: "Brazil", adj: "Brazilian", flag: "🇧🇷", color: "#27AE60", pattern: "waves",
    gauges: { eco: 4, planet: 7, happy: 5, cohesion: 4 }, // spec: 4/8/6/4
    power: { id: "carnaval", name: "Carnaval", emoji: "🎭", desc: "+3 influence on every 🎉 country (anywhere), +1 on every eligible country, 🙂 +1.", targets: 0, scope: null },
  },
];

export const TEAM_IDS = TEAMS.map((t) => t.id);

// x, y in % (0-100). need = null for team countries.
export const COUNTRIES = [
  { id: "can", name: "Canada", flag: "🇨🇦", need: "climat", x: 18, y: 14 },
  { id: "usa", name: "USA", flag: "🇺🇸", need: null, x: 18, y: 28 },
  { id: "mex", name: "Mexico", flag: "🇲🇽", need: "ville", x: 17, y: 42 },
  { id: "col", name: "Colombia", flag: "🇨🇴", need: "fete", x: 25, y: 52 },
  { id: "bra", name: "Brazil", flag: "🇧🇷", need: null, x: 32, y: 62 },
  { id: "chl", name: "Chile", flag: "🇨🇱", need: "climat", x: 26, y: 78 },
  { id: "arg", name: "Argentina", flag: "🇦🇷", need: "egalite", x: 33, y: 82 },
  { id: "gbr", name: "UK", flag: "🇬🇧", need: "burnout", x: 45, y: 20 },
  { id: "nor", name: "Norway", flag: "🇳🇴", need: "ville", x: 51, y: 9 },
  { id: "swe", name: "Sweden", flag: "🇸🇪", need: null, x: 56, y: 12 },
  { id: "fin", name: "Finland", flag: "🇫🇮", need: "egalite", x: 61, y: 9 },
  { id: "pol", name: "Poland", flag: "🇵🇱", need: "energie", x: 59, y: 22 },
  { id: "fra", name: "France", flag: "🇫🇷", need: null, x: 47, y: 30 },
  { id: "deu", name: "Germany", flag: "🇩🇪", need: "energie", x: 53, y: 26 },
  { id: "esp", name: "Spain", flag: "🇪🇸", need: "fete", x: 43, y: 38 },
  { id: "mar", name: "Morocco", flag: "🇲🇦", need: "emploi", x: 45, y: 47 },
  { id: "nga", name: "Nigeria", flag: "🇳🇬", need: "energie", x: 50, y: 59 },
  { id: "egy", name: "Egypt", flag: "🇪🇬", need: "emploi", x: 58, y: 46 },
  { id: "ken", name: "Kenya", flag: "🇰🇪", need: "tech", x: 61, y: 62 },
  { id: "zaf", name: "South Africa", flag: "🇿🇦", need: "egalite", x: 56, y: 80 },
  { id: "tur", name: "Turkey", flag: "🇹🇷", need: "emploi", x: 63, y: 34 },
  { id: "ind", name: "India", flag: "🇮🇳", need: "emploi", x: 72, y: 46 },
  { id: "chn", name: "China", flag: "🇨🇳", need: null, x: 80, y: 32 },
  { id: "kor", name: "South Korea", flag: "🇰🇷", need: "burnout", x: 87, y: 27 },
  { id: "jpn", name: "Japan", flag: "🇯🇵", need: "burnout", x: 92, y: 33 },
  { id: "vnm", name: "Vietnam", flag: "🇻🇳", need: "tech", x: 82, y: 48 },
  { id: "idn", name: "Indonesia", flag: "🇮🇩", need: "climat", x: 85, y: 63 },
  { id: "aus", name: "Australia", flag: "🇦🇺", need: "tech", x: 89, y: 81 }, // spec: climat (rebalanced)
];

export const COUNTRY = Object.fromEntries(COUNTRIES.map((c) => [c.id, c]));
export const FREE_COUNTRIES = COUNTRIES.filter((c) => !TEAM_IDS.includes(c.id)).map((c) => c.id);

// Board links from the spec, made symmetric below.
// Rebalanced (see README): added usa–col and bra–mex, removed bra–nga and bra–zaf (Brazil won 70% of simulated games).
const RAW_NEIGHBORS = {
  usa: ["can", "mex", "gbr", "jpn", "col"],
  can: ["usa", "gbr"],
  mex: ["usa", "col", "bra"],
  col: ["mex", "bra", "chl", "usa"],
  bra: ["col", "arg", "chl", "mex"],
  arg: ["bra", "chl", "zaf"],
  chl: ["col", "bra", "arg", "aus"],
  gbr: ["usa", "can", "fra", "swe", "nor"],
  nor: ["gbr", "swe"],
  swe: ["gbr", "nor", "fin", "pol", "deu"],
  fin: ["swe", "pol"],
  pol: ["swe", "fin", "deu"],
  fra: ["gbr", "deu", "esp", "mar"],
  deu: ["fra", "swe", "pol", "tur"],
  esp: ["fra", "mar"],
  mar: ["fra", "esp", "nga", "egy"],
  nga: ["mar", "ken", "zaf"],
  egy: ["mar", "tur", "ken"],
  ken: ["egy", "nga", "zaf", "ind"],
  zaf: ["nga", "ken", "arg"],
  tur: ["deu", "egy", "ind"],
  ind: ["tur", "ken", "chn", "idn"],
  chn: ["ind", "jpn", "kor", "vnm"],
  jpn: ["chn", "kor", "usa"],
  kor: ["chn", "jpn"],
  vnm: ["chn", "idn"],
  idn: ["ind", "vnm", "aus"],
  aus: ["idn", "chl"],
};

export const NEIGHBORS = (() => {
  const out = Object.fromEntries(COUNTRIES.map((c) => [c.id, new Set()]));
  for (const [a, list] of Object.entries(RAW_NEIGHBORS)) {
    for (const b of list) { out[a].add(b); out[b].add(a); }
  }
  return Object.fromEntries(Object.entries(out).map(([k, s]) => [k, [...s].sort()]));
})();

// Long links drawn as dashed sea routes.
export const SEA_ROUTES = [["usa", "jpn"], ["chl", "aus"]];

export const ROLES = [
  { id: "president", name: "President", emoji: "👑", desc: "Pick a President card. During validation, see your team's choices, veto one card and unleash your super-power.", tip: "A veto at the right moment beats a bad idea. And your super-power only works once." },
  { id: "eco", name: "Economy & Work", emoji: "🏭", desc: "Pick an Economy card: 4-day week, robots, basic income… You shape how people work.", tip: "Growth attracts, but burnt-out workers don't inspire anyone." },
  { id: "ecolo", name: "Ecology", emoji: "🌱", desc: "Pick an Ecology card. You protect your country's planet gauge — and everyone's.", tip: "If the planet dies, nobody wins. Not even you." },
  { id: "culture", name: "Culture / Soft Power", emoji: "🎬", desc: "Pick a Culture card AND a target country. You make the world want your model.", tip: "Ads work fast… then the world gets tired of you. Scholarships calm things down." },
  { id: "voice", name: "Voice of the People", emoji: "📣", desc: "Pick a demand card (union & youth). Once per game, call a general strike to cancel one card.", tip: "A strike costs growth but saves cohesion. Keep it for the worst idea." },
  { id: "diplomat", name: "Diplomat", emoji: "🤝", desc: "You see every team's gauges live. Send one offer per turn: trade, climate or culture.", tip: "Watch who is close to the edge. A climate pact can save everyone." },
];

export const ROLE_IDS = ROLES.map((r) => r.id);
export const CARD_ROLES = ["president", "eco", "ecolo", "culture", "voice"];

const card = (role, id, name, emoji, flavor, opts = {}) => ({
  id, role, name, emoji, flavor,
  fx: { eco: 0, planet: 0, happy: 0, cohesion: 0, ...(opts.fx || {}) },
  tags: opts.tags || [],
  influence: opts.influence || 0,
  global: !!opts.global,
  rejection: opts.rejection || 0,
  special: opts.special || null,
});

export const CARDS = [
  // 🏭 Economy & Work
  card("eco", "eco_4day", "4-day week", "📅", "Friday is the new Saturday.", { fx: { eco: -1, happy: 2, cohesion: 1 }, tags: ["burnout"] }),
  card("eco", "eco_robots", "100% robot factories", "🤖", "The robots don't unionise. Yet.", { fx: { eco: 3, happy: -1, cohesion: -2 }, tags: ["tech"] }),
  card("eco", "eco_ubi", "Universal basic income", "💸", "Free money. What could go wrong?", { fx: { eco: -2, happy: 1, cohesion: 2 }, tags: ["egalite"] }),
  card("eco", "eco_uber", "Uberise everything", "🛵", "Everyone is a freelancer now. Congrats.", { fx: { eco: 2, happy: -2, cohesion: -1 }, tags: ["emploi"] }),
  card("eco", "eco_aitraining", "National AI training plan", "🧠", "Junior consultants learn to prompt.", { fx: { eco: 1, happy: 1 }, tags: ["tech", "emploi"] }),
  card("eco", "eco_reshore", "Bring factories home", "🏗️", "Made at home, again.", { fx: { eco: 1, cohesion: 1, planet: -1 }, tags: ["emploi"] }),
  card("eco", "eco_remote", "Remote work for all", "🏠", "Meetings in pyjamas, officially.", { fx: { happy: 1, planet: 1, cohesion: -1 }, tags: ["ville", "burnout"] }),
  card("eco", "eco_startup", "Start-up nation", "🦄", "Ten unicorns, zero interns paid.", { fx: { eco: 2, cohesion: -1 }, tags: ["tech"] }),
  card("eco", "eco_coops", "Worker co-ops", "🧑‍🤝‍🧑", "The workers own the factory now.", { fx: { eco: -1, happy: 1, cohesion: 2 }, tags: ["egalite", "emploi"] }),

  // 🌱 Ecology
  card("ecolo", "eco_carbontax", "Carbon tax", "🧾", "Polluters pay. Some people yell.", { fx: { eco: -1, planet: 3, cohesion: -1 }, tags: ["climat"] }),
  card("ecolo", "eco_15min", "15-minute city", "🚲", "Your whole life, walking distance.", { fx: { planet: 1, happy: 1 }, tags: ["ville"] }),
  card("ecolo", "eco_drill", "Drill baby drill", "🛢️", "Cheap gas, hot summers.", { fx: { eco: 2, planet: -3 }, tags: ["energie"] }),
  card("ecolo", "eco_nuclear", "Nuclear power", "⚛️", "Clean-ish, scary-ish.", { fx: { eco: 1, planet: 1, cohesion: -1 }, tags: ["energie"] }),
  card("ecolo", "eco_solar", "Solar everywhere", "☀️", "Every roof is a power plant.", { fx: { eco: -1, planet: 2 }, tags: ["energie", "climat"] }),
  card("ecolo", "eco_nosuv", "Ban SUVs in cities", "🚫", "Bye-bye, giant cars.", { fx: { planet: 2, cohesion: -1 }, tags: ["ville"] }),
  card("ecolo", "eco_sobriety", "Happy sobriety", "🌿", "Need less, live more.", { fx: { eco: -2, planet: 2, happy: 1 }, tags: ["climat"] }),
  card("ecolo", "eco_forest", "Giant reforestation", "🌳", "A billion trees and counting.", { fx: { eco: -1, planet: 2 }, tags: ["climat"] }),
  card("ecolo", "eco_ev", "Electric car subsidies", "🔌", "Same traffic jam, but silent.", { fx: { planet: 1 }, tags: ["energie"] }),

  // 🎬 Culture (needs a target)
  card("culture", "cul_series", "Hit streaming series", "📺", "The whole world binge-watched it.", { influence: 3, global: true }),
  card("culture", "cul_fashion", "Fashion week", "👗", "Everyone copies your style.", { influence: 2, special: "fete_plus1" }),
  card("culture", "cul_food", "Cuisine listed by UNESCO", "🍲", "Your food, everywhere.", { influence: 2, fx: { happy: 1 } }),
  card("culture", "cul_influencers", "Influencer campaign", "🤳", "#Sponsored.", { influence: 3, global: true, rejection: 1 }),
  card("culture", "cul_festival", "Giant music festival", "🎶", "Three days, zero sleep.", { influence: 2, fx: { happy: 1 }, special: "fete_x2" }),
  card("culture", "cul_scholarships", "International scholarships", "🎓", "Come study with us.", { influence: 2, fx: { eco: -1 }, rejection: -2 }),
  card("culture", "cul_esport", "Esport & football league", "⚽", "Your teams, their idols.", { influence: 2, global: true }),
  card("culture", "cul_ads", "Massive ad blitz", "📢", "You can't escape our ads.", { influence: 4, rejection: 2 }),
  card("culture", "cul_pressure", "Trade pressure", "🧲", "Nice economy you have there…", { influence: 5, fx: { eco: 1 }, rejection: 3 }),

  // 👑 President
  card("president", "pre_un", "Speech at the UN", "🎤", "Standing ovation.", { special: "un_speech" }),
  card("president", "pre_stimulus", "Stimulus plan", "🖨️", "Money printer goes brrr.", { fx: { eco: 2, planet: -1 } }),
  card("president", "pre_referendum", "Referendum", "🗳️", "The people have spoken. Loudly.", { fx: { cohesion: 2, eco: -1 } }),
  card("president", "pre_austerity", "Austerity budget", "✂️", "Tighten your belts.", { fx: { eco: 1, happy: -1, cohesion: -1 } }),
  card("president", "pre_climatesummit", "World climate summit", "🌐", "Everyone signs. Will they deliver?", { special: "climate_summit" }),
  card("president", "pre_school", "Invest in schools", "🏫", "Tomorrow's voters, today's pupils.", { fx: { eco: -1, happy: 1, cohesion: 1 } }),
  card("president", "pre_health", "Free healthcare for all", "🏥", "Health is not a job perk.", { fx: { eco: -1, cohesion: 2 } }),

  // 📣 Voice of the people
  card("voice", "voi_wages", "March for wages", "✊", "We want our share.", { fx: { eco: -1, cohesion: 1 }, tags: ["egalite"] }),
  card("voice", "voi_tangping", "Lying-flat movement", "🛌", "Not today, capitalism.", { fx: { eco: -1, happy: 1 }, tags: ["burnout"] }),
  card("voice", "voi_climate", "Youth climate strike", "🪧", "There is no planet B.", { fx: { planet: 1, cohesion: -1 }, tags: ["climat"] }),
  card("voice", "voi_4day", "4-day week petition", "✍️", "1 million signatures.", { fx: { happy: 1 }, tags: ["burnout"] }),
  card("voice", "voi_peace", "Social peace", "🕊️", "Everyone chills. For now.", { fx: { cohesion: 1 } }),
  card("voice", "voi_housing", "Housing protest", "🏘️", "Rent is too damn high.", { fx: { cohesion: 1, eco: -1 }, tags: ["ville"] }),
];

export const CARD = Object.fromEntries(CARDS.map((c) => [c.id, c]));
export const DECKS = Object.fromEntries(CARD_ROLES.map((r) => [r, CARDS.filter((c) => c.role === r).map((c) => c.id)]));

export const YEARS = [2030, 2034, 2038, 2042, 2046, 2050];
export const TURNS = 6;

// Event rules are implemented in engine.mjs (applyEventGauges / eventMultiplier); texts live here.
export const EVENTS = [
  { id: "ev_chatgpt", title: "ChatGPT 9 replaces every junior consultant", subtitle: "Slide decks now write themselves. Interns are confused.", means: "Everyone: 💰+1 🙂−1. Play a 💻 tech card or the AI training plan for 🙂+1 — otherwise 🤝−1." },
  { id: "ev_heatwave", title: "Heatwave: 48°C in Paris, café terraces closed", subtitle: "Ice cream is now a strategic resource.", means: "Everyone: 🌍−1, and 🙂−1 unless your 🌍 is 6+. A 🌊 climate card gives 🙂+1." },
  { id: "ev_tangping", title: "Lying flat goes global: young people stop working", subtitle: "\"Hustle culture\" officially declared dead.", means: "💰−1 unless your 🙂 is 6+. A 😮‍💨 burnout card gives 🙂+1. 😮‍💨 countries count ×1.5." },
  { id: "ev_oil", title: "Oil hits $300 a barrel", subtitle: "Bicycle sales up 900%. Road trips cancelled.", means: "🌍 3 or less: 💰−2. An ⚡ energy card gives 💰+1. ⚡ countries count ×1.5." },
  { id: "ev_olympics", title: "World Olympics: the planet is watching", subtitle: "Breakdancing is the new 100 metres.", means: "Culture cards have ×2 influence this turn. 🎉 countries count ×1.5." },
  { id: "ev_burnout", title: "Global burnout epidemic", subtitle: "\"Per my last email\" classified as a symptom.", means: "Everyone: 🙂−1. Play the 4-day week, the petition or remote work for 🙂+2. 😮‍💨 countries count ×2." },
  { id: "ev_tiktok", title: "TikTok banned everywhere", subtitle: "Teenagers rediscover… talking.", means: "No Culture card is global this turn: targets must be eligible. Influencers only give +1." },
  { id: "ev_crash", title: "Global stock market crash", subtitle: "Crypto bros are crying in the elevator.", means: "Everyone: 💰−2 (only −1 if your 🤝 is 6+)." },
  { id: "ev_quit", title: "The Great Resignation 2.0: offices are empty", subtitle: "Open spaces turned into plant nurseries.", means: "Everyone: 🤝−1. An ⚖️ equality or 😮‍💨 burnout card gives 🤝+1." },
  { id: "ev_floods", title: "Giant floods hit coastal cities", subtitle: "Venice says: \"Welcome to the club.\"", means: "Everyone: 🌍−1. 🌊 climate countries count ×2." },
  { id: "ev_robotstrike", title: "Delivery riders strike against the robots", subtitle: "Your pizza is late. Very late.", means: "Playing Robot factories or Uberise: 🤝−2. An ⚖️ equality card gives 🤝+1." },
  { id: "ev_summit", title: "2050: The Great World Summit, the final verdict", subtitle: "Last chance to be the model everyone dreams of.", means: "All influence gains are ×1.5 this turn. The planet score is on screen: keep it at 15+ or everybody loses." },
];

export const EVENT = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
export const FIRST_EVENT = "ev_chatgpt";
export const LAST_EVENT = "ev_summit";

export const DIPLO_TYPES = {
  trade: { emoji: "📦", name: "Trade deal", desc: "Both teams: 💰+1." },
  climate: { emoji: "🌱", name: "Climate pact", desc: "Both teams: 🌍+1, 💰−1." },
  culture: { emoji: "🎭", name: "Cultural exchange", desc: "Both: +1 influence on every country eligible for both (else 🙂+1)." },
};

// All UI strings. {placeholders} are filled by the code.
export const TEXT = {
  title: "SOFT POWER 2050",
  tagline: "2030. The American Dream is over. Who will the world dream of next?",
  newspaper: "THE WORLD TIMES",
  whatItMeans: "What it means for you",
  turnLabel: "{year} · Turn {turn}/{turns}",
  phases: { lobby: "Lobby", roles: "Roles", event: "Breaking news", decide: "Decide", validate: "Validate", reveal: "Reveal", end: "The verdict" },
  join: { title: "Join the game", nick: "Your nickname", pickTeam: "Pick a country", auto: "🎲 Auto", go: "Join", tooShort: "2 to 16 characters, please." },
  waiting: "You're in team {flag} {team}. Keep this page open.",
  teammates: "Teammates",
  yourRoles: "Your role",
  secretTip: "Secret tip",
  pickCard: "Pick one card",
  pickTarget: "Now tap a target country on the map",
  chosen: "Chosen ✓",
  rolesReady: "{done}/{total} roles have chosen",
  presidentDeciding: "Your president is deciding…",
  veto: "Veto",
  vetoed: "Vetoed",
  usePower: "Use super-power",
  powerUsed: "Super-power used",
  confirm: "Confirm",
  strike: "📣 Call a general strike",
  strikeUsed: "Strike already used",
  strikeTarget: "Which card does the strike cancel?",
  sendOffer: "Send an offer",
  offersReceived: "Offers received",
  accept: "Accept",
  refuse: "Refuse",
  noOffers: "No offers yet.",
  reconnecting: "Reconnecting…",
  planetAlert: "🌡️ The planet is overheating",
  planetScore: "Common planet",
  gameOver: "GAME OVER — The planet lost. Everybody loses.",
  planetSurvived: "The planet survived 🌍",
  debate: "Should the best model become everyone's model?",
  bot: "🤖 Bot",
  zone: "Zone of influence",
  attract: "Attractiveness",
  backlash: "Backlash",
  awards: {
    happiest: "Happiest country",
    polluter: "Biggest polluter",
    backlash: "Backlash champion",
    diplomat: "Diplomat of the year",
    copied: "Most copied idea",
  },
  headlines: {
    joins: "{cflag} {country} takes inspiration from {tflag} {team}'s {idea}.",
    switches: "{cflag} {country} now looks to {tflag} {team} instead of {oflag} {other}.",
    leaves: "{cflag} {country} stops looking to {oflag} {other} and finds its own way.",
    backlash: "🚫 Cultural backlash! The world is tired of {tflag} {team}'s {idea}.",
    strike: "📣 General strike in {tflag} {team}: the {card} is cancelled.",
    veto: "👑 The {tflag} {adj} president vetoed '{card}'.",
    low: "{icon} {gauge} in {tflag} {team} hits rock bottom.",
    high: "{icon} {tflag} {team}'s {gauge} is through the roof.",
    coffee: "☕ {tflag} {team}'s {office} was on a coffee break.",
    planet: "🌡️ Global planet score: {score}/50, the scientists are worried.",
    planetOk: "🌍 Global planet score: {score}/50. The scientists breathe.",
    pact: "🤝 {aflag} {a} and {bflag} {b} sign a {deal}.",
    power: "{emoji} {tflag} {team} unleashes {power}!",
    summitCard: "🌐 {tflag} {team} hosts a world climate summit. Everyone signs.",
    attractive: "✨ {tflag} {team} is the most attractive model of {year}.",
    quiet: "😴 A quiet year on the map. Diplomats are bored.",
    mood: "{tflag} {team}: attractiveness {att}/10, {zone} countries look its way.",
  },
  ideaFallback: "{need} model",
  offices: { president: "President", eco: "Ministry of Economy", ecolo: "Ministry of Ecology", culture: "Ministry of Culture", voice: "Union", diplomat: "Diplomat" },
  ideaBacklash: "ads",
};
