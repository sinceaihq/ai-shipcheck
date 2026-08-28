# AI Shipcheck — working rules

Local-first production-readiness scanner for JavaScript and TypeScript. Points
at a repository, reports whether it is ready to deploy, cites evidence for
every finding.

Released and stable at v1.0.0. **Do not start v1.1 feature development.**

@CONTRIBUTING.md
@GOVERNANCE.md

## What this project optimises for

Trust, not rule count. A scanner people stop reading is worse than no scanner.

- **A false positive costs more than a missed finding gains.** When in doubt,
  do not report.
- **Evidence over inference.** Every actionable finding cites a file, a line
  and a snippet. If a check cannot point at something concrete, it belongs in
  documentation, not in the rule set.
- **Unassessed over manufactured certainty.** A check that could not run is
  reported as `unassessed` and excluded from the score. Never award a free 100.
- **Precision over coverage.** Removing a noisy rule is a valid fix. A smaller
  trustworthy rule set beats a larger one.

## Hard constraints

Breaking any of these is a release blocker, and each is enforced by tests:

- Never execute, import, evaluate or resolve code from a scanned repository.
  Files are read as bytes and analysed lexically.
- No network access during a scan. No telemetry. Nothing is uploaded.
- Secrets are masked everywhere they could be printed.
- Symlinks may not escape the scan root; symlink loops terminate; file size,
  count, bytes and depth are bounded, and truncation is reported.
- Runtime dependencies stay minimal. There is exactly one (`ignore`). A second
  needs a real argument.

## Public v1 contract

Changing any of these is a **major** version:

- Rule ids (used in user config and SARIF)
- The JSON `schemaVersion`
- CLI flags and exit codes

`docs/RELEASING.md` has the full table of what bumps which component.

## Before changing anything

| Change | Required |
| --- | --- |
| Any meaningful change | A test that fails if the behaviour is removed |
| A rule | A vulnerable fixture *and* a secure fixture, plus near-miss cases in `tests/integration/rules.test.ts` |
| A rule, the lexer, or detection | `npm run corpus:scan` before and after; explain any large movement |
| A fixed false positive | A regression test naming where it was found |

The build enforces the fixture rules: a rule that never fires on a vulnerable
fixture fails, and any rule firing on a secure fixture fails.

## Commands

```bash
npm run check          # types, lint, format, docs sync, tests, build
npm run gate           # the full release gate (superset of check)
npm run corpus:sync    # clone the 20 pinned validation repositories
npm run corpus:scan    # scan them, write corpus/results/
npm run verify:package # pack, install clean-room, drive the CLI
```

## Releasing

Only through the `release.yml` workflow with npm Trusted Publishing (OIDC).
**Never add an npm token** — there is none in the repository, in a secret, or
on anyone's machine, and a gate enforces that. Process and versioning policy:
`docs/RELEASING.md`.

The `v1` tag moves only for releases compatible with v1.

## Conventions

- Development happens through reviewed pull requests; `main` is protected.
- Commit messages are plain human engineering prose. No AI attribution.
- Rule documentation under `docs/rules/` is generated from rule metadata —
  edit the rule, then run `npm run docs:rules`.
- Claims must be checkable. No invented benchmarks, adoption numbers or
  testimonials. This is static analysis, not security certification, and every
  report says so.

## Contact

Security: GitHub private vulnerability reporting first (see `SECURITY.md`).
Everything else: `builders@sinceai.fi`.
