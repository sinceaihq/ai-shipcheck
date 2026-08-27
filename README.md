# AI Shipcheck

**Your AI says it's done. Shipcheck tells you if it's ready to ship.**

```bash
npx ai-shipcheck .
```

No signup. No API key. No source-code upload.

Point it at a JavaScript or TypeScript repository and get an evidence-backed
production-readiness assessment across nine dimensions — security, auth,
database, reliability, testing, observability, performance, accessibility, and
AI cost controls. Every finding cites a file, a line, and a rule you can look
up.

---

```
   NOT READY   67/100 production readiness                             my-app

  Detected: Next.js, React, Supabase, Vitest, Next.js App Router · TypeScript · tests present

  Security                        ██████████░░░░░░   60  1 finding
  Authentication & Authorization  ████████░░░░░░░░   52  2 findings
  Database & Data Safety          ░░░░░░░░░░░░░░░░    0  7 findings
  Reliability                     ████████████████   98  1 finding
  Testing                         ███████████░░░░░   68  4 findings
  Observability                   ███████████████░   92  1 finding
  Performance                     ███████████████░   92  3 findings
  Accessibility                   ████████████████  100  clean
  AI Cost & Abuse Controls        ████████████████  100  clean

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
      Fix: Enable RLS on the table and add explicit policies for each operation you intend to allow:
           ALTER TABLE public.your_table ENABLE ROW LEVEL SECURITY; then CREATE POLICY ... USING
           (auth.uid() = user_id).
      database/supabase-missing-rls · confidence high · ai-shipcheck explain database/…

  Verdict

  · 4 blocking issues must be fixed before deploying. A blocker forces NOT READY regardless of score.
  · Weakest category: Database & Data Safety at 0/100 (7 findings).

  Scanned 21 files in 44 ms · 41 checks run, 22 not applicable · ai-shipcheck v0.1.0
  Static analysis of source code - not a security certification.
```

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
  cannot see your infrastructure, your database settings, your WAF, or your
  runtime configuration.
- **Not a replacement for review.** A clean report means the checks it knows
  how to make found nothing, not that the code is correct.
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

Nine categories, scored independently. Categories that do not apply to your
project are excluded from the score rather than awarded a free 100.

| Category | Examples |
| --- | --- |
| **Security** | Hardcoded credentials, secrets behind `NEXT_PUBLIC_`, `eval`, shell injection, open redirects, permissive CORS, TLS verification disabled, weak crypto, credentials in logs |
| **Auth** | Route handlers that write without an authorisation check, server actions with no auth, browser-only privilege checks, unverified webhooks, unsigned JWTs, Supabase service-role keys reachable from the client |
| **Database** | Tables created without row-level security, `USING (true)` policies, SQL built by interpolation, deletes with no filter, destructive migrations, connection strings in source |
| **Reliability** | Swallowed errors, fetches with no timeout, unhandled rejections, retry loops with no backoff, `process.exit` in a request path, builds configured to ignore type errors |
| **Testing** | No tests at all, CI missing test/build/typecheck steps, `.only` committed, server code with no test referencing it |
| **Observability** | No error monitoring, `console`-only server logging, no React error boundary, handlers that swallow errors silently |
| **Performance** | Unbounded queries, synchronous I/O in request handlers, N+1 query shapes, heavy imports in client bundles |
| **Accessibility** | Images without `alt`, click handlers on non-interactive elements, unlabelled form controls, icon-only buttons, positive `tabIndex` |
| **AI cost** | LLM endpoints with no auth and no rate limit, no token cap, request-controlled model selection, provider keys in the browser, untrusted input reaching tool-enabled calls |

The full catalogue, with the reasoning behind each rule, is in
**[docs/rules](docs/rules/README.md)** — or run `ai-shipcheck rules`.

### Frameworks it understands

Next.js (App Router and Pages Router), React, Vite, Express, Fastify, Hono,
NestJS, Remix, Astro, SvelteKit, Nuxt, Supabase, Firebase, Prisma, Drizzle,
Mongoose, Stripe, the OpenAI and Anthropic SDKs, the Vercel AI SDK, LangChain,
tRPC, Vitest, Jest, Playwright, Cypress.

Framework-specific rules only run when the framework is actually detected, and
the report says so when a rule was skipped.

## Scoring

Each category starts at 100. Findings deduct points based on severity,
confidence and how many times a rule fired, with diminishing returns so one
systemic mistake cannot zero a category on its own. The overall score is the
weighted mean of the categories that could actually be assessed.

