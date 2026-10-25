// Renders the trailer to MP4: frame-by-frame capture with Playwright, music from music.mjs, encoding with ffmpeg.
// Usage:  node trailer/render.mjs            -> trailer/soft-power-2050-trailer.mp4
//         node trailer/render.mjs --stills 3 12 30   -> PNG previews of those seconds in trailer/stills/
import http from "node:http";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { execSync, spawnSync } from "node:child_process";
import path from "node:path";
import { staticData } from "../netlify/lib/view.mjs";
import { FPS, DURATION } from "./timeline.mjs";
import { writeSoundtrack } from "./music.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const OUT_DIR = path.join(ROOT, "trailer");
const args = process.argv.slice(2);
const stillsMode = args[0] === "--stills";

async function loadPlaywright() {
  try { return await import("playwright"); } catch { /* not local */ }
  return createRequire(`${execSync("npm root -g").toString().trim()}/`)("playwright");
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json" };
function serve() {
  const server = http.createServer(async (req, res) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
    res.end(await readFile(p));
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

await writeFile(path.join(OUT_DIR, "data.json"), JSON.stringify(staticData()));
const server = await serve();
const base = `http://localhost:${server.address().port}`;
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto(`${base}/trailer/trailer.html`);
await page.waitForFunction(() => window.trailerReady === true, null, { timeout: 30000 });

try {
  if (stillsMode) {
    const dir = path.join(OUT_DIR, "stills");
    await mkdir(dir, { recursive: true });
    for (const s of args.slice(1).map(Number)) {
      await page.evaluate((t) => window.seek(t), s);
      await page.screenshot({ path: path.join(dir, `t${String(s).padStart(5, "0")}.png`) });
    }
    console.log(`Stills in ${dir}`);
  } else {
    const frames = path.join(OUT_DIR, ".frames");
    await rm(frames, { recursive: true, force: true });
    await mkdir(frames, { recursive: true });
    const total = Math.round(DURATION * FPS);
    const t0 = Date.now();
    for (let i = 0; i < total; i++) {
      await page.evaluate((t) => window.seek(t), i / FPS);
      await page.screenshot({ path: path.join(frames, `${String(i).padStart(5, "0")}.jpg`), type: "jpeg", quality: 92 });
      if (i % 150 === 0) process.stdout.write(`\rframes ${i}/${total} (${Math.round((Date.now() - t0) / 1000)} s)   `);
    }
    const wav = path.join(frames, "music.wav");
    writeSoundtrack(wav);
    const out = path.join(OUT_DIR, "soft-power-2050-trailer.mp4");
    const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(frames, "%05d.jpg"), "-i", wav,
      "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out], { stdio: "inherit" });
    if (r.status !== 0) throw new Error("ffmpeg failed");
    await rm(frames, { recursive: true, force: true });
    console.log(`\nVideo: ${out}`);
  }
} finally {
  await browser.close();
  server.close();
}
