/**
 * generate-stats.js — improved
 * Fixes: system font fallback stack (GitHub blocks Google Fonts in SVG),
 *        null-safe API data, SVGO optimization pass.
 * Output: assets/generated/stats.svg
 */

import { graphql } from '@octokit/graphql';
import { optimize }  from 'svgo';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = join(__dirname, '..', 'assets', 'generated');
const USERNAME  = process.env.GITHUB_USERNAME || 'Noor-AlHussain';
const TOKEN     = process.env.GITHUB_TOKEN;

mkdirSync(OUT_DIR, { recursive: true });

// Null-safe fetch with error boundary
let repos=[], contributions={ totalCommitContributions:0,
  totalPullRequestContributions:0, totalIssueContributions:0 },
  followers=0, repoCount=0;

try {
  const { user } = await graphql(`
    query($login:String!){
      user(login:$login){
        followers{totalCount}
        repositories(ownerAffiliations:OWNER,isFork:false,first:100){
          totalCount
          nodes{stargazerCount forkCount}
        }
        contributionsCollection{
          totalCommitContributions
          totalPullRequestContributions
          totalIssueContributions
        }
      }
    }
  `, { login:USERNAME, headers:{ authorization:`token ${TOKEN}` } });

  repos         = user.repositories.nodes || [];
  contributions = user.contributionsCollection;
  followers     = user.followers.totalCount || 0;
  repoCount     = user.repositories.totalCount || 0;
} catch(e) {
  console.warn('GitHub API error:', e.message);
}

const stars   = repos.reduce((s,r) => s + (r.stargazerCount||0), 0);
const forks   = repos.reduce((s,r) => s + (r.forkCount||0), 0);
const commits = contributions.totalCommitContributions || 0;
const prs     = contributions.totalPullRequestContributions || 0;
const issues  = contributions.totalIssueContributions || 0;

// ── Design: system font stack — works in GitHub SVG rendering ────────────
// GitHub strips @import, so use system monospace fonts as fallback
const FONT = `'Courier New', Courier, 'Lucida Console', monospace`;
const FONT_DISPLAY = `Impact, 'Arial Narrow', Arial, sans-serif`;

const T = {
  void:'#0a0812', void2:'#12101a',
  cyan:'#00ffff', violet:'#8a2be2', green:'#00ff41', orange:'#ff6600',
  text:'rgba(232,232,240,0.85)', muted:'rgba(232,232,240,0.32)',
  border:'rgba(0,255,255,0.14)',
};

const stats = [
  { label:'COMMITS',  value:commits.toLocaleString(),  color:T.cyan   },
  { label:'REPOS',    value:repoCount.toString(),        color:T.violet },
  { label:'STARS',    value:stars.toLocaleString(),      color:T.orange },
  { label:'PULL REQ', value:prs.toLocaleString(),        color:T.green  },
  { label:'ISSUES',   value:issues.toLocaleString(),     color:T.cyan   },
  { label:'FOLLOWERS',value:followers.toLocaleString(),  color:T.violet },
];

const W=900, H=180, CARD_W=128, CARD_H=82, GAP=12;
const TOTAL_W = stats.length*CARD_W + (stats.length-1)*GAP;
const START_X = (W-TOTAL_W)/2;

function card(stat,i){
  const x=START_X+i*(CARD_W+GAP), y=(H-CARD_H)/2;
  return `
    <rect x="${x}" y="${y}" width="${CARD_W}" height="${CARD_H}" rx="3"
          fill="${T.void2}" stroke="${stat.color}" stroke-opacity="0.28" stroke-width="1"/>
    <text x="${x+CARD_W/2}" y="${y+26}" text-anchor="middle"
          font-family="${FONT}" font-size="9"
          fill="${T.muted}" letter-spacing="2">${stat.label}</text>
    <text x="${x+CARD_W/2}" y="${y+56}" text-anchor="middle"
          font-family="${FONT_DISPLAY}" font-size="24" font-weight="700"
          fill="${stat.color}" filter="url(#val-glow)">${stat.value}</text>
  `;
}

const rawSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <filter id="val-glow" x="-20%" y="-30%" width="140%" height="160%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="${T.void}"/>
  <rect x="0" y="0"      width="${W}" height="1" fill="${T.border}"/>
  <rect x="0" y="${H-1}" width="${W}" height="1" fill="${T.border}"/>
  <text x="16" y="18" font-family="${FONT}" font-size="9"
        fill="rgba(0,255,255,0.28)" letter-spacing="3">// GITHUB METRICS — ${USERNAME}</text>
  ${stats.map(card).join('')}
</svg>`;

// SVGO optimization pass
const result = optimize(rawSVG, {
  plugins: [
    { name:'removeComments' },
    { name:'removeEmptyAttrs' },
    { name:'collapseGroups' },
  ]
});

writeFileSync(join(OUT_DIR, 'stats.svg'), result.data);
console.log('stats.svg written (system fonts, SVGO optimized)');
