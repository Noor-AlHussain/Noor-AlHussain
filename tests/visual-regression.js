/**
 * tests/visual-regression.js
 *
 * Pixel-for-pixel regression testing for the hand-authored SVG assets.
 * Catches exactly the class of bugs we found manually — broken font stacks,
 * XML parse errors silently degrading to blank renders, geometry regressions
 * after SVG edits — automatically on every push, before they reach the repo.
 *
 * Strategy: on first run (no baselines/) directory, generate baselines.
 *           On subsequent runs, diff each SVG's render against its baseline.
 *           Fail the suite (and the CI step) if any diff exceeds MAX_DIFF_PCT.
 *
 * Runtime: Node 20 + the three npm devDeps below.
 * Install: npm ci  (pixelmatch + @resvg/resvg-js + pngjs are in package.json)
 * Run:     node tests/visual-regression.js
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { globSync } from 'glob';
import pixelmatch from 'pixelmatch';
import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const BASELINE  = join(__dirname, 'baselines');
const DIFF_DIR  = join(__dirname, 'diffs');

const MAX_DIFF_PCT = 0.5;  // % of pixels allowed to differ (tolerates anti-aliasing)
const RENDER_W     = 900;
const RENDER_H     = null; // null = auto from SVG viewBox

mkdirSync(BASELINE, {recursive:true});
mkdirSync(DIFF_DIR,  {recursive:true});

// Only test the authored SVGs (not generated/), which have stable content
const SVG_GLOB = 'assets/svg/{hero,science,diagrams,ui,sections}/*.svg';
const files    = globSync(SVG_GLOB, {cwd: ROOT});

function renderSvg(svgPath){
  const svgData = readFileSync(svgPath, 'utf8');
  const resvg   = new Resvg(svgData, {
    fitTo: { mode: 'width', value: RENDER_W },
    font:  { loadSystemFonts: true },
  });
  const png = resvg.render();
  return png.asPng();
}

function parsePng(buf){
  return PNG.sync.read(buf);
}

let passed = 0, failed = 0, baselined = 0;

for (const rel of files) {
  const svgPath      = join(ROOT, rel);
  const name         = basename(rel, '.svg');
  const baselinePath = join(BASELINE, name + '.png');
  const diffPath     = join(DIFF_DIR,  name + '.diff.png');

  let rendered;
  try {
    rendered = renderSvg(svgPath);
  } catch (e) {
    console.log(`FAIL — ${rel}: render error: ${e.message}`);
    failed++;
    continue;
  }

  if (!existsSync(baselinePath)) {
    writeFileSync(baselinePath, rendered);
    console.log(`BASELINE — ${rel}: saved (${rendered.length} bytes)`);
    baselined++;
    continue;
  }

  const imgA = parsePng(readFileSync(baselinePath));
  const imgB = parsePng(rendered);

  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    console.log(`FAIL — ${rel}: dimensions changed (${imgA.width}x${imgA.height} → ${imgB.width}x${imgB.height})`);
    failed++;
    continue;
  }

  const { width, height } = imgA;
  const diffPng = new PNG({ width, height });
  const numDiff = pixelmatch(
    imgA.data, imgB.data, diffPng.data,
    width, height,
    { threshold: 0.12, includeAA: false }
  );
  const diffPct = (numDiff / (width * height)) * 100;

  if (diffPct > MAX_DIFF_PCT) {
    writeFileSync(diffPath, PNG.sync.write(diffPng));
    console.log(`FAIL — ${rel}: ${diffPct.toFixed(2)}% pixels differ (max ${MAX_DIFF_PCT}%) — diff: ${diffPath}`);
    failed++;
  } else {
    console.log(`PASS — ${rel}: ${diffPct.toFixed(2)}% diff`);
    passed++;
  }
}

console.log(`\n──────────────────────────────────────────`);
console.log(`${passed} passed  ${failed} failed  ${baselined} new baselines`);
if (failed > 0) {
  console.log('Visual regression failures detected. Review diffs in tests/diffs/');
  process.exitCode = 1;
}
