/**
 * count-loc.js
 *
 * Counts lines of code across every source file that's actually
 * hand-written for this profile — SVG markup, JS/Rust/WGSL/GLSL shaders,
 * YAML workflows, and the README itself. Excludes anything generated,
 * vendored, or fetched from a CDN at runtime (node_modules, dist, target,
 * pkg, .git, and the data-driven SVGs in assets/generated which are
 * machine-written by the very scripts this counts).
 *
 * Output: stdout (consumed by update-readme-badges.js) and
 *         scripts/.loc-cache.json (so other tooling can read it without recounting)
 */

import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'dist-render', 'target', 'pkg',
  '.github_cache',
]);

// assets/generated/*.svg and assets/previews/* are machine-written output,
// not hand-authored source — excluded so the count reflects actual craft.
const EXCLUDE_PATH_SUBSTR = [
  '/assets/generated/',
  '/assets/previews/',
  '/assets/canvas/rust-engine/target/',
  '/assets/canvas/rust-engine/pkg/',
];

// Lockfiles are npm/yarn/pnpm-generated, not hand-authored, same reasoning
// as assets/generated/ above — matched by exact root-relative filename
// rather than a directory substring, since these live at repo root.
const EXCLUDE_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
]);

const COUNTED_EXT = new Set([
  '.svg', '.html', '.js', '.rs', '.wgsl', '.glsl',
  '.yml', '.yaml', '.md', '.json', '.toml', '.css',
]);

let totalLines = 0;
let totalFiles = 0;
const byExt = {};

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (EXCLUDE_DIRS.has(entry)) continue;
    if (EXCLUDE_PATH_SUBSTR.some(s => full.replace(/\\/g, '/').includes(s))) continue;

    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }

    if (st.isDirectory()) {
      walk(full);
    } else if (st.isFile()) {
      if (EXCLUDE_FILES.has(entry)) continue;
      const ext = extname(entry);
      if (!COUNTED_EXT.has(ext)) continue;
      try {
        const content = readFileSync(full, 'utf8');
        const lines = content.split('\n').length;
        totalLines += lines;
        totalFiles += 1;
        byExt[ext] = (byExt[ext] || 0) + lines;
      } catch {
        // binary or unreadable — skip
      }
    }
  }
}

walk(ROOT);

const result = { totalLines, totalFiles, byExt, generatedAt: new Date().toISOString() };

writeFileSync(join(__dirname, '.loc-cache.json'), JSON.stringify(result, null, 2));

console.log(`Total: ${totalLines.toLocaleString()} lines across ${totalFiles} files`);
console.log('By extension:');
Object.entries(byExt)
  .sort((a, b) => b[1] - a[1])
  .forEach(([ext, lines]) => console.log(`  ${ext.padEnd(8)} ${lines.toLocaleString()}`));

// Also export for programmatic use by update-readme-badges.js
export { totalLines, totalFiles, byExt };
