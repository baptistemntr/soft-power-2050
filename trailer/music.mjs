// Synthesised soundtrack for the trailer (no samples, no dependency): writes a 44.1 kHz stereo WAV.
// Built on the same timeline as the visuals (timeline.mjs).
import { writeFileSync } from "node:fs";
import { DURATION, SCENES, HITS } from "./timeline.mjs";

const SR = 44100;
const BPM = 110;
const BEAT = 60 / BPM;

export function writeSoundtrack(file) {
  const n = Math.ceil(DURATION * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  let seed = 7;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };

  const env = (x, dur, a, r) => (x < a ? x / a : x > dur - r ? Math.max(0, (dur - x) / r) : 1);
  function tone(start, dur, freq, o = {}) {
    const { vol = .2, a = .01, r = .2, type = "sine", freqEnd = null, pan = 0, decay = 0 } = o;
    const s0 = Math.floor(start * SR), len = Math.floor(dur * SR);
    let ph = 0;
    for (let i = 0; i < len && s0 + i < n; i++) {
      const x = i / SR;
      const f = freqEnd ? freq * Math.pow(freqEnd / freq, x / dur) : freq;
      ph += (2 * Math.PI * f) / SR;
      let v;
      if (type === "saw") v = 2 * ((ph / (2 * Math.PI)) % 1) - 1;
      else if (type === "square") v = Math.sin(ph) > 0 ? 1 : -1;
      else if (type === "tri") v = 2 / Math.PI * Math.asin(Math.sin(ph));
      else v = Math.sin(ph);
      const e = env(x, dur, a, r) * (decay ? Math.exp(-x * decay) : 1) * vol;
      L[s0 + i] += v * e * (1 - pan) ; R[s0 + i] += v * e * (1 + pan);
    }
  }
  function noise(start, dur, o = {}) {
    const { vol = .1, a = .005, r = .05, hp = .0, swell = false, pan = 0 } = o;
    const s0 = Math.floor(start * SR), len = Math.floor(dur * SR);
    let prev = 0, lp = 0;
    for (let i = 0; i < len && s0 + i < n; i++) {
      const x = i / SR;
      const w = rand();
      const h = w - prev * hp; prev = w;         // crude high-pass
      lp = lp * .6 + h * .4;
      const e = (swell ? Math.pow(x / dur, 2) : env(x, dur, a, r)) * vol;
      L[s0 + i] += lp * e * (1 - pan); R[s0 + i] += lp * e * (1 + pan);
    }
  }
  const kick = (t, v = .9) => tone(t, .32, 130, { freqEnd: 42, vol: v, a: .002, r: .12, decay: 9 });
  const hat = (t, v = .06) => noise(t, .045, { vol: v, hp: .95, r: .03 });
  const clap = (t, v = .14) => noise(t, .16, { vol: v, hp: .5, r: .12 });
  const boom = (t, v = 1) => { tone(t, 1.6, 70, { freqEnd: 30, vol: v, a: .003, r: 1, decay: 2.2 }); noise(t, .5, { vol: .25 * v, hp: .2, r: .45 }); };

  // notes
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12); // midi -> Hz
  const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
  const BASS = [33, 29, 36, 31];
  const inS = (t, k) => t >= SCENES[k][0] && t < SCENES[k][1];

  // ---------- intro: drone, typing ticks, riser
  tone(0, 7.4, hz(33), { vol: .22, a: 1.5, r: 1 });
  tone(0, 7.4, hz(45), { vol: .08, a: 2, r: 1 });
  for (let t = .55; t < 1.2; t += .12) tone(t, .03, 2200, { vol: .05, a: .001, r: .02, type: "square" });
  for (let t = 1.6; t < 2.9; t += .066) tone(t, .025, 1800 + 300 * rand(), { vol: .035, a: .001, r: .02, type: "square" });
  for (let t = 3.6; t < 4.9; t += .066) tone(t, .025, 1800 + 300 * rand(), { vol: .035, a: .001, r: .02, type: "square" });
  noise(5.2, 2.2, { vol: .28, hp: .7, swell: true });
  tone(5.2, 2.2, 200, { freqEnd: 1200, vol: .06, a: 1.5, r: .1, type: "saw" });

  // ---------- title hit
  boom(HITS.title, 1.1);
  for (const m of CHORDS[0]) tone(HITS.title, 2.4, hz(m + 12), { vol: .1, a: .005, r: 1.6, type: "saw", decay: 1.2 });

  // ---------- groove 12.6 -> 57.6, then build 62.6 -> 67.6
  const grooveStart = SCENES.setup[0], grooveEnd = SCENES.secret[0];
  for (let b = 0; ; b++) {
    const t = SCENES.title[0] + .4 + b * BEAT;
    if (t >= SCENES.outro[0]) break;
    const bar = Math.floor(b / 4), beatInBar = b % 4, ci = bar % 4;
    const groove = t >= grooveStart && t < grooveEnd && !inS(t, "planet");
    const build = inS(t, "play");
    const full = inS(t, "influence");
    if (beatInBar === 0) {
      // pad + bass each bar (everywhere but the secret scene)
      if (!inS(t, "secret")) {
        for (const m of CHORDS[ci]) tone(t, BEAT * 4, hz(m), { vol: inS(t, "planet") ? .05 : .045, a: .3, r: .6, type: "tri" });
        tone(t, BEAT * 4, hz(BASS[ci]), { vol: groove || build ? .16 : .08, a: .02, r: .3, type: "tri" });
      }
    }
    if (groove || build) {
      if (inS(t, "backlash")) { if (beatInBar % 2 === 0) kick(t, .8); }
      else kick(t, build ? .7 + .3 * ((t - SCENES.play[0]) / 5) : .75);
      hat(t + BEAT / 2);
      if (full || build) { hat(t, .04); if (beatInBar % 2 === 1) clap(t); }
      if (full) { // sparkling arpeggio
        const arp = CHORDS[ci].map((m) => m + 24);
        for (let k = 0; k < 2; k++) tone(t + k * BEAT / 2, BEAT / 2, hz(arp[(b * 2 + k) % 3]), { vol: .05, a: .005, r: .15, type: "tri", pan: k ? .3 : -.3 });
      }
    }
  }
  // secret: low gong + mysterious fifths
  tone(HITS.secret, 4.5, hz(28), { vol: .3, a: .01, r: 3, decay: .8 });
  tone(HITS.secret, 4.5, hz(40), { vol: .12, a: .5, r: 2.5, type: "tri" });
  tone(HITS.secret + .4, 4, hz(47), { vol: .08, a: 1, r: 2, type: "tri" });
  noise(SCENES.play[1] - 1.6, 1.6, { vol: .25, hp: .7, swell: true });

  // ---------- accents
  HITS.flags.forEach((t, i) => tone(t, .35, hz(64 + [0, 3, 5, 7, 12][i]), { vol: .13, a: .003, r: .25, type: "tri", decay: 6 }));
  noise(HITS.paper - .5, .55, { vol: .18, hp: .6, swell: true }); kick(HITS.paper, .6);
  HITS.cardFlip.forEach((t) => noise(t, .09, { vol: .2, hp: .85, r: .06 }));
  [84, 88, 91].forEach((m, i) => tone(HITS.advice + i * .07, .6, hz(m), { vol: .07, a: .002, r: .5, decay: 4 }));
  HITS.switches.forEach((t, i) => tone(t, .3, hz(76 + (i % 5) * 2), { freqEnd: hz(83 + (i % 5) * 2), vol: .08, a: .003, r: .2, type: "tri" }));
  HITS.fire.forEach((t, i) => { noise(t, .35, { vol: .12 + i * .03, hp: .3, r: .25 }); tone(t, .3, 180 + i * 60, { vol: .05, type: "saw", r: .2 }); });
  boom(HITS.backlash, 1); tone(HITS.backlash, 1.2, hz(58), { vol: .12, type: "saw", r: .8, decay: 2 }); tone(HITS.backlash, 1.2, hz(59), { vol: .12, type: "saw", r: .8, decay: 2 });
  for (let k = 0; k < 4; k++) tone(HITS.alarm + k * .32, .3, k % 2 ? 660 : 880, { vol: .07, type: "square", a: .01, r: .05 });
  tone(SCENES.planet[0], 7, hz(29), { vol: .2, a: 1, r: 1.5, type: "tri" });

  // ---------- outro: pad, final hit, fade
  for (const m of [57, 60, 64, 69]) tone(SCENES.outro[0], 6.4, hz(m), { vol: .05, a: 1, r: 2.5, type: "tri" });
  boom(HITS.outro, .7);
  boom(HITS.final, 1.1);
  for (const m of [45, 57, 64, 69, 72]) tone(HITS.final, 2.8, hz(m), { vol: .07, a: .005, r: 2.2, type: "saw", decay: 1 });

  // ---------- master: soft clip, fade out, 16-bit PCM
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const gain = peak > 0 ? 1.4 / peak : 1;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const fade = Math.min(1, t / .05, (DURATION - t) / 1.2);
    const l = Math.tanh(L[i] * gain) * .85 * fade, r = Math.tanh(R[i] * gain) * .85 * fade;
    buf.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
  }
  writeFileSync(file, buf);
}

if (import.meta.url === `file://${process.argv[1]}`) writeSoundtrack(process.argv[2] || "trailer-music.wav");
