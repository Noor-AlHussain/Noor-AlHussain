/**
 * generate-research.js
 *
 * Reads data/research-log.yaml — the single source of truth for the
 * RESEARCH LOG section — and renders its entries into README.md between
 * the RESEARCH_LOG_START/END markers. This is what makes that YAML file
 * load-bearing instead of decorative: edit the data, run this script
 * (or let the workflow run it), and the README updates itself.
 *
 * Run: node scripts/generate-research.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'yaml';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const ROOT        = join(__dirname, '..');
const DATA_PATH   = join(ROOT, 'data', 'research-log.yaml');
const README_PATH = join(ROOT, 'README.md');

const TYPE_BADGE = {
  research:    { label: 'RESEARCH',    color: 'ff003c' },
  ctf:         { label: 'CTF',         color: 'ff6600' },
  learning:    { label: 'LEARNING',    color: '00ffff' },
  publication: { label: 'PUBLICATION', color: '8a2be2' },
  talk:        { label: 'TALK',        color: '00ff41' },
};

const STATUS_LABEL = {
  published:   'PUBLISHED',
  'in-progress': 'IN PROGRESS',
  planned:     'PLANNED',
};

function loadEntries() {
  const raw = readFileSync(DATA_PATH, 'utf8');
  const data = parse(raw);
  const entries = (data && data.entries) || [];
  // Most recent first
  return entries.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
}

function renderEntry(e, i) {
  const badge = TYPE_BADGE[e.type] || { label: (e.type || 'NOTE').toUpperCase(), color: '888888' };
  const num = String(i + 1).padStart(3, '0');
  const tags = (e.tags || []).map(t => `\`${t}\``).join(' ');
  const status = STATUS_LABEL[e.status] || e.status || '';
  const titleLine = e.link
    ? `**[RL-${num}]** \`${e.date}\` — [${e.title}](${e.link})`
    : `**[RL-${num}]** \`${e.date}\` — ${e.title}`;

  return [
    `![${badge.label}](https://img.shields.io/badge/${encodeURIComponent(badge.label)}-${status ? encodeURIComponent(status) : '-'}-${badge.color}?style=flat-square)`,
    '',
    titleLine,
    '',
    tags,
    '',
    (e.summary || '').trim(),
  ].join('\n');
}

function renderSection(entries) {
  if (entries.length === 0) {
    return '_No entries yet — add one to `data/research-log.yaml`._';
  }
  return entries.map(renderEntry).join('\n\n<br/>\n\n');
}

const entries = loadEntries();
const rendered = renderSection(entries);

const MARKER_RE = /<!-- RESEARCH_LOG_START -->[\s\S]*?<!-- RESEARCH_LOG_END -->/;

let readme = readFileSync(README_PATH, 'utf8');

// Check whether the markers exist directly — do NOT infer this from
// whether readme.replace() changed the string. When the README is
// already in sync with research-log.yaml, the regex matches and the
// replacement text is byte-identical to what's already there, so a
// "did the content change" check wrongly reports "markers not found"
// on every already-in-sync run and sets a nonzero exit code, which
// (since GitHub Actions run: steps default to `bash -e`) aborts
// validate-assets.yml's sync-check step before it ever reaches the
// actual git diff, silently filing a false "out of sync" issue.
if (!MARKER_RE.test(readme)) {
  console.warn('WARNING: RESEARCH_LOG markers not found in README.md — nothing was replaced.');
  process.exitCode = 1;
} else {
  readme = readme.replace(
    MARKER_RE,
    `<!-- RESEARCH_LOG_START -->\n${rendered}\n<!-- RESEARCH_LOG_END -->`
  );
  writeFileSync(README_PATH, readme);
  console.log(`Research log rendered: ${entries.length} entries written to README.md`);
}
