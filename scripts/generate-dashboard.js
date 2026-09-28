/**
 * generate-dashboard.js
 * Unified stats dashboard SVG — merges stats + streak + mini-heatmap
 * into one HUD-style panel.
 * Output: assets/generated/dashboard.svg
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
const from = new Date(now.getFullYear()-1,now.getMonth(),now.getDate()).toISOString();
const to   = now.toISOString();
const todayStr = now.toISOString().slice(0,10);

let repos=[],contributions={totalCommitContributions:0,
  totalPullRequestContributions:0,totalIssueContributions:0},
  followers=0,repoCount=0,weeks=[];

try{
  const {user}=await graphql(`
    query($login:String!,$from:DateTime!,$to:DateTime!){
      user(login:$login){
        followers{totalCount}
        repositories(ownerAffiliations:OWNER,isFork:false,first:100){
          totalCount nodes{stargazerCount forkCount}
        }
        contributionsCollection(from:$from,to:$to){
          totalCommitContributions
          totalPullRequestContributions
          totalIssueContributions
          contributionCalendar{
            totalContributions
            weeks{contributionDays{contributionCount date weekday}}
          }
        }
      }
    }
  `,{login:USERNAME,from,to,headers:{authorization:`token ${TOKEN}`}});
  repos         = user.repositories.nodes||[];
  contributions = user.contributionsCollection;
  followers     = user.followers.totalCount||0;
  repoCount     = user.repositories.totalCount||0;
  weeks         = user.contributionsCollection.contributionCalendar.weeks||[];
}catch(e){console.warn('API error:',e.message);}

const stars   = repos.reduce((s,r)=>s+(r.stargazerCount||0),0);
const commits = contributions.totalCommitContributions||0;
const prs     = contributions.totalPullRequestContributions||0;

// Streak calculation
let days = weeks.flatMap(w=>w.contributionDays).filter(d=>d.date!==todayStr);
let streak=0,longest=0,cur=0;
for(let i=days.length-1;i>=0;i--){if(days[i].contributionCount>0)streak++;else break;}
for(const d of days){cur=d.contributionCount>0?cur+1:0;longest=Math.max(longest,cur);}

// Mini heatmap — last 26 weeks
const recentWeeks = weeks.slice(-26);
function logColor(count){
  if(count===0) return '#0d0b18';
  const t=Math.min(1,Math.log(count+1)/Math.log(35));
  return `rgb(${Math.round(t*0)},${Math.round(80+t*175)},${Math.round(100+t*155)})`;
}

// Font
const F = `'Courier New',Courier,'Lucida Console',monospace`;
const FD= `Impact,'Arial Narrow',Arial,sans-serif`;
const T = {
  void:'#0a0812',void2:'#12101a',cyan:'#00ffff',violet:'#8a2be2',
  green:'#00ff41',orange:'#ff6600',red:'#ff003c',
  text:'rgba(232,232,240,0.85)',muted:'rgba(232,232,240,0.3)',
  border:'rgba(0,255,255,0.14)',
};

const W=900,H=340;

// Top stats row
const STATS=[
  {l:'COMMITS',  v:commits.toLocaleString(), c:T.cyan,   x:100},
  {l:'REPOS',    v:repoCount.toString(),      c:T.violet, x:230},
  {l:'STARS',    v:stars.toLocaleString(),    c:T.orange, x:360},
  {l:'PULL REQ', v:prs.toLocaleString(),      c:T.green,  x:490},
];
const statCards = STATS.map(s=>`
  <rect x="${s.x-55}" y="12" width="118" height="70" rx="3"
        fill="${T.void2}" stroke="${s.c}" stroke-opacity=".25" stroke-width="1"/>
  <text x="${s.x}" y="34" text-anchor="middle"
        font-family="${F}" font-size="8" fill="${T.muted}" letter-spacing="2">${s.l}</text>
  <text x="${s.x}" y="62" text-anchor="middle"
        font-family="${FD}" font-size="22" font-weight="700"
        fill="${s.c}" filter="url(#vg)">${s.v}</text>
`).join('');

// Streak panels
const streakPanels=`
  <rect x="620" y="12" width="120" height="70" rx="3"
        fill="${T.void2}" stroke="${T.cyan}" stroke-opacity=".25" stroke-width="1"/>
  <text x="680" y="34" text-anchor="middle"
        font-family="${F}" font-size="8" fill="${T.muted}" letter-spacing="2">CURRENT STREAK</text>
  <text x="680" y="62" text-anchor="middle"
        font-family="${FD}" font-size="22" font-weight="700"
        fill="${T.cyan}" filter="url(#vg)">${streak}d</text>
  <rect x="755" y="12" width="120" height="70" rx="3"
        fill="${T.void2}" stroke="${T.violet}" stroke-opacity=".25" stroke-width="1"/>
  <text x="815" y="34" text-anchor="middle"
        font-family="${F}" font-size="8" fill="${T.muted}" letter-spacing="2">LONGEST STREAK</text>
  <text x="815" y="62" text-anchor="middle"
        font-family="${FD}" font-size="22" font-weight="700"
        fill="${T.violet}" filter="url(#vg)">${longest}d</text>
`;

// Divider
const div1=`<rect x="16" y="94" width="868" height="1" fill="${T.border}"/>`;
const div2=`<rect x="16" y="230" width="868" height="1" fill="${T.border}"/>`;

// Section label
const secLabel=(x,y,txt,col)=>
  `<text x="${x}" y="${y}" font-family="${F}" font-size="8"
         fill="${col||T.muted}" letter-spacing="3">${txt}</text>`;

// Mini heatmap — 26 weeks × 7 days
const CELL=10,GAP=2,STEP=CELL+GAP;
const HM_X=16,HM_Y=106;
const hmCells=recentWeeks.map((w,wi)=>
  w.contributionDays.map(d=>
    `<rect x="${HM_X+wi*STEP}" y="${HM_Y+d.weekday*STEP}"
           width="${CELL}" height="${CELL}" rx="2"
           fill="${logColor(d.contributionCount)}" opacity="${d.contributionCount===0?.5:.9}">
       <title>${d.date}: ${d.contributionCount}</title>
     </rect>`
  ).join('')
).join('');

// Language bar (placeholder — filled by generate-langs.js separately)
const langLabel = secLabel(16,240,`// CONTRIBUTION GRAPH — LAST 26 WEEKS`,T.cyan.replace('ff','88'));

// Mini activity sparkline — last 14 days
const last14=days.slice(-14);
const maxC=Math.max(...last14.map(d=>d.contributionCount),1);
const sparkW=26*STEP, sparkX=16;
const SPARK_Y=242, SPARK_H=50;
const sparkPts=last14.map((d,i)=>{
  const x=sparkX+i*(sparkW/14);
  const y=SPARK_Y+SPARK_H-(d.contributionCount/maxC*SPARK_H);
  return `${x},${y}`;
}).join(' ');

const sparkLine=last14.length>1?`
  <polyline points="${sparkPts}" fill="none"
            stroke="${T.cyan}" stroke-width="1.5" stroke-linecap="round"
            stroke-linejoin="round" opacity=".7"
            filter="url(#lg)"/>
  ${last14.map((d,i)=>{
    const x=sparkX+i*(sparkW/14);
    const y=SPARK_Y+SPARK_H-(d.contributionCount/maxC*SPARK_H);
    return `<circle cx="${x}" cy="${y}" r="2.5" fill="${T.cyan}" opacity=".8"/>`;
  }).join('')}
`:'';

// Bottom status bar
const statusBar=`
  <rect x="0" y="${H-26}" width="${W}" height="26" fill="${T.void2}"/>
  <rect x="0" y="${H-27}" width="${W}" height="1" fill="${T.border}"/>
  <text x="16" y="${H-10}" font-family="${F}" font-size="8"
        fill="${T.muted}" letter-spacing="2">SYS:00</text>
  <text x="80" y="${H-10}" font-family="${F}" font-size="8"
        fill="${T.muted}">|</text>
  <text x="96" y="${H-10}" font-family="${F}" font-size="8"
        fill="${T.muted}" letter-spacing="2">OPERATOR: NOOR ALHUSSAIN</text>
  <text x="320" y="${H-10}" font-family="${F}" font-size="8"
        fill="${T.muted}">|</text>
  <text x="336" y="${H-10}" font-family="${F}" font-size="8"
        fill="${T.muted}" letter-spacing="2">LOCATION: REPUBLIC OF IRAQ</text>
  <text x="560" y="${H-10}" font-family="${F}" font-size="8"
        fill="${T.muted}">|</text>
  <text x="576" y="${H-10}" font-family="${F}" font-size="8"
        fill="${T.muted}" letter-spacing="2">HANDLE: @NOORHACK</text>
  <!-- Online dot -->
  <circle cx="870" cy="${H-13}" r="4" fill="${T.green}">
    <animate attributeName="opacity" values="1;.3;1" dur="2s" repeatCount="indefinite"/>
  </circle>
  <text x="880" y="${H-10}" font-family="${F}" font-size="8"
        fill="${T.green}" letter-spacing="2">ONLINE</text>
`;

const svg=`<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <filter id="vg" x="-20%" y="-30%" width="140%" height="160%">
      <feGaussianBlur stdDeviation="3" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="lg" x="-5%" y="-30%" width="110%" height="160%">
      <feGaussianBlur stdDeviation="2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="${T.void}"/>
  <!-- Top + bottom borders -->
  <rect x="0" y="0"      width="${W}" height="1" fill="${T.border}"/>
  <rect x="0" y="${H-1}" width="${W}" height="1" fill="${T.border}"/>
  <!-- Left border accent -->
  <rect x="0" y="0" width="2" height="${H}" fill="${T.cyan}" opacity=".3"/>

  <!-- Section label -->
  ${secLabel(16,10,`// GITHUB METRICS — ${USERNAME}`,T.cyan.replace('ff','88'))}

  <!-- Stat cards -->
  ${statCards}
  ${streakPanels}
  ${div1}

  <!-- Heatmap label -->
  ${secLabel(16,103,'// CONTRIBUTION GRAPH — 26 WEEKS',T.cyan.replace('ff','88'))}

  <!-- Heatmap -->
  ${hmCells}

  ${div2}

  <!-- Sparkline label -->
  ${secLabel(16,240,'// ACTIVITY — LAST 14 DAYS',T.cyan.replace('ff','88'))}
  ${sparkLine}

  <!-- Status bar -->
  ${statusBar}
</svg>`;

writeFileSync(join(OUT_DIR,'dashboard.svg'),svg);
console.log('dashboard.svg written');
