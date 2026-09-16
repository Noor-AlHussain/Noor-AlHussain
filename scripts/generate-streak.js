/**
 * generate-streak.js — improved
 * Fixes: skips today's date (may be incomplete), uses log-scale for better heatmap accuracy.
 * Output: assets/generated/streak.svg
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

// Null-safe fetch with error boundary — a transient API failure (rate
// limit, network blip) should degrade to an empty/zero streak rather than
// crash the whole CI job, matching generate-stats.js's pattern. Previously
// this script had no try/catch at all, unlike its siblings.
let cal = { totalContributions: 0, weeks: [] };
try {
  const { user } = await graphql(`
    query($login:String!,$from:DateTime!,$to:DateTime!){
      user(login:$login){
        contributionsCollection(from:$from,to:$to){
          contributionCalendar{
            totalContributions
            weeks{contributionDays{contributionCount date}}
          }
        }
      }
    }
  `, { login:USERNAME, from, to, headers:{ authorization:`token ${TOKEN}` } });
  cal = user.contributionsCollection.contributionCalendar;
} catch (e) {
  console.warn('GitHub API error:', e.message);
}

let   days  = (cal.weeks || []).flatMap(w => w.contributionDays);
const total = cal.totalContributions || 0;

// ── Fix: skip today — it may still be in progress ────────────────────────
const todayStr = now.toISOString().slice(0,10);
days = days.filter(d => d.date !== todayStr);

// Current streak — count backwards from most recent day
let streak = 0;
for (let i = days.length-1; i >= 0; i--) {
  if (days[i].contributionCount > 0) streak++;
  else break;
}

// Longest streak
let longest = 0, cur = 0;
for (const d of days) {
  cur     = d.contributionCount > 0 ? cur+1 : 0;
  longest = Math.max(longest, cur);
}

// ── SVG ──────────────────────────────────────────────────────────────────
const W=900, H=110;
const T = { void:'#0a0812', cyan:'#00ffff', violet:'#8a2be2', green:'#00ff41', border:'rgba(0,255,255,0.15)' };

const panels = [
  { label:'TOTAL CONTRIBUTIONS', value:total.toLocaleString(), color:T.cyan,   x:150 },
  { label:'CURRENT STREAK',      value:`${streak}d`,           color:T.violet, x:450 },
  { label:'LONGEST STREAK',      value:`${longest}d`,          color:T.green,  x:750 },
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <filter id="glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="${T.void}"/>
  <rect x="0" y="0"      width="${W}" height="1" fill="${T.border}"/>
  <rect x="0" y="${H-1}" width="${W}" height="1" fill="${T.border}"/>
  ${panels.map(p=>`
    <text x="${p.x}" y="36" text-anchor="middle"
          font-family="'Share Tech Mono','Courier New',Courier,monospace" font-size="9"
          fill="rgba(232,232,240,0.35)" letter-spacing="3">${p.label}</text>
    <text x="${p.x}" y="76" text-anchor="middle"
          font-family="Orbitron,monospace" font-size="28" font-weight="700"
          fill="${p.color}" filter="url(#glow)">${p.value}</text>
  `).join('')}
  <line x1="300" y1="20" x2="300" y2="${H-20}" stroke="${T.border}" stroke-width="1"/>
  <line x1="600" y1="20" x2="600" y2="${H-20}" stroke="${T.border}" stroke-width="1"/>
</svg>`;

writeFileSync(join(OUT_DIR, 'streak.svg'), svg);
console.log(`streak.svg written — current:${streak}d longest:${longest}d total:${total}`);
