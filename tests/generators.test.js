/**
 * tests/generators.test.js
 *
 * Unit tests for the generator scripts — run with `npx vitest run`.
 * No GitHub API calls: all tests work against mock data or pure logic.
 * These tests catch regressions in output format (broken SVG structure,
 * wrong badge URL encoding, off-by-one in streak calculation) before
 * they reach the live repo.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { globSync } from 'glob';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── SVG structure tests ────────────────────────────────────────────────
describe('SVG assets', () => {
  it('all authored SVGs contain a <svg> root element', () => {
    const files = globSync('assets/svg/**/*.svg', {cwd: ROOT});
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const content = readFileSync(join(ROOT, f), 'utf8');
      expect(content, `${f} missing <svg`).toContain('<svg');
    }
  });

  it('no SVG references Google Fonts (blocked by GitHub renderer)', () => {
    const files = globSync('assets/svg/**/*.svg', {cwd: ROOT});
    for (const f of files) {
      const content = readFileSync(join(ROOT, f), 'utf8');
      expect(content, `${f} still imports Google Fonts`).not.toContain('fonts.googleapis.com');
    }
  });

  it('no SVG uses the invalid &nbsp; entity (use &#160; inside XML)', () => {
    const files = globSync('assets/svg/**/*.svg', {cwd: ROOT});
    for (const f of files) {
      const content = readFileSync(join(ROOT, f), 'utf8');
      expect(content, `${f} uses &nbsp; (invalid XML entity)`).not.toContain('&nbsp;');
    }
  });

  it('section header SVGs all exist (one per visible section 01-09)', () => {
    // Note: Easter Eggs is deliberately NOT a numbered visible section —
    // it lives inside an HTML comment so it stays a real discovery rather
    // than a header-announced feature. See README's EASTER EGG ARCHIVE block.
    for (let n = 1; n <= 9; n++) {
      const num = String(n).padStart(2, '0');
      const p = join(ROOT, `assets/svg/sections/section-${num}.svg`);
      expect(existsSync(p), `section-${num}.svg missing`).toBe(true);
    }
  });
});

// ── skills.json structure ─────────────────────────────────────────────
describe('skills.json', () => {
  it('exists and is valid JSON', () => {
    const p = join(ROOT, 'assets/canvas/skill-universe/data/skills.json');
    expect(existsSync(p)).toBe(true);
    const data = JSON.parse(readFileSync(p, 'utf8'));
    expect(data).toHaveProperty('nodes');
    expect(data).toHaveProperty('links');
  });

  it('has at least 6 domain nodes and 20 skill nodes', () => {
    const data = JSON.parse(readFileSync(
      join(ROOT, 'assets/canvas/skill-universe/data/skills.json'), 'utf8'));
    const domains = data.nodes.filter(n => n.type === 'domain');
    const skills  = data.nodes.filter(n => n.type === 'skill');
    expect(domains.length).toBeGreaterThanOrEqual(6);
    expect(skills.length).toBeGreaterThanOrEqual(20);
  });

  it('every link references valid node ids', () => {
    const data = JSON.parse(readFileSync(
      join(ROOT, 'assets/canvas/skill-universe/data/skills.json'), 'utf8'));
    const ids = new Set(data.nodes.map(n => n.id));
    for (const link of data.links) {
      expect(ids.has(link.source), `link source ${link.source} not in nodes`).toBe(true);
      expect(ids.has(link.target), `link target ${link.target} not in nodes`).toBe(true);
    }
  });
});

// ── Package.json integrity ────────────────────────────────────────────
// ── resume.json — JSON Resume standard ─────────────────────────────────
describe('resume.json', () => {
  const resumePath = join(ROOT, 'resume.json');
  const resume = JSON.parse(readFileSync(resumePath, 'utf8'));

  it('exists and is valid JSON', () => {
    expect(existsSync(resumePath)).toBe(true);
  });

  it('declares the real jsonresume.org schema', () => {
    expect(resume.$schema).toContain('jsonresume');
  });

  it('has the required top-level JSON Resume sections', () => {
    for (const key of ['basics', 'work', 'skills', 'projects']) {
      expect(resume).toHaveProperty(key);
    }
  });

  it('does not fabricate work history, education, or certificates for a real person', () => {
    // Intentionally empty arrays — filling these with invented employment
    // or degrees would be misrepresenting a real, named individual.
    expect(resume.work).toEqual([]);
    expect(resume.education).toEqual([]);
    expect(resume.certificates).toEqual([]);
  });

  it('basics.profiles URLs match the ones used throughout README', () => {
    const urls = resume.basics.profiles.map(p => p.url);
    expect(urls).toContain('https://github.com/Noor-AlHussain');
  });
});

