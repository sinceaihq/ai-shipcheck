# Changelog

All notable changes to AI Shipcheck are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Two things beyond the code are part of the public contract and are versioned
accordingly:

- **Rule ids** — used in configuration and in SARIF. Renaming one is a breaking
  change; removing one is a breaking change.
- **The JSON schema** — reported as `schemaVersion` in every JSON report.
  Changes to its shape bump that version and are listed here.

The full policy is in [docs/RELEASING.md](docs/RELEASING.md).

## [Unreleased]

## [1.0.1] - 2026-08-28

Documentation and repository hygiene. No change to analysis behaviour: the
rules, the scoring model and the JSON schema are identical to 1.0.0.

### Fixed

- `package-lock.json` still declared version `0.1.0` after the 1.0.0 release,
  so the repository advertised two different versions for the same release.
- Three links in the extracted documentation pages pointed at paths relative to
  the repository root rather than to `docs/`.

### Changed

- The canonical contact is now **builders@sinceai.fi**. `SECURITY.md` names
  GitHub private vulnerability reporting as the route to use and keeps email as
  the fallback; `CODE_OF_CONDUCT.md` moves to the same address.
- `SECURITY.md` states 1.x supported and <1.0 unsupported, replacing a
  pre-1.0 policy, and describes response expectations we can actually hold to
  rather than publishing an SLA.
- The README is 212 lines rather than 422, focused on the first two minutes.
  Nothing was deleted: the CLI reference moved to `docs/cli.md` and the
  guarantees, validation and performance material to `docs/trust.md`.
- Dependabot raises major updates individually instead of grouping them. A
  grouped update bundling six majors could not install, because it moved
  TypeScript to 7 while leaving `typescript-eslint` on a version peering
  `typescript <6.1.0`. `@types/node` is now held at the supported Node floor.

### Added

- `SUPPORT.md` — where each kind of report belongs, and what to expect.
- `CLAUDE.md` — the durable working rules for this repository.
- `docs/cli.md` and `docs/trust.md`.
- A release-gate check that the README's sample output matches the current
  version, so it cannot silently go stale again.

## [1.0.0] - 2026-08-27

First stable release.

### Added

- **63 evidence-backed rules** across nine production-readiness categories:
  security (14), auth (8), reliability (8), database (7), accessibility (7),
  AI cost and abuse controls (6), performance (5), testing (4) and
  observability (4). Every rule ships with generated documentation, a positive
  fixture, a negative fixture and tests.
- **Dependency-free lexical analysis** for JavaScript, TypeScript and JSX. A
  purpose-built scanner produces two masked views of each file so rules can
  match code without ever matching inside a comment, and match literal text
  when they genuinely need to.
- **Framework detection** for Next.js (both routers), React, Vite, Express,
  Fastify, Hono, NestJS, Remix, Astro, SvelteKit, Nuxt, Supabase, Firebase,
  Prisma, Drizzle, Mongoose, Stripe, the OpenAI and Anthropic SDKs, the Vercel
  AI SDK, LangChain, tRPC and the common test runners. Dependencies are read
  from every `package.json` in the tree, so monorepos are detected correctly.
- **Transparent scoring** with per-category scores, explicit `unassessed` and
  `not-applicable` states, diminishing returns for repeated findings, and
  blockers that force a `NOT READY` verdict regardless of the number. Every
  constant is documented in `docs/SCORING.md` and pinned by unit tests.
- **Assessment coverage** in every report — how many checks ran, how many did
  not apply, how many could not be evaluated. Counts, not a synthesised
  percentage.
- **Partial-scan reporting.** When a resource limit stops the walk before the
  project has been read, the report leads with a `PARTIAL SCAN` banner and the
  JSON sets `stats.truncated`.
- **Four output formats**: a terminal report, versioned JSON, Markdown, and
  SARIF 2.1.0 suitable for GitHub code scanning.
- **A bundled GitHub Action** with `path`, `fail-on`, `min-score`, `config`,
  `sarif-file`, `annotations` and `summary` inputs, and `score`, `verdict`,
  `critical-count`, `high-count`, `medium-count`, `low-count`,
  `findings-count` and `sarif-file` outputs.
