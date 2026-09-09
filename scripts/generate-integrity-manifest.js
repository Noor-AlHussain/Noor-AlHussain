/**
 * generate-integrity-manifest.js
 *
 * Replaces what used to be a fake PGP signature block (a "-----BEGIN PGP
 * SIGNATURE-----" wrapper around the literal placeholder text
 * "[Replace with your actual PGP signature]") with something that is
 * actually real: a SHA-256 checksum manifest of this repo's own
 * hand-authored source files.
 *
 * Why this instead of PGP: a signature implies possession of a private
 * key and a verifier implies a trusted public key exchange — neither of
 * which this script can honestly provide. A checksum manifest makes no
 * such claim. It says exactly what it is: "these are the hashes of these
 * files as of this commit," and anyone can verify it themselves with a
 * standard tool, no key exchange required:
 *
 *   sha256sum -c assets/integrity-manifest.asc
 *
 * GNU coreutils sha256sum silently skips lines that aren't in
 * "<hash>  <path>" format (with a summary warning), so the human-readable
 * header below doesn't break `--check` — every hash line beneath it is
 * independently verifiable.
 *
 * Run: node scripts/generate-integrity-manifest.js
 */

import { readFileSync, writeFileSync, statSync } from 'fs';
import { createHash } from 'crypto';
import { globSync } from 'glob';
import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const OUT_PATH  = join(ROOT, 'assets', 'integrity-manifest.asc');

// Curated, stable list of hand-authored entry points — not "everything in
// the repo" (generated assets change daily and would make this manifest
// noisy and useless as a signal). This lists the files whose integrity
// actually matters to a reader deciding whether to trust the source.
const MANIFEST_GLOBS = [
  'README.md',
  'ARCHITECTURE.md',
  'SETUP.md',
  'LICENSE',
  'SECURITY.md',
  'package.json',
  'lighthouserc.json',
  'resume.json',
  'scripts/*.js',
  'assets/canvas/*/index.html',
  'assets/canvas/rust-engine/Cargo.toml',
  'assets/canvas/rust-engine/LICENSE',
  'assets/canvas/rust-engine/src/*.rs',
  'assets/canvas/rust-engine/src/*.wgsl',
  '.github/workflows/*.yml',
];

function sha256(filePath) {
  const data = readFileSync(filePath);
  return createHash('sha256').update(data).digest('hex');
}

const files = MANIFEST_GLOBS
  .flatMap(pattern => globSync(pattern, { cwd: ROOT }))
  .filter((v, i, arr) => arr.indexOf(v) === i) // dedupe
  .sort();

const lines = files.map(rel => {
  const abs = join(ROOT, rel);
  const hash = sha256(abs);
  // sha256sum -c expects exactly: "<hash>  <path>" (two spaces, binary mode marker optional)
  return `${hash}  ${rel}`;
});

const generatedAt = new Date().toISOString();

const manifest = `# NoorHack — Repository Integrity Manifest
#
# This is a real, independently verifiable SHA-256 checksum list, not a
# cryptographic signature — no private key is involved and none is claimed.
# It answers one honest question: "are these files, byte for byte, what
# the author committed?" It does not answer "did a specific person commit
# them" the way a real PGP signature would; treat it accordingly.
#
# Verify from the repository root:
#   sha256sum -c assets/integrity-manifest.asc
#
# Lines above the checksums (like this header) are automatically skipped
# by sha256sum's --check mode; only the "<hash>  <path>" lines below are
# evaluated.
#
# Generated: ${generatedAt}
# Files covered: ${files.length}
# Generator: scripts/generate-integrity-manifest.js (run on every update-readme.yml pipeline)
#
${lines.join('\n')}
`;

writeFileSync(OUT_PATH, manifest);
console.log(`integrity-manifest.asc written — ${files.length} files hashed`);
