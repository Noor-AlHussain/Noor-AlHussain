/**
 * bootstrap-placeholders.js
 *
 * One-time setup script. Generates on-brand "INITIALIZING" placeholder SVGs
 * for assets that normally require live GitHub API data (dashboard, stats,
 * streak, langs, wakatime, contribution-graph) or a third-party Action
 * (snake.svg via Platane/snk).
 *
 * Run this ONCE after cloning, before the first `update-readme` workflow run,
 * so the README never shows broken image icons. The real `update-readme.yml`
 * workflow overwrites every one of these files with live data on first run
 * and every day after — this script never runs in CI.
 *
 * Usage: node scripts/bootstrap-placeholders.js
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = join(__dirname, '..', 'assets', 'generated');
mkdirSync(OUT_DIR, { recursive: true });

const FONT = `'Share Tech Mono','Courier New',Courier,monospace`;
const T = {
  void:'#0a0812', void2:'#12101a', cyan:'#00ffff', violet:'#8a2be2',
  green:'#00ff41', orange:'#ff6600', border:'rgba(0,255,255,0.14)',
  muted:'rgba(232,232,240,0.3)',
};

// Shared "initializing" panel — reused by every placeholder so the visual
// language matches once live data swaps in.
function placeholderPanel(w, h, label, sublabel) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <filter id="pg"><feGaussianBlur stdDeviation="3" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <style>
      .scan{animation:scan-mv 2.4s linear infinite;}
      @keyframes scan-mv{from{transform:translateX(-40px)}to{transform:translateX(${w+40}px)}}
      .blink{animation:blk 1.4s step-end infinite;}
      @keyframes blk{0%,100%{opacity:1}50%{opacity:.2}}
    </style>
  </defs>
  <rect width="${w}" height="${h}" fill="${T.void}"/>
  <rect x="0" y="0" width="${w}" height="1" fill="${T.border}"/>
  <rect x="0" y="${h-1}" width="${w}" height="1" fill="${T.border}"/>
  <rect x="0" y="0" width="2" height="${h}" fill="${T.cyan}" opacity=".25"/>
  <!-- scanning bar -->
  <rect class="scan" y="0" width="40" height="${h}"
        fill="${T.cyan}" opacity="0.04"/>
  <text x="${w/2}" y="${h/2-6}" text-anchor="middle"
        font-family="${FONT}" font-size="11"
        fill="${T.cyan}" letter-spacing="3" filter="url(#pg)">${label}</text>
  <text x="${w/2}" y="${h/2+14}" text-anchor="middle"
        font-family="${FONT}" font-size="9"
        fill="${T.muted}" letter-spacing="2">${sublabel}<tspan class="blink">_</tspan></text>
</svg>`;
}

const targets = [
  { file:'dashboard.svg',           w:900, h:340, label:'// DASHBOARD INITIALIZING', sub:'awaiting first workflow run' },
  { file:'stats.svg',                w:900, h:180, label:'// METRICS INITIALIZING',   sub:'awaiting first workflow run' },
  { file:'streak.svg',               w:900, h:110, label:'// STREAK INITIALIZING',    sub:'awaiting first workflow run' },
  { file:'langs.svg',                w:440, h:260, label:'// LANGS INITIALIZING',     sub:'awaiting first workflow run' },
  { file:'wakatime.svg',             w:440, h:220, label:'// ACTIVITY INITIALIZING',  sub:'awaiting first workflow run' },
  { file:'contribution-graph.svg',   w:900, h:160, label:'// HEATMAP INITIALIZING',   sub:'awaiting first workflow run' },
];

let created = 0;
for (const t of targets) {
  const path = join(OUT_DIR, t.file);
  if (existsSync(path)) { console.log(`skip (exists): ${t.file}`); continue; }
  writeFileSync(path, placeholderPanel(t.w, t.h, t.label, t.sub));
  console.log(`created placeholder: ${t.file}`);
  created++;
}

// snake.svg — third-party Action output, slightly different style (wide strip)
const snakePath = join(OUT_DIR, 'snake.svg');
if (!existsSync(snakePath)) {
  writeFileSync(snakePath, placeholderPanel(900, 200,
    '// CONTRIBUTION SNAKE INITIALIZING',
    'rendered by Platane/snk on first workflow run'));
  console.log('created placeholder: snake.svg');
  created++;
}

console.log(`\n${created} placeholder(s) created in assets/generated/`);
console.log('These are overwritten automatically by update-readme.yml on first run.');
