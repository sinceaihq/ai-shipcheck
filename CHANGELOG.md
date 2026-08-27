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

## [Unreleased]

## [0.1.0] - 2026-08-27

First release.

### Added

- **63 evidence-backed rules** across nine production-readiness categories:
  security (14), auth (8), reliability (8), database (7), accessibility (7),
  AI cost and abuse controls (6), performance (5), testing (4) and
  observability (4). Every rule ships with documentation, a positive fixture,
  a negative fixture and tests.
- **Dependency-free lexical analysis** for JavaScript, TypeScript and JSX. A
  purpose-built scanner produces two masked views of each file so rules can
  match code without ever matching inside a comment, and match literal text
  when they genuinely need to.
- **Framework detection** for Next.js (both routers), React, Vite, Express,
  Fastify, Hono, NestJS, Remix, Astro, SvelteKit, Nuxt, Supabase, Firebase,
  Prisma, Drizzle, Mongoose, Stripe, the OpenAI and Anthropic SDKs, the Vercel
  AI SDK, LangChain, tRPC and the common test runners. Framework-specific rules
  only run when the framework is present.
- **Transparent scoring** with per-category scores, explicit `unassessed` and
  `not-applicable` states, diminishing returns for repeated findings, and
  blockers that force a `NOT READY` verdict regardless of the number. Every
  constant is documented in `docs/SCORING.md` and pinned by unit tests.
- **Four output formats**: a terminal report, versioned JSON, Markdown, and
  SARIF 2.1.0 suitable for GitHub code scanning.
- **A bundled GitHub Action** with `path`, `fail-on`, `min-score`, `config`,
  `sarif-file`, `annotations` and `summary` inputs, and `score`, `verdict`,
  `critical-count`, `high-count`, `medium-count`, `low-count`,
  `findings-count` and `sarif-file` outputs.
- **Optional configuration** through `shipcheck.config.json`, `.shipcheckrc.json`
  or a `"shipcheck"` key in `package.json`, with per-rule disabling, severity
  overrides, category disabling, exclusions and thresholds.
- **Safety guarantees**: nothing from the scanned repository is executed or
  imported, secrets are masked in every output, symlinks cannot escape the scan
  root, symlink loops terminate, and file size, file count, total bytes and
  directory depth are all bounded.

[Unreleased]: https://github.com/sinceaihq/ai-shipcheck/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/sinceaihq/ai-shipcheck/releases/tag/v0.1.0
