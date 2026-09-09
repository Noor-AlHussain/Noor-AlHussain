/**
 * render-3d.js
 *
 * Headlessly renders each Three.js / Babylon.js / WebGPU / Raw WebGL2 scene
 * via Puppeteer, captures a short burst of frames, and assembles them into
 * an animated APNG (multi-frame PNG, natively decoded by all modern browsers
 * including GitHub's markdown image renderer).
 *
 * Output: assets/previews/<scene>.png   (APNG — animated)
 *         assets/generated/preview-<scene>.png (single static frame, used as
 *           a lightweight fallback / og-card source)
 *
 * Run from CI (render-3d-previews.yml) against a locally served `dist-render`
 * directory — requires network access for CDN-hosted libraries
 * (Babylon.js, OGL, Three.js addons) used by the scenes themselves.
 */

import puppeteer from 'puppeteer';
import UPNG from 'upng-js';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const ROOT        = join(__dirname, '..');
const PREVIEW_DIR = join(ROOT, 'assets', 'previews');
const STATIC_DIR  = join(ROOT, 'assets', 'generated');
const PAGES_URL   = process.env.PAGES_URL || 'http://localhost:3000';

mkdirSync(PREVIEW_DIR, { recursive: true });
mkdirSync(STATIC_DIR,  { recursive: true });

const FRAME_W = 480, FRAME_H = 300;
const FRAME_COUNT    = 8;     // frames per animated preview
const FRAME_DELAY_MS = 220;   // capture interval — also used as APNG frame delay
const WARMUP_MS      = 1800;  // let the scene stabilize (shaders compile, physics settle) before capturing

const SCENES = [
  { name:'atom',      path:'/atom/',      warmup:2600 },
  { name:'dna',       path:'/dna/',       warmup:2600 },
  { name:'particles', path:'/particles/', warmup:3200 },
  { name:'universe',  path:'/universe/',  warmup:2800 },
  { name:'hologram',  path:'/hologram/',  warmup:2200 },
  { name:'neural',    path:'/neural/',    warmup:2400 },
  { name:'wormhole',  path:'/wormhole/',  warmup:1800 },
  { name:'cpu',       path:'/cpu/',       warmup:2600 },
];

console.log('Launching Puppeteer...');
const browser = await puppeteer.launch({
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--enable-webgl',
    '--enable-unsafe-webgpu',           // required for the WebGPU particle scene
    '--use-gl=angle',
    '--use-angle=swiftshader',          // software GL — stable in headless CI
    '--disable-web-security',
  ],
});

let okCount = 0, failCount = 0;

for (const scene of SCENES) {
  const url = `${PAGES_URL}${scene.path}`;
  console.log(`\nRendering: ${scene.name} (${url})`);

  const page = await browser.newPage();
  await page.setViewport({ width: FRAME_W, height: FRAME_H, deviceScaleFactor: 1 });

  try {
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, scene.warmup ?? WARMUP_MS));

    // ── Capture N frames as raw PNG buffers ──────────────────────────
    const pngBuffers = [];
    for (let i = 0; i < FRAME_COUNT; i++) {
      const buf = await page.screenshot({ type: 'png' });
      pngBuffers.push(buf);
      if (i < FRAME_COUNT - 1) {
        await new Promise(r => setTimeout(r, FRAME_DELAY_MS));
      }
    }

    // ── Decode each PNG to raw RGBA so UPNG can re-encode as APNG ────
    const rgbaFrames = pngBuffers.map(buf => {
      const img  = UPNG.decode(buf);
      const rgba = UPNG.toRGBA8(img)[0]; // ArrayBuffer
      return rgba;
    });

    // ── Encode multi-frame APNG ───────────────────────────────────────
    // cnum=0 -> lossless; delays array controls per-frame timing (ms)
    const delays = new Array(FRAME_COUNT).fill(FRAME_DELAY_MS);
    const apngBuffer = UPNG.encode(rgbaFrames, FRAME_W, FRAME_H, 0, delays);

    writeFileSync(join(PREVIEW_DIR, `${scene.name}.png`), Buffer.from(apngBuffer));
    console.log(`  APNG written: assets/previews/${scene.name}.png (${FRAME_COUNT} frames)`);

    // ── Also save a single static frame as a lightweight fallback ─────
    writeFileSync(join(STATIC_DIR, `preview-${scene.name}.png`), pngBuffers[0]);
    console.log(`  Static fallback written: assets/generated/preview-${scene.name}.png`);

    okCount++;
  } catch (err) {
    console.warn(`  FAILED to render ${scene.name}:`, err.message);
    failCount++;
  } finally {
    await page.close();
  }
}

await browser.close();

console.log(`\nDone. ${okCount} succeeded, ${failCount} failed.`);
if (failCount > 0) {
  // Non-zero exit so CI can flag partial failures without blocking the whole pipeline
  // (the workflow step uses continue-on-error for this reason)
  process.exitCode = 1;
}