Three verdicts:

- **READY** — score ≥ 85, no critical or high-severity findings.
- **NEEDS ATTENTION** — score below 85, or at least one high-severity finding.
- **NOT READY** — score below 60, any critical finding, or any *blocker*.

A **blocker** forces `NOT READY` no matter what the number says. That is the
guarantee that keeps a good-looking score from hiding a service-role key in a
client bundle.

The complete model, including every constant, is documented in
**[docs/SCORING.md](docs/SCORING.md)** and pinned by unit tests.

## Configuration

Entirely optional. Drop a `shipcheck.config.json` in your project root:

```json
{
  "exclude": ["**/legacy/**", "packages/generated/**"],
  "rules": {
    "performance/next-unoptimized-image": "off",
    "accessibility/positive-tabindex": { "severity": "low" }
  },
  "disabledCategories": ["accessibility"],
  "minScore": 80,
  "failOn": "high"
}
```

Comments and trailing commas are accepted. Settings can also live under a
`"shipcheck"` key in `package.json`.

Shipcheck respects `.gitignore` (including nested ones), skips `node_modules`,
build output and generated bundles, and never follows a symlink out of the
directory you pointed it at.

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
          fail-on: high
          min-score: 80

      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: ${{ steps.shipcheck.outputs.sarif-file }}
```

The action annotates findings inline on the diff, writes a Markdown report to
the job summary, and produces SARIF for GitHub code scanning. It is bundled
into a single committed file, so a workflow that pins a tag runs exactly the
code at that tag with nothing fetched at run time.

Inputs, outputs and more examples: **[docs/github-action.md](docs/github-action.md)**.

## Privacy and safety

Shipcheck is a local tool with a deliberately small blast radius:

- **Nothing leaves your machine.** No telemetry, no network calls, no upload.
- **Nothing from the scanned repository is executed.** No `import`, no `eval`,
  no install scripts, no package resolution. Files are read as bytes and
  analysed lexically.
- **Secrets are masked** everywhere they could be printed — terminal, JSON,
  SARIF, and the GitHub job summary alike.
- **Scans are bounded.** File size, file count, total bytes and directory depth
  are all capped, symlink loops terminate, and symlinks pointing outside the
  scan root are refused.

The full analysis is in **[docs/THREAT_MODEL.md](docs/THREAT_MODEL.md)**.

## Programmatic use

```ts
import { runScan, createDefaultRegistry, DEFAULT_CONFIG } from 'ai-shipcheck';

const result = await runScan({
  root: process.cwd(),
  config: DEFAULT_CONFIG,
  registry: createDefaultRegistry(),
});

console.log(result.verdict, result.score);
for (const finding of result.findings) {
  console.log(finding.ruleId, finding.evidence[0]?.file, finding.evidence[0]?.line);
}
```

The JSON output carries an explicit `schemaVersion`; branch on that rather than
sniffing for fields.

## Contributing

Adding a rule is meant to be a single afternoon, not a weekend:

1. Write the rule under `src/rules/<category>/`.
2. Add a vulnerable fixture and a secure fixture.
3. Run `npm run docs:rules` to generate its documentation page.
4. Run `npm run check`.

The walkthrough is in **[docs/adding-a-rule.md](docs/adding-a-rule.md)**, and
the general guide is in [CONTRIBUTING.md](CONTRIBUTING.md).

False positives are treated as the most serious class of bug here. If a rule
fires on correct code, please [open a report](https://github.com/sinceaihq/ai-shipcheck/issues/new?template=false_positive.yml)
— every fix ships with a regression test.

## Documentation

- [Rule reference](docs/rules/README.md) — every rule, what it means, how to fix it
- [Configuration](docs/configuration.md) — every option, with examples
- [Scoring model](docs/SCORING.md) — how the number is calculated
- [Architecture](docs/ARCHITECTURE.md) — how the scanner is put together
- [Threat model](docs/THREAT_MODEL.md) — what Shipcheck defends against, and what it does not
- [Adding a rule](docs/adding-a-rule.md) — contributor walkthrough
- [GitHub Action](docs/github-action.md) — inputs, outputs, recipes
- [Limitations](docs/LIMITATIONS.md) — what static analysis cannot tell you
- [Roadmap](ROADMAP.md)

## License

MIT — see [LICENSE](LICENSE).

---

Built by **Since AI** — [sinceai.ai](https://sinceai.ai)
