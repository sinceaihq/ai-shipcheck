<h1 align="center">AI Shipcheck</h1>

<p align="center"><strong>Your AI says it's done. Shipcheck tells you if it's ready to ship.</strong></p>

<p align="center">
  <a href="https://github.com/sinceaihq/ai-shipcheck/actions/workflows/ci.yml"><img src="https://github.com/sinceaihq/ai-shipcheck/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/sinceaihq/ai-shipcheck/actions/workflows/package.yml"><img src="https://github.com/sinceaihq/ai-shipcheck/actions/workflows/package.yml/badge.svg" alt="Package integrity"></a>
  <a href="https://www.npmjs.com/package/ai-shipcheck"><img src="https://img.shields.io/npm/v/ai-shipcheck.svg" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg" alt="Node >=22"></a>
</p>

```bash
npx ai-shipcheck .
```

**No signup · No API key · No source-code upload · Runs locally**

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

  Verdict

  · 4 blocking issues must be fixed before deploying. A blocker forces NOT READY regardless of score.
  · Weakest category: Database & Data Safety at 0/100 (7 findings).

  Scanned 9 files in 29 ms · 41 checks run, 19 not applicable, 3 not assessed · ai-shipcheck v1.0.0
  Static analysis of source code - not a security certification.
```

<sub>Real output from <code>fixtures/vulnerable-supabase</code>, trimmed for length.</sub>

## Why

AI coding tools are very good at producing code that runs, and much less good
at producing code that survives production. They report the work as finished
either way.

The gaps are consistent and boring: the Supabase table nobody enabled RLS on,
the route handler that writes without checking who is calling, the
`NEXT_PUBLIC_` variable holding a secret, the LLM endpoint with no rate limit
and no token cap. Shipcheck looks for exactly those, statically, on your
machine.

## What it checks

Nine categories, scored independently. **63 rules**, each with documentation, a
vulnerable fixture, a secure fixture and tests.

| Category | Examples |
| --- | --- |
| **Security** | Hardcoded credentials, secrets behind `NEXT_PUBLIC_`, `eval`, shell injection, open redirects, permissive CORS, TLS verification disabled, weak crypto |
| **Auth** | Routes that write without an authorisation check, server actions with no auth, browser-only privilege checks, unverified webhooks, unsigned JWTs, exposed service-role keys |
| **Database** | Tables without row-level security, `USING (true)` policies, SQL built by interpolation, deletes with no filter, destructive migrations |
| **Reliability** | Swallowed errors, missing timeouts in request paths, unhandled rejections, retries with no backoff, builds set to ignore type errors |
| **Testing** | No tests, CI missing test/build/typecheck, `.only` committed, server code with no test referencing it |
| **Observability** | No error monitoring, `console`-only server logging, no React error boundary, handlers that swallow errors |
| **Performance** | Unbounded queries, synchronous I/O in request handlers, N+1 shapes, heavy client imports |
| **Accessibility** | Missing `alt`, click handlers on non-interactive elements, unlabelled form controls, positive `tabIndex` |
| **AI cost** | LLM endpoints with no auth or rate limit, no token cap, request-controlled model selection, provider keys in the browser |

Full catalogue: **[docs/rules](docs/rules/README.md)** — or run `ai-shipcheck rules`.

**Stacks it understands:** Next.js (both routers), React, Vite, Express,
Fastify, Hono, NestJS, Remix, Astro, SvelteKit, Nuxt, Supabase, Firebase,
Prisma, Drizzle, Mongoose, Stripe, OpenAI, Anthropic, Vercel AI SDK, LangChain,
tRPC, and the common test runners. Framework-specific rules run only when the
framework is detected, monorepos included.

## Use it

```bash
npx ai-shipcheck .                       # scan the current directory
npx ai-shipcheck . --fail-on critical    # exit 1 when a critical finding exists
npx ai-shipcheck . --format sarif        # also: json, markdown
npx ai-shipcheck explain <rule-id>       # why a rule exists, and how to fix it
```

Findings alone never fail the command — you opt in with `--fail-on` or
`--min-score`, so adding this to an existing pipeline is a reversible step.
Exit codes: `0` thresholds met, `1` not met, `2` usage error, `3` internal
error.

Requires Node.js 22 or newer. Configuration is optional; a
`shipcheck.config.json` can exclude paths, disable rules or set thresholds.

Complete reference: **[docs/cli.md](docs/cli.md)** · **[docs/configuration.md](docs/configuration.md)**

## GitHub Action

```yaml
- uses: sinceaihq/ai-shipcheck@v1
  with:
    fail-on: critical
    min-score: 80
