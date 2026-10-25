// Shared timeline of the trailer (seconds). Used by the page (visuals) and by music.mjs (soundtrack).
export const FPS = 30;
export const DURATION = 74;

export const SCENES = {
  intro: [0, 7.2],        // 2030. Le rêve américain ne fait plus rêver…
  title: [7.2, 12.6],     // SOFT POWER 2050
  setup: [12.6, 18.6],    // 5 pays · 6 tours · 30 minutes
  news: [18.6, 25.2],     // 1. l'actualité frappe
  cards: [25.2, 33.2],    // 2. chaque rôle joue une carte
  influence: [33.2, 43.6],// 3. fais envie à tes voisins
  backlash: [43.6, 50.6], // 4. ne force pas
  planet: [50.6, 57.6],   // 5. sauve la planète
  secret: [57.6, 62.6],   // objectif secret
  play: [62.6, 67.6],     // scanne · choisis · fais rêver
  outro: [67.6, 74],      // question du débat + logo
};

// Musical accents (seconds) used by music.mjs
export const HITS = {
  typing: [0.6, 0.75, 0.9, 1.05, 1.2],
  title: 7.6,
  flags: [13.2, 13.7, 14.2, 14.7, 15.2],
  paper: 19.0,
  cardFlip: [26.0, 26.5, 27.0],
  advice: 29.0,
  switches: [35.2, 36.0, 36.8, 37.6, 38.4, 39.2, 40.0, 40.8, 41.6],
  fire: [45.2, 45.8, 46.4, 47.0, 47.6],
  backlash: 48.0,
  alarm: 54.2,
  secret: 58.0,
  outro: 68.0,
  final: 71.2,
};
