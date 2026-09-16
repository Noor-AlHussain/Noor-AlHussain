/**
 * generate-langs.js
 * Fetches top programming languages via GitHub GraphQL and renders a custom bar chart SVG.
 * Output: assets/generated/langs.svg
 */

import { graphql } from '@octokit/graphql';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = join(__dirname, '..', 'assets', 'generated');
const USERNAME  = process.env.GITHUB_USERNAME || 'Noor-AlHussain';
const TOKEN     = process.env.GITHUB_TOKEN;

mkdirSync(OUT_DIR, { recursive: true });

// Null-safe fetch with error boundary — this script previously had none,
// unlike its siblings, so any API hiccup crashed the whole CI job instead
// of degrading to an empty chart.
let repos = [];
try {
  const { user } = await graphql(`
    query($login: String!) {
      user(login: $login) {
        repositories(ownerAffiliations: OWNER, isFork: false, first: 100) {
          nodes {
            languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
              edges { size node { name color } }
            }
          }
        }
      }
    }
  `, { login: USERNAME, headers: { authorization: `token ${TOKEN}` } });
  repos = user.repositories.nodes || [];
} catch (e) {
  console.warn('GitHub API error:', e.message);
}

// Aggregate language sizes — defensive per-repo check on `languages` itself,
// not just the top-level fetch: a single malformed/edge-case repo node
// (e.g. one still being processed by GitHub) shouldn't take down the
// whole aggregation.
const langMap = {};
repos.forEach(repo => {
  const edges = repo.languages && repo.languages.edges;
  if (!edges) return;
  edges.forEach(({ size, node }) => {
    if (!langMap[node.name]) langMap[node.name] = { size: 0, color: node.color || '#00ffff' };
    langMap[node.name].size += size;
  });
});

// Sort and take top 8
const sorted = Object.entries(langMap)
  .sort((a, b) => b[1].size - a[1].size)
  .slice(0, 8);

const totalSize = sorted.reduce((s, [, v]) => s + v.size, 0);

// ── SVG ──────────────────────────────────────────────────────────────────
const W = 440, H = 260;
const BAR_H = 14;
const BAR_MAX_W = 260;
const ROW_GAP = 26;
const START_Y = 50;
const LABEL_X = 16;
const BAR_X   = 150;
const PCT_X   = BAR_X + BAR_MAX_W + 10;

const rows = sorted.map(([name, { size, color }], i) => {
  const pct   = size / totalSize;
  const barW  = Math.max(4, pct * BAR_MAX_W);
  const y     = START_Y + i * ROW_GAP;
  const pctStr= (pct * 100).toFixed(1) + '%';
  return `
    <text x="${LABEL_X}" y="${y + BAR_H - 2}"
          font-family="'Share Tech Mono','Courier New',Courier,monospace" font-size="11"
          fill="rgba(232,232,240,0.7)" letter-spacing="1">${name}</text>
    <rect x="${BAR_X}" y="${y}" width="${barW.toFixed(1)}" height="${BAR_H}" rx="2"
          fill="${color}" opacity="0.85"/>
    <text x="${PCT_X}" y="${y + BAR_H - 2}"
          font-family="'Share Tech Mono','Courier New',Courier,monospace" font-size="10"
          fill="${color}" opacity="0.9">${pctStr}</text>
  `;
}).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <filter id="glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="#0a0812"/>
  <rect x="0" y="0" width="${W}" height="1" fill="rgba(0,255,255,0.15)"/>
  <rect x="0" y="${H-1}" width="${W}" height="1" fill="rgba(0,255,255,0.15)"/>
  <text x="${W/2}" y="24" text-anchor="middle"
        font-family="'Share Tech Mono','Courier New',Courier,monospace" font-size="10"
        fill="rgba(0,255,255,0.35)" letter-spacing="3">// TOP LANGUAGES</text>
  ${rows}
</svg>`;

writeFileSync(join(OUT_DIR, 'langs.svg'), svg);
console.log('langs.svg written');
