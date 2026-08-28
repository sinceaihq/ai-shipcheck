# AI Shipcheck

**Your AI says it's done. Shipcheck tells you if it's ready to ship.**

[![CI](https://github.com/sinceaihq/ai-shipcheck/actions/workflows/ci.yml/badge.svg)](https://github.com/sinceaihq/ai-shipcheck/actions/workflows/ci.yml)
[![Package integrity](https://github.com/sinceaihq/ai-shipcheck/actions/workflows/package.yml/badge.svg)](https://github.com/sinceaihq/ai-shipcheck/actions/workflows/package.yml)
[![npm](https://img.shields.io/npm/v/ai-shipcheck.svg)](https://www.npmjs.com/package/ai-shipcheck)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)

```bash
npx ai-shipcheck .
```

**No signup. No API key. No source-code upload. Runs entirely on your machine.**

Point it at a JavaScript or TypeScript repository and get an evidence-backed
production-readiness assessment across nine dimensions. Every finding cites a
file, a line, and a rule you can look up.

---

```
   NOT READY   61/100 across 41 assessed checks                        my-app

  Detected: Next.js, React, Supabase, Vitest, Next.js App Router · TypeScript · tests present
  Assessed: 41 of 63 checks run · 7/9 categories scored · 9 files · 3 not assessed

  Security                        ██████████░░░░░░   60  1 finding
  Authentication & Authorization  ████████░░░░░░░░   52  2 findings
  Database & Data Safety          ░░░░░░░░░░░░░░░░    0  7 findings
  Reliability                     ████████████████   98  1 finding
  Testing                         ███████████░░░░░   71  3 findings
  Observability                   ███████████████░   92  1 finding
  Performance                     ███████████████░   92  3 findings
  Accessibility                   ················  not assessed
  AI Cost & Abuse Controls        ················  n/a

  Findings

  CRITICAL BLOCKER Service-role key read through a browser-visible environment variable
      lib/supabase-admin.ts:5:27
      │ process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!,
      lib/supabase-admin.ts reads the Supabase service-role key from a variable with a public
      build-time prefix. The value is inlined into the browser bundle, granting every visitor full,
      RLS-bypassing access to the database.
      Fix: Use the anon key in the browser and rely on row-level security for access control. Keep
           the service-role key in server-only code - a route handler, server action, or edge
           function - and rotate it immediately if it has ever been in a client bundle.
      auth/supabase-service-role-exposure · confidence high · ai-shipcheck explain auth/…

  CRITICAL BLOCKER Table "profiles" is created without row-level security
      supabase/migrations/0001_init.sql:3:1
      │ create table public.profiles (
      supabase/migrations/0001_init.sql creates public.profiles and no migration enables row-level
      security on it. With RLS off, every row is readable through the public PostgREST API using the
      anon key that ships in your client bundle.
      Fix: Enable RLS on the table and add explicit policies for each operation you intend to allow.
      database/supabase-missing-rls · confidence high · ai-shipcheck explain database/…

  Verdict

  · 4 blocking issues must be fixed before deploying. A blocker forces NOT READY regardless of score.
  · Weakest category: Database & Data Safety at 0/100 (7 findings).

  Scanned 9 files in 23 ms · 41 checks run, 19 not applicable, 3 not assessed · ai-shipcheck v0.1.0
  Static analysis of source code - not a security certification.
```

*Real output from `fixtures/vulnerable-supabase`, trimmed for length.*

---

## Why this exists

AI coding tools are very good at producing code that runs. They are much less
good at producing code that survives contact with production, and they will
tell you the work is finished either way.

The gaps are consistent and boring: the Supabase table nobody enabled RLS on,
the route handler that writes to the database without checking who is calling,
the `NEXT_PUBLIC_` variable holding a secret, the LLM endpoint with no rate
limit and no token cap. None of these are exotic. All of them are expensive.

Shipcheck looks for exactly those, statically, on your machine.

## What it is not

- **Not a security certification.** It is static analysis of source code. It
  cannot see your infrastructure, your database settings, your WAF, or anything
  configured at deploy time.
- **Not a replacement for review.** A clean report means the checks it knows
  how to make found nothing — not that the code is correct.
- **Not exhaustive.** It reports what it can back with evidence, and it tells
  you what it could not assess rather than quietly scoring it as a pass.

## Install

Nothing to install:

```bash
npx ai-shipcheck .
```

Or add it to a project:

```bash
npm install --save-dev ai-shipcheck
```

Requires Node.js 22 or newer.

## Usage

```bash
ai-shipcheck .                    # scan the current directory
ai-shipcheck scan apps/web        # scan a subdirectory
ai-shipcheck rules                # list every rule
ai-shipcheck explain <rule-id>    # full documentation for one rule
```

### Options

| Flag | Description |
| --- | --- |
| `-f, --format <format>` | `pretty` (default), `json`, `markdown`, `sarif` |
| `-o, --output <file>` | Write the report to a file instead of stdout |
| `--fail-on <severity>` | Exit `1` if any finding is this severity or worse |
| `--min-score <number>` | Exit `1` if the overall score is below this (0–100) |
| `-c, --config <file>` | Use a specific configuration file |
| `--no-color` | Disable ANSI colour |
| `-q, --quiet` | Only print findings and the verdict |
| `-h, --help` | Show help |
| `-v, --version` | Print the version |

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Scan completed and every configured threshold was met |
| `1` | Scan completed but `--fail-on` or `--min-score` was not satisfied |
| `2` | Usage error: bad flag, missing target, invalid configuration |
| `3` | Shipcheck itself failed — please [report it](https://github.com/sinceaihq/ai-shipcheck/issues) |

Findings alone never fail the command. You opt into failure with `--fail-on`
or `--min-score`, so adding Shipcheck to an existing pipeline is a safe,
reversible step.

## What it checks

Nine categories, scored independently.

| Category | Examples |
| --- | --- |
| **Security** | Hardcoded credentials, secrets behind `NEXT_PUBLIC_`, `eval`, shell injection, open redirects, permissive CORS, TLS verification disabled, weak crypto, credentials in logs |
| **Auth** | Route handlers that write without an authorisation check, server actions with no auth, browser-only privilege checks, unverified webhooks, unsigned JWTs, Supabase service-role keys reachable from the client |
| **Database** | Tables created without row-level security, `USING (true)` policies, SQL built by interpolation, deletes with no filter, destructive migrations, connection strings in source |
| **Reliability** | Swallowed errors, missing timeouts in request paths, unhandled rejections, retry loops with no backoff, `process.exit` in a request path, builds configured to ignore type errors |
| **Testing** | No tests at all, CI missing test/build/typecheck steps, `.only` committed, server code with no test referencing it |
| **Observability** | No error monitoring, `console`-only server logging, no React error boundary, handlers that swallow errors silently |
| **Performance** | Unbounded queries, synchronous I/O in request handlers, N+1 query shapes, heavy imports in client bundles |
| **Accessibility** | Images without `alt`, click handlers on non-interactive elements, unlabelled form controls, icon-only buttons, positive `tabIndex` |
| **AI cost** | LLM endpoints with no auth and no rate limit, no token cap, request-controlled model selection, provider keys in the browser, untrusted input reaching tool-enabled calls |

The full catalogue, with the reasoning behind each rule, is in
**[docs/rules](docs/rules/README.md)** — or run `ai-shipcheck rules`.

## The evidence model

Every actionable finding carries:

| Field | Meaning |
| --- | --- |
| **file, line, column** | Where it is. Repository-relative, POSIX, identical on every platform. |
| **snippet** | The line itself, with anything credential-shaped masked. |
| **rule id** | Stable, documented, and usable in configuration and SARIF. |
| **severity** | How bad it is *if real*. |
| **confidence** | How sure the analysis is. Deliberately **not** the same thing. |
| **explanation** | What goes wrong in production, in plain language. |
| **remediation** | What to type to fix it. |

Severity and confidence are kept apart on purpose. A heuristic finding is still
described as `high` severity when the underlying problem is severe — it simply
costs fewer points, so a report full of low-confidence guesses cannot tank an
otherwise healthy project.

## Scoring and verdicts

Each category starts at 100. Findings deduct points based on severity,
confidence, and how many times a rule fired — with diminishing returns, so one
systemic mistake repeated across forty files cannot zero a category on its own.
The overall score is the weighted mean of the categories that could actually be
assessed.

| Verdict | When |
| --- | --- |
| **READY** | Score ≥ 85, no critical or high-severity findings |
| **NEEDS ATTENTION** | Score below 85, or at least one high-severity finding |
| **NOT READY** | Score below 60, any critical finding, or any **blocker** |

A **blocker** forces `NOT READY` no matter what the number says. That is the
guarantee that stops a good-looking score from hiding a service-role key in a
client bundle.

Categories that cannot be assessed are **excluded from the score**, not awarded
a free 100. An HTTP API with no UI is not scored on accessibility; a project
with no SQL is not scored on row-level security. Every report states what it
actually covered:

```
Assessed: 41 of 63 checks run · 7/9 categories scored · 9 files · 3 not assessed
```

Those are counts, not a synthesised coverage percentage — a percentage would
imply a completeness measure that static analysis cannot support.

The complete model, including every constant, is in
**[docs/SCORING.md](docs/SCORING.md)** and pinned by unit tests.

## How it is validated

Fixtures written alongside a rule agree with that rule by construction. To find
out whether the rules are actually precise, Shipcheck is run against **20 real
public repositories** pinned by commit SHA — Next.js apps, Express and Fastify
services, ORMs, AI applications, and large monorepos.

Every rule that fired was triaged against the real code. That process cut total
findings from 5,710 to 2,819 — a **51% reduction**, none of it from suppressing
repositories by name — and found a lexer bug that had been reporting wrong line
numbers in any file containing a multi-line comment.

Each fix has a regression test named after the repository it came from.

- [corpus/TRIAGE.md](corpus/TRIAGE.md) — the verdict on every rule that fired
- [corpus/results/SUMMARY.md](corpus/results/SUMMARY.md) — per-repository results
- `npm run corpus:sync && npm run corpus:scan` — reproduce it

## Supported stacks

Next.js (App Router and Pages Router), React, Vite, Express, Fastify, Hono,
NestJS, Remix, Astro, SvelteKit, Nuxt, Supabase, Firebase, Prisma, Drizzle,
Mongoose, Stripe, the OpenAI and Anthropic SDKs, the Vercel AI SDK, LangChain,
tRPC, Vitest, Jest, Playwright, Cypress.

Framework-specific rules only run when the framework is detected, and the
report says when a rule was skipped. Dependencies are read from every
`package.json` in the tree, so monorepos are detected correctly.

## Limitations

Worth knowing before you rely on it:

- **JavaScript and TypeScript only.** Other languages are walked but not analysed.
- **Lexical, not semantic.** No cross-file reasoning, no type information, and
  taint tracking that follows a value one hop. A custom auth wrapper Shipcheck
  does not recognise can produce a false positive.
- **Express and Fastify routes are not covered by the auth rules.** Those
  understand Next.js conventions today. Everything else still applies.
- **It cannot see your infrastructure.** A table with RLS enabled in the
  Supabase dashboard but no migration recording it is reported as *unassessed*,
  not as safe.

The full list, including every deliberate trade-off in the lexer, is in
**[docs/LIMITATIONS.md](docs/LIMITATIONS.md)**.

## Configuration

Entirely optional. Drop a `shipcheck.config.json` in your project root:

```json
{
  "exclude": ["**/legacy/**"],
  "rules": {
    "performance/next-unoptimized-image": "off",
    "accessibility/positive-tabindex": { "severity": "low" }
  },
  "minScore": 80,
  "failOn": "high"
}
```

Comments and trailing commas are accepted. Settings can also live under a
`"shipcheck"` key in `package.json`. Shipcheck respects `.gitignore` (including
nested ones), skips `node_modules`, build output and generated bundles, and
never follows a symlink out of the directory you pointed it at.

Full reference: **[docs/configuration.md](docs/configuration.md)**.

## GitHub Action

```yaml
name: Shipcheck

on: [pull_request]

permissions:
  contents: read
  security-events: write

jobs:
  shipcheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      - id: shipcheck
        uses: sinceaihq/ai-shipcheck@v1
        with:
          path: .
          fail-on: critical
          min-score: 80

      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: ${{ steps.shipcheck.outputs.sarif-file }}
```

Outputs `score`, `verdict`, `critical-count`, `high-count` (and more). The
action annotates findings inline on the diff, writes a Markdown report to the
job summary, and produces SARIF for code scanning. It is bundled into a single
committed file, so a workflow pinned to a tag runs exactly the code at that tag
with nothing fetched at run time.

Inputs, outputs and recipes: **[docs/github-action.md](docs/github-action.md)**.

## Machine-readable output

```bash
ai-shipcheck . --format json    > report.json    # versioned schema
ai-shipcheck . --format sarif   > report.sarif   # SARIF 2.1.0
ai-shipcheck . --format markdown > report.md     # PR comments, job summaries
```

JSON carries an explicit `schemaVersion` — branch on that rather than sniffing
for fields. SARIF includes `ruleIndex`, `security-severity` for sorting, and
`partialFingerprints` so a finding is not reported as new when it moves lines.

```ts
import { runScan, createDefaultRegistry, DEFAULT_CONFIG } from 'ai-shipcheck';

const result = await runScan({
  root: process.cwd(),
  config: DEFAULT_CONFIG,
  registry: createDefaultRegistry(),
});

console.log(result.verdict, result.score, result.coverage);
```

## Privacy and local-first architecture

Shipcheck is a local tool with a deliberately small blast radius:

- **Nothing leaves your machine.** No telemetry, no network calls, no upload.
- **Nothing from the scanned repository is executed.** No `import`, no `eval`,
  no install scripts, no package resolution. Files are read as bytes and
  analysed lexically.
- **Secrets are masked** everywhere they could be printed — terminal, JSON,
  SARIF, Markdown, and the GitHub job summary alike.
- **Scans are bounded.** File size, file count, total bytes and directory depth
  are all capped; symlink loops terminate; symlinks pointing outside the scan
  root are refused. When a limit truncates a scan, the report says so.
- **One runtime dependency.** A tool that inspects other people's supply chains
  should have almost none of its own.

The full analysis is in **[docs/THREAT_MODEL.md](docs/THREAT_MODEL.md)**.

## Performance

Scanning 20 real repositories — 33,437 files, 137 MB — takes 18 seconds in
total on an Apple M-series laptop: roughly **1,800 files per second**. The
largest, `payloadcms/payload` at 7,542 files, scans in 3.9 seconds.

Reproduce with `npm run corpus:scan`, or benchmark your own project with
`npm run bench -- <path>`. Numbers vary with hardware and file size; there are
no timing assertions in CI, because hardware-dependent thresholds produce flaky
builds.

## Contributing

Adding a rule is meant to be a single afternoon:

1. Write the rule under `src/rules/<category>/`.
2. Add a vulnerable fixture and a secure fixture.
3. Run `npm run docs:rules` to generate its documentation page.
4. Run `npm run check`.

The fixture suite enforces both halves automatically: a rule that never fires
on any vulnerable fixture fails the build, and any rule that fires on a secure
fixture fails the build too.

The walkthrough is in **[docs/adding-a-rule.md](docs/adding-a-rule.md)**, and
the general guide is in [CONTRIBUTING.md](CONTRIBUTING.md).

False positives are treated as the most serious class of bug here. If a rule
fires on correct code, please [open a report](https://github.com/sinceaihq/ai-shipcheck/issues/new?template=false_positive.yml)
— every fix ships with a regression test.

## Documentation

- [Rule reference](docs/rules/README.md) — every rule, what it means, how to fix it
- [Scoring model](docs/SCORING.md) — how the number is calculated
- [Configuration](docs/configuration.md) — every option, with examples
- [GitHub Action](docs/github-action.md) — inputs, outputs, recipes
- [Architecture](docs/ARCHITECTURE.md) — how the scanner is put together
- [Threat model](docs/THREAT_MODEL.md) — what it defends against, and what it does not
- [Limitations](docs/LIMITATIONS.md) — what static analysis cannot tell you
- [Adding a rule](docs/adding-a-rule.md) — contributor walkthrough
- [Corpus triage](corpus/TRIAGE.md) — how the rules were validated against real code
- [Governance](GOVERNANCE.md) — how the project is maintained and released
- [Releasing](docs/RELEASING.md) — the release process and versioning policy
- [Roadmap](ROADMAP.md)

## License

MIT — see [LICENSE](LICENSE).

---

Built by **Since AI** — [sinceai.ai](https://sinceai.ai)
