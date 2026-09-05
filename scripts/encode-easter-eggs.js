/**
 * encode-easter-eggs.js
 * Injects hidden messages into SVG metadata and placeholder files.
 *
 * Easter eggs:
 *   1. Base64-encoded message in SVG <desc> tags
 *   2. Hex-encoded fingerprint in SVG <metadata>
 *   3. README HTML comment with encoded challenge
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

// ── Secret messages ───────────────────────────────────────────────────────
const MSG_PLAIN = [
  'If you are reading this, you know how to look beneath the surface.',
  'That is the first requirement.',
  'Identity: Noor AlHussain — github.com/Noor-AlHussain',
  'Stack: Silicon to AI. No layer untouched.',
].join(' ');

const CHALLENGE = 'Decode this: 4e6f6f7220416c487573736169 6e202d204e6f6f7248 61636b';

const base64Msg = Buffer.from(MSG_PLAIN).toString('base64');

// ── Inject into glitch-name.svg ───────────────────────────────────────────
const glitchPath = join(ROOT, 'assets', 'svg', 'hero', 'glitch-name.svg');
let glitch = readFileSync(glitchPath, 'utf8');

if (!glitch.includes('<metadata>')) {
  glitch = glitch.replace(
    '<defs>',
    `<metadata>
  <!-- Easter Egg 1 (Base64): ${base64Msg} -->
  <!-- Easter Egg 2 (Hex challenge): ${CHALLENGE} -->
  <!-- Integrity: see assets/integrity-manifest.asc for real, verifiable SHA-256 checksums -->
  <!-- Hint: The answer is in the commit history. -->
</metadata>
<defs>`
  );
  writeFileSync(glitchPath, glitch);
  console.log('Injected easter eggs into glitch-name.svg');
}

// ── Inject into signal-intercept.svg ─────────────────────────────────────
const sigPath = join(ROOT, 'assets', 'svg', 'diagrams', 'signal-intercept.svg');
let sig = readFileSync(sigPath, 'utf8');

if (!sig.includes('<metadata>')) {
  sig = sig.replace(
    '<defs>',
    `<metadata>
  <!-- CLASSIFIED Channel: Decode to access — ${Buffer.from('noorhack.work@gmail.com').toString('hex')} -->
</metadata>
<defs>`
  );
  writeFileSync(sigPath, sig);
  console.log('Injected easter eggs into signal-intercept.svg');
}

// ── Integrity manifest is handled separately ──────────────────────────────
// See scripts/generate-integrity-manifest.js — it produces a real,
// independently verifiable SHA-256 checksum list (assets/integrity-manifest.asc)
// rather than anything claiming to be a cryptographic signature this script
// has no key material to actually produce.

console.log('\nAll easter eggs injected successfully.');
console.log(`Base64 message: ${base64Msg.slice(0, 40)}...`);