- **Optional configuration** through `shipcheck.config.json`, `.shipcheckrc.json`
  or a `"shipcheck"` key in `package.json`, with per-rule disabling, severity
  overrides, category disabling, exclusions and thresholds.
- **A reproducible validation corpus** of 20 public repositories pinned by
  commit SHA, with the harness (`npm run corpus:scan`), the results, and the
  triage record in `corpus/`.
- **Clean-room package verification** (`npm run verify:package`): 50 checks
  covering package metadata, tarball contents and CLI behaviour from an
  installed tarball, with the registry made unreachable so the assertions
  cannot pass by downloading a published copy.
- **Safety guarantees**: nothing from the scanned repository is executed or
  imported, secrets are masked in every output, symlinks cannot escape the scan
  root, symlink loops terminate, and file size, file count, total bytes and
  directory depth are all bounded.

### Validated

Run against 20 real public repositories — Next.js applications, Express and
Fastify services, ORMs, AI applications and large monorepos — and every rule
that fired was triaged against the real code. Findings fell from 5,710 to
2,819, a **51% reduction**, entirely through narrowing what rules claim rather
than suppressing projects. Each fix carries a regression test named after the
repository it came from. See [corpus/TRIAGE.md](corpus/TRIAGE.md).

Notable corrections found this way:

- **Line numbers were wrong in any file containing a multi-line comment.** The
  tokeniser consumed block comments in a single jump, so newlines inside them
  went uncounted and every position after a licence header or JSDoc block was
  reported too low. Line starts are now computed in a dedicated pass.
- `security/hardcoded-secret` reported translated user-facing text as a
  credential, because Shannon entropy is measured per character and CJK prose
  scores higher than an API key. It was a *blocking* finding on a localisation
  file.
- `database/supabase-missing-rls` demanded row-level security of unrelated
  Prisma migrations in any repository that also shipped a Supabase adapter.
- `database/raw-sql-interpolation` reported `Prisma.sql` and `sql<number>` —
  the documented *safe* forms — as injection.
- `performance/unbounded-query` treated `findMany({ where: … })` as a table
  scan.
- `reliability/missing-fetch-timeout` fired in 17 of 20 repositories, which
  amounted to reporting that a codebase uses `fetch`.
- `accessibility/form-control-missing-label` did not recognise
  `<label><input/></label>`, which is valid HTML.

### Changed

- `testing/focused-or-skipped-test` is replaced by **`testing/focused-test`**.
  A committed `.skip` is normal and deliberate in a mature suite; reporting
  hundreds of them was noise. The rule now reports only `.only`, which silently
  disables the rest of a file.
- Accessibility rules and `ai-cost/ai-key-exposed-to-client` now report
  `not-applicable` when there is no rendered UI or no model SDK, instead of
  passing. A free 100 in an irrelevant category raises the overall score, which
  is a weighted mean over assessed categories.
- File-scoped rules skip examples, templates, benchmarks, playgrounds,
  documentation, end-to-end suites and generated bindings. The sole exception
  is `reliability/debug-mode-in-production`, which must read build
  configuration by design.

### Fixed

- A closed downstream pipe (`ai-shipcheck . --format json | head`) no longer
  raises an unhandled `EPIPE` and prints a Node stack trace over a working
  scan.
- The CLI no longer exits silently when invoked through the
  `node_modules/.bin` symlink npm installs. The entry-point check compared raw
  paths, which never matched through a symlink, so `npx ai-shipcheck` did
  nothing at all and exited 0.
- A rule can no longer report the same location twice. Several rules match
  through a list of alternative patterns, and one call site could satisfy two
  of them — cluttering the report and double-counting against the score.
- Project-level findings now cite a real file and a real line. Some pointed at
  a directory, which produces a SARIF location no tool can open, and others
  carried a snippet that was not in the file.
- Resource limits that truncate a scan are surfaced in the report and in
  `stats.truncated` instead of being silently discarded.

[Unreleased]: https://github.com/sinceaihq/ai-shipcheck/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/sinceaihq/ai-shipcheck/releases/tag/v1.0.1
[1.0.0]: https://github.com/sinceaihq/ai-shipcheck/releases/tag/v1.0.0
