/**
 * update-readme-badges.js
 *
 * Updates two shields.io badges directly inside README.md between marker
 * comments — last build timestamp (proves the repo's automation is alive)
 * and total lines of hand-written code (see count-loc.js). Run as the final
 * step of update-readme.yml, after every other generator has run, so the
 * timestamp reflects a fully completed pipeline run rather than a partial one.
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { totalLines } from './count-loc.js';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const README_PATH = join(__dirname, '..', 'README.md');
const BUILD_BADGE_RE = /<!-- LAST_BUILD_BADGE_START -->[\s\S]*?<!-- LAST_BUILD_BADGE_END -->/;
const LOC_BADGE_RE   = /<!-- LOC_BADGE_START -->[\s\S]*?<!-- LOC_BADGE_END -->/;

let readme = readFileSync(README_PATH, 'utf8');

if (!BUILD_BADGE_RE.test(readme) || !LOC_BADGE_RE.test(readme)) {
  console.error(
    'ERROR: LAST_BUILD_BADGE or LOC_BADGE markers not found in README.md — ' +
    'nothing was written, to avoid a silent no-op that logs success without ' +
    'actually updating anything.'
  );
  process.exitCode = 1;
} else {

// ── Last build badge ───────────────────────────────────────────────────
const now = new Date();
const dateStr = now.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const dateEncoded = encodeURIComponent(dateStr).replace(/-/g, '--');

const buildBadge =
  `![Last Updated](https://img.shields.io/badge/last%20build-${dateEncoded}-00ff41?style=flat-square)`;

readme = readme.replace(
  BUILD_BADGE_RE,
  `<!-- LAST_BUILD_BADGE_START -->\n${buildBadge}\n<!-- LAST_BUILD_BADGE_END -->`
);

// ── LOC badge ───────────────────────────────────────────────────────────
const locStr = totalLines >= 1000
  ? `${(totalLines / 1000).toFixed(1)}k%20LOC`
  : `${totalLines}%20LOC`;

const locBadge =
  `![LOC](https://img.shields.io/badge/this%20repo-${locStr}%20hand--written-00ffff?style=flat-square)`;

readme = readme.replace(
  LOC_BADGE_RE,
  `<!-- LOC_BADGE_START -->\n${locBadge}\n<!-- LOC_BADGE_END -->`
);

writeFileSync(README_PATH, readme);
console.log(`Badges updated — build: ${dateStr}, LOC: ${totalLines.toLocaleString()}`);

}
