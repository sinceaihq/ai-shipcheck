# CLI reference

Everything `ai-shipcheck` can do from the command line. The README covers
the common path; this is the complete surface.

## Commands

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

## CLI contract

The CLI contract covers exit codes, stdout/stderr behavior, report formats, and
the JSON schema version. CI pipelines can rely on this behavior across patch and
minor releases.

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

### stdout and stderr

For machine-readable formats, stdout contains only the requested report:

- `--format json`
- `--format sarif`
- `--format markdown`

That makes these formats safe to redirect or pipe in CI. Diagnostics, usage
errors, and threshold-failure messages are written to stderr.

With `--output <file>`, the report is written to the specified file instead of
stdout. Successful file output does not print the report body to stdout.

The default `pretty` format is intended for humans reading terminal output. Use
`json`, `sarif`, or `markdown` when another program needs to consume the result.

### Output formats

```bash
ai-shipcheck . --format json    > report.json    # versioned schema
ai-shipcheck . --format sarif   > report.sarif   # SARIF 2.1.0
ai-shipcheck . --format markdown > report.md     # PR comments, job summaries
```

JSON carries an explicit `schemaVersion`; branch on that rather than sniffing
for fields. The schema version covers the JSON report shape: top-level fields,
finding fields, severity/confidence values, and summary objects. It does not
cover prose in explanations/remediations, rule catalogue membership, scoring
weights, or the exact number of findings produced for a project.

SARIF includes `ruleIndex`, `security-severity` for sorting, and
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

## Supported stacks

Next.js (App Router and Pages Router), React, Vite, Express, Fastify, Hono,
NestJS, Remix, Astro, SvelteKit, Nuxt, Supabase, Firebase, Prisma, Drizzle,
Mongoose, Stripe, the OpenAI and Anthropic SDKs, the Vercel AI SDK, LangChain,
tRPC, Vitest, Jest, Playwright, Cypress.

Framework-specific rules only run when the framework is detected, and the
report says when a rule was skipped. Dependencies are read from every
`package.json` in the tree, so monorepos are detected correctly.

---

See also: [configuration](configuration.md), [scoring](SCORING.md),
[rules](rules/README.md), [limitations](LIMITATIONS.md).