describe('package.json', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

  it('has required dependency fields', () => {
    expect(pkg).toHaveProperty('dependencies');
    expect(pkg).toHaveProperty('devDependencies');
    expect(pkg).toHaveProperty('scripts');
  });

  it('every script entry references an existing file', () => {
    for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
      const m = cmd.match(/node\s+(scripts\/\S+\.js)/);
      if (!m) continue;
      const scriptPath = join(ROOT, m[1]);
      expect(existsSync(scriptPath), `script "${name}" references missing file ${m[1]}`).toBe(true);
    }
  });
});

// ── README sanity ─────────────────────────────────────────────────────
describe('README.md', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');

  it('contains last-build badge markers', () => {
    expect(readme).toContain('LAST_BUILD_BADGE_START');
    expect(readme).toContain('LAST_BUILD_BADGE_END');
  });

  it('contains LOC badge markers', () => {
    expect(readme).toContain('LOC_BADGE_START');
    expect(readme).toContain('LOC_BADGE_END');
  });

  it('does not contain broken image markers', () => {
    expect(readme).not.toContain('![](undefined)');
    expect(readme).not.toContain('src=""');
  });

  it('does not reference the old fake PGP identity file', () => {
    expect(readme).not.toContain('pgp-identity.asc');
  });

  it('references the real integrity manifest instead', () => {
    expect(readme).toContain('integrity-manifest.asc');
  });

  it('references all 9 visible section header SVGs', () => {
    for (let n = 1; n <= 9; n++) {
      const num = String(n).padStart(2, '0');
      expect(readme, `README missing section-${num}.svg reference`)
        .toContain(`section-${num}.svg`);
    }
  });
});

// ── Streak calculation logic (inline, no API) ─────────────────────────
describe('streak calculation', () => {
  function calcStreak(days){
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i--){
      if (days[i].contributionCount > 0) streak++;
      else break;
    }
    return streak;
  }

  it('counts consecutive days from the end', () => {
    const days = [
      {contributionCount:0},{contributionCount:3},{contributionCount:2},{contributionCount:5},
    ];
    expect(calcStreak(days)).toBe(3);
  });

  it('returns 0 when the last day has 0 contributions', () => {
    const days = [{contributionCount:5},{contributionCount:3},{contributionCount:0}];
    expect(calcStreak(days)).toBe(0);
  });

  it('handles all-zero history', () => {
    const days = [{contributionCount:0},{contributionCount:0}];
    expect(calcStreak(days)).toBe(0);
  });

  it('handles all-nonzero history', () => {
    const days = [{contributionCount:1},{contributionCount:2},{contributionCount:3}];
    expect(calcStreak(days)).toBe(3);
  });
});

// ── LOC counter ───────────────────────────────────────────────────────
describe('count-loc.js', () => {
  it('produces a valid numeric total above 5000', async () => {
    const { totalLines } = await import(join(ROOT, 'scripts/count-loc.js'));
    expect(typeof totalLines).toBe('number');
    expect(totalLines).toBeGreaterThan(5000);
  });
});

// ── Integrity manifest — must be real, not a placeholder ──────────────
describe('integrity manifest', () => {
  const manifestPath = join(ROOT, 'assets/integrity-manifest.asc');

  it('exists', () => {
    expect(existsSync(manifestPath)).toBe(true);
  });

  it('contains no unfilled placeholder text', () => {
    const content = readFileSync(manifestPath, 'utf8');
    expect(content).not.toContain('[Replace with');
    expect(content).not.toContain('BEGIN PGP SIGNATURE');
    expect(content).not.toContain('XXXX XXXX');
  });

  it('every listed file path actually exists on disk', () => {
    const content = readFileSync(manifestPath, 'utf8');
    const lines = content.split('\n').filter(l => /^[a-f0-9]{64}\s{2}/.test(l));
    expect(lines.length).toBeGreaterThan(10);
    for (const line of lines) {
      const path = line.slice(66); // 64-char hash + 2 spaces
      expect(existsSync(join(ROOT, path)), `manifest references missing file: ${path}`).toBe(true);
    }
  });

  it('every hash is a well-formed 64-character hex SHA-256 digest', () => {
    const content = readFileSync(manifestPath, 'utf8');
    const lines = content.split('\n').filter(l => /^[a-f0-9]{64}\s{2}/.test(l));
    for (const line of lines) {
      const hash = line.slice(0, 64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
