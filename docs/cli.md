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

## Output formats

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