```

Annotates findings inline on the diff, writes a Markdown report to the job
summary, and produces SARIF for code scanning. Outputs `score`, `verdict`,
`critical-count` and `high-count`. It is bundled into a single committed file,
so a workflow pinned to a tag runs exactly that code with nothing fetched at
run time.

Inputs, outputs and recipes: **[docs/github-action.md](docs/github-action.md)**

## Trust

- **Nothing leaves your machine.** No telemetry, no network calls, no upload.
- **Nothing in the scanned repository is executed** — no import, no `eval`, no
  install scripts. Files are read as bytes and analysed lexically.
- **Secrets are masked** everywhere they could be printed.
- **Scans are bounded**, and a truncated scan says so rather than quietly
  reporting on a fraction of the project.
- **One runtime dependency.**

Every finding cites a file, a line, a rule, a severity **and a confidence** —
kept deliberately separate, so a heuristic finding is still described as severe
while counting for less against the score. Categories that cannot be assessed
are excluded rather than awarded a free 100.

The rules were validated against **20 real public repositories** pinned by
commit SHA. Triaging what they reported cut findings from 5,710 to 2,819 — a
51% reduction, none of it from suppressing projects by name — and surfaced a
lexer bug that had been reporting wrong line numbers in any file containing a
multi-line comment. Every fix carries a regression test.

**[docs/trust.md](docs/trust.md)** · **[corpus/TRIAGE.md](corpus/TRIAGE.md)** · **[docs/THREAT_MODEL.md](docs/THREAT_MODEL.md)**

## Scope

Worth knowing before you rely on it:

- **JavaScript and TypeScript only.** Other languages are walked, not analysed.
- **Lexical, not semantic.** No cross-file reasoning, no type information, and
  taint tracking that follows a value one hop. A custom auth wrapper it does
  not recognise can produce a false positive.
- **Express and Fastify routes are not covered by the auth rules.** Those
  understand Next.js conventions today. This is the largest known gap.
- **It cannot see your infrastructure.** A table with RLS enabled in a
  dashboard but absent from migrations is reported as *unassessed*, not safe.

A clean report means the checks it knows how to make found nothing — **not**
that the code is correct. This is static analysis, not a security
certification.

**[docs/LIMITATIONS.md](docs/LIMITATIONS.md)**

## Documentation

| | |
| --- | --- |
| [Rules](docs/rules/README.md) | Every rule, what it means, how to fix it |
| [CLI](docs/cli.md) | Complete command-line reference |
| [Configuration](docs/configuration.md) | Excludes, rule overrides, thresholds |
| [GitHub Action](docs/github-action.md) | Inputs, outputs, recipes |
| [Scoring](docs/SCORING.md) | How the number is calculated |
| [Trust model](docs/trust.md) | Guarantees, validation, performance |
| [Limitations](docs/LIMITATIONS.md) | What static analysis cannot tell you |
| [Threat model](docs/THREAT_MODEL.md) | What it defends against, and what it does not |
| [Architecture](docs/ARCHITECTURE.md) | How the scanner is put together |
| [Adding a rule](docs/adding-a-rule.md) | Contributor walkthrough |
| [Releasing](docs/RELEASING.md) | Release process and versioning policy |
| [Governance](GOVERNANCE.md) | How the project is maintained |

## Contributing

False positives are the most serious class of bug here. If a rule fires on
correct code, [report it](https://github.com/sinceaihq/ai-shipcheck/issues/new?template=false_positive.yml)
— the fix ships with a regression test.

Adding a rule is meant to be a single afternoon: write it, add a vulnerable
fixture and a secure fixture, run `npm run docs:rules`, run `npm run check`.
The build fails if a rule never fires on a vulnerable fixture, and fails if any
rule fires on a secure one.

[CONTRIBUTING.md](CONTRIBUTING.md) · [good first issues](https://github.com/sinceaihq/ai-shipcheck/issues?q=is%3Aopen+label%3A%22good+first+issue%22) · [SUPPORT.md](SUPPORT.md) · [Discussions](https://github.com/sinceaihq/ai-shipcheck/discussions)

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">Built by <a href="https://sinceai.ai">Since AI</a> · <a href="mailto:builders@sinceai.fi">builders@sinceai.fi</a></p>
