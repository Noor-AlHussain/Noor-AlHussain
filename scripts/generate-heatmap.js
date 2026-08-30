/**
 * generate-heatmap.js — improved
 * Fixes: correct month label calculation + logarithmic color scale
 * Output: assets/generated/contribution-graph.svg
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

const now  = new Date();
const from = new Date(now.getFullYear()-1, now.getMonth(), now.getDate()).toISOString();
const to   = now.toISOString();

// Null-safe fetch with error boundary — matches generate-stats.js's pattern.
// An empty `weeks` array degrades gracefully downstream (forEach no-ops,
// W becomes a small-but-valid SVG width) rather than crashing outright.
let weeks = [];
try {
  const { user } = await graphql(`
    query($login:String!,$from:DateTime!,$to:DateTime!){
      user(login:$login){
        contributionsCollection(from:$from,to:$to){
          contributionCalendar{
            weeks{contributionDays{contributionCount date weekday}}
          }
        }
      }
    }
  `, { login:USERNAME, from, to, headers:{ authorization:`token ${TOKEN}` } });
  weeks = user.contributionsCollection.contributionCalendar.weeks || [];
} catch (e) {
  console.warn('GitHub API error:', e.message);
}

// ── Log scale color ──────────────────────────────────────────────────────
// Log scale: most contributions are 1-5, log makes them more visually distinct
function countToColor(count) {
  if (count === 0) return '#0d0b18';
  const logVal = Math.log(count+1) / Math.log(40); // normalize 0..1 for count=0..40
  const t = Math.min(1, logVal);
  // Interpolate: dark teal → bright cyan
  const r = Math.round(0   + t*0);
  const g = Math.round(80  + t*175);
  const b = Math.round(100 + t*155);
  return `rgb(${r},${g},${b})`;
}

// ── Month labels — fixed algorithm ───────────────────────────────────────
// Track the last month we've seen; add label when month changes
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monthMarkers = [];
let lastMonth = -1;

weeks.forEach((w, wi) => {
  const firstDay = w.contributionDays.find(d => d.date);
  if (!firstDay) return;
  const d = new Date(firstDay.date);
  const m = d.getMonth();
  if (m !== lastMonth) {
    monthMarkers.push({ wi, label: MON[m] });
    lastMonth = m;
  }
});

// ── SVG layout ────────────────────────────────────────────────────────────
const CELL  = 11, GAP = 2, STEP = CELL+GAP;
const W     = weeks.length*STEP + 44;
const H     = 7*STEP + 50;
const OFF_X = 30, OFF_Y = 26;
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const cells = weeks.map((w, wi) =>
  w.contributionDays.map(d =>
    `<rect x="${OFF_X+wi*STEP}" y="${OFF_Y+d.weekday*STEP}"
           width="${CELL}" height="${CELL}" rx="2"
           fill="${countToColor(d.contributionCount)}"
           opacity="${d.contributionCount===0?0.55:0.92}">
       <title>${d.date}: ${d.contributionCount} contributions</title>
     </rect>`
  ).join('')
).join('');

const dayLbls = [1,3,5].map(i =>
  `<text x="${OFF_X-5}" y="${OFF_Y+i*STEP+CELL-2}"
         text-anchor="end" font-family="'Share Tech Mono','Courier New',Courier,monospace"
         font-size="8" fill="rgba(0,255,255,0.28)">${DAY_LABELS[i]}</text>`
).join('');

const monLbls = monthMarkers.map(m =>
  `<text x="${OFF_X+m.wi*STEP}" y="${OFF_Y-7}"
         font-family="'Share Tech Mono','Courier New',Courier,monospace"
         font-size="8" fill="rgba(0,255,255,0.38)">${m.label}</text>`
).join('');

// Legend
const legendCounts = [0,1,3,6,12,25];
const legendX = OFF_X;
const legendY = H-14;
const legendItems = legendCounts.map((v,i)=>
  `<rect x="${legendX+36+i*13}" y="${legendY}" width="${CELL}" height="${CELL}"
         rx="2" fill="${countToColor(v)}" opacity="${v===0?0.55:0.92}"/>`
).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
  </defs>
  <rect width="${W}" height="${H}" fill="#0a0812"/>
  <rect x="0" y="0" width="${W}" height="1" fill="rgba(0,255,255,0.1)"/>
  <text x="${W/2}" y="14" text-anchor="middle"
        font-family="'Share Tech Mono','Courier New',Courier,monospace" font-size="9"
        fill="rgba(0,255,255,0.3)" letter-spacing="3">// CONTRIBUTION GRAPH — ${USERNAME}</text>
  ${monLbls}
  ${dayLbls}
  ${cells}
  <text x="${legendX}" y="${H-6}" font-family="'Share Tech Mono','Courier New',Courier,monospace"
        font-size="8" fill="rgba(0,255,255,0.22)">Less</text>
  ${legendItems}
  <text x="${legendX+120}" y="${H-6}" font-family="'Share Tech Mono','Courier New',Courier,monospace"
        font-size="8" fill="rgba(0,255,255,0.22)">More</text>
</svg>`;

writeFileSync(join(OUT_DIR, 'contribution-graph.svg'), svg);
console.log('contribution-graph.svg written (log scale, fixed month labels)');
