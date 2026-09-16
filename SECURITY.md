# Security Policy

This repository is a personal GitHub profile and portfolio — a set of static
sites, client-side visualizations, and CI automation. It doesn't handle user
authentication, store personal data beyond what GitHub itself already
exposes publicly, or run any server-side code beyond GitHub Actions.
That said, real security issues are still possible and worth reporting properly.

## In scope

- XSS or injection vectors in any of the `assets/canvas/*/index.html` interactive tools
- Supply-chain issues in `package.json` dependencies or GitHub Actions workflows
- Anything that would let a third party get a workflow in `.github/workflows/`
  to run with elevated permissions or exfiltrate secrets
- Logic bugs in `scripts/generate-integrity-manifest.js` that could make a
  tampered file appear to pass verification
- Content injection into the generated SVGs (`assets/generated/`) via
  crafted GitHub API responses

## Out of scope

- The **Memory Safety Visualizer** and **Timing Side-Channel Demo** in
  `assets/canvas/` are intentionally educational simulations. They don't
  touch real process memory or make network requests, so "this doesn't
  actually exploit anything" is expected behavior, not a bug.
- Rate-limiting or availability issues with third-party embeds
  (shields.io, komarev.com, capsule-render.vercel.app) — those are
  external services outside this repo's control.

## Reporting

Please report privately rather than opening a public issue:

- **Email:** noorhack.work@gmail.com
- **Subject line:** `[SECURITY] <short description>`

Include what you found, how to reproduce it, and — if you have one — a
suggested fix. I'll acknowledge within a few days and follow up once it's
triaged. If you'd like credit for the finding, say so in your report and
I'll add it once a fix ships; otherwise I'll keep it anonymous by default.

There's no bug bounty program attached to this repository — this is a
personal profile, not a funded product — but genuine reports are still
read, taken seriously, and fixed.
