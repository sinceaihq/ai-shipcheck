# Architecture

A scan is a pipeline. Each stage has one job, and every stage below the reader
treats its input as untrusted data.

```
  CLI args ─┐
            ├─→ config ─→ walk ─→ read ─→ classify ─→ ProjectIndex ─→ rules ─→ scoring ─→ reporters
  config ───┘              │                                 ↑           │
                           └─ limits, .gitignore,            └─ profile  └─ findings + checks
                              symlink containment
```

The single most important property: **the index is built once**. One directory
walk, one read per file, one lex per file. Rules consume the index and never
touch the filesystem. That is what keeps a scan feeling like a linter rather
than a build — a few hundred files in tens of milliseconds.

## Layout

```
src/
  cli/            Argument parsing, commands, help, exit codes
  core/           Engine, rule registry, index construction
  config/         Configuration loading and validation
  filesystem/     Safe walking, reading, ignore handling, resource limits
  analysis/       The lexer and the SourceFile abstraction rules consume
  detection/      package.json parsing, framework detection, file classification
  rules/          One file per rule, grouped by category
  scoring/        Weights, category scores, verdict
  reporters/      pretty, json, markdown, sarif
  action/         GitHub Action entry point (bundled separately)
  types/          The public data model
  utils/          Masking, JSONC, colour, paths, errors
```

There is no monorepo. A single package with clear internal boundaries is easier
to contribute to, easier to publish, and there is no second consumer that would
justify the overhead.

## The lexer

`src/analysis/lexer.ts` is the foundation. It is a hand-written, single-pass
scanner for JavaScript, TypeScript and JSX.

**Why not a real parser?** The single most valuable property for keeping false
positives low is knowing which bytes are code and which are comment or string
content. A tokeniser gives that for a fraction of the cost of a parser, with no
third-party grammar to keep current as the language evolves, and with no risk
that a syntax the parser has not learned yet causes a whole file to be skipped.

The lexer produces two views of each file, both exactly the same length as the
original so every offset, line and column stays comparable:

| View | Comments | String bodies | Used for |
| --- | --- | --- | --- |
| `file.code` | blanked | blanked | The default. A rule matching here can never fire on something inside a comment or a string. |
| `file.text` | blanked | preserved | Rules that need literal content: header names, URLs, table names, import specifiers. |

Template-literal interpolations stay visible in both views, because `${userId}`
is real code — which is exactly what the SQL-injection rule needs to see.

Match and capture-group text is always sliced from the *original* source using
the regex's own match indices, so a group that lands inside a blanked literal
still yields the real characters.

The deliberate limitations — an unterminated quote is treated as a plain
character, `</` is never a regex, regex literals must close on their line — are
documented in the module and in `docs/LIMITATIONS.md`. Each one bounds the
damage of a mis-tokenisation to a single line rather than a whole file.

## The project index

`ProjectIndex` is the immutable view every rule reads from:

- `files` — every file that was read, as `SourceFile` objects with lazy lexing
- `profile` — detected frameworks, languages, package manager, capabilities
- `withRole(...)` — files by classification (route handler, server action,
  page, migration, test, CI workflow, …)
- `hasFramework(...)`, `hasDependency(...)` — applicability checks
- `serverFiles`, `routeFiles` — the populations most auth rules reason about

Classification happens once, in `src/detection/classify.ts`. Rules need to know
*what a file is* far more often than what it contains, and having one answer
means the "API route missing auth" rule and the "API route missing rate
limiting" rule agree about what an API route is.

If a rule needs new derived data, it belongs in the index so the cost is paid
once and shared.

## The rule contract

```ts
export default defineRule({
  meta: {
    id: 'category/rule-name',
    category: 'security',
    title: 'Short, specific',
    severity: 'high',
    confidence: 'medium',
    description: 'What goes wrong in production.',
    remediation: 'What to type to fix it.',
    references: ['https://…'],
    blocker: false,
    requiresFrameworks: ['next'],
    tags: ['owasp-a01'],
  },

  appliesTo(index) { /* not-applicable or unassessed, with a reason */ },
  checkFile(file, ctx) { /* per file */ },
  checkProject(ctx) { /* once, with the whole index */ },
});
```

`defineRule` validates the metadata at import time, so a malformed rule is a
startup error rather than a subtly wrong report. `RuleRegistry` rejects
duplicate ids, which is what lets rule ids be a stable public contract in SARIF
and in configuration.

File-scoped rules are preferred: the engine can filter by extension, and a rule
that saw no files of its type is recorded as `unassessed` rather than passing.

Three ways a rule can decline to produce a verdict, and the distinction is
load-bearing:

- **`appliesTo` → `not-applicable`** — the rule does not apply here at all
  (a Supabase rule on a project with no Supabase).
- **`appliesTo` → `unassessed`** — the rule applies but nothing could be
  evaluated (a Supabase project with no SQL migrations to read).
- **`ctx.markUnassessed(reason)`** — discovered mid-check.

None of these silently become a pass.

## The engine

`runScan` builds the index, resolves configuration against the rule catalogue,
and runs each enabled rule. It is deliberately dull:

- Rules run in id order, so output is deterministic.
- A rule that throws is caught, recorded as `unassessed` with the message, and
  the scan continues. A broken third-party rule must never fail someone's whole
  report.
- Findings are sorted by severity, then rule id, then file and line, so two
  runs over the same tree produce byte-identical output. A test asserts this.

## Scoring

Isolated in `src/scoring/`, with every constant in `weights.ts` and every
behaviour pinned by unit tests. See [SCORING.md](SCORING.md).

The key structural decision: **only assessed categories contribute**. A project
with no database is not scored on database safety, and the report says the
category was not assessed rather than showing it as clean.

## Reporters

Reporters are pure functions from `ScanResult` to a string. They never write
files — the CLI does that — which makes them trivial to test and impossible to
have side effects.

- **`pretty`** — the terminal report, laid out to answer "can I ship this", "what
  is the worst thing" and "where is it" in that order.
- **`json`** — the `ScanResult` type verbatim, with an explicit `schemaVersion`.
- **`markdown`** — for PR comments and job summaries; everything user-controlled
  is escaped.
- **`sarif`** — SARIF 2.1.0 for GitHub code scanning, with `ruleIndex`,
  `%SRCROOT%`-relative URIs, `security-severity` for sorting, and
  `partialFingerprints` so a finding is not reported as new when it moves lines.

## The GitHub Action

`src/action/` is a thin wrapper over the same `runScan`. It is bundled by
esbuild into a single committed file (`action/dist/index.js`) so a workflow that
pins a tag executes exactly that code with nothing installed at run time. It has
no `@actions/*` dependency; the handful of protocol details it needs — reading
inputs, writing outputs, emitting annotations, appending to the summary — are
implemented directly in `src/action/github.ts`.

CI fails if the committed bundle differs from a fresh build.

## Adding a language later

The pipeline below the rule layer does not know what JavaScript is. The walker,
the index, the scoring model and the reporters all operate on files, roles and
findings. Adding Python or Go means:

1. A lexer producing the same two masked views.
2. A classifier mapping paths to roles.
3. A framework-detection signature table.
4. A rule set.

Nothing above needs to change. That was the point of keeping the language
knowledge inside `analysis/`, `detection/` and `rules/`.

## Performance

`npm run bench` scans the fixture corpus and reports throughput. The design
choices that matter:

- One walk, one read, one lex — never re-read a file.
- Lexing is lazy: a file that no applicable rule inspects is never tokenised.
- Bounded read concurrency (24) so a large repository does not open thousands
  of descriptors.
- Generated and minified files are detected and skipped before any rule sees
  them.

There are no timing assertions in CI. Hardware-dependent thresholds produce
flaky builds and teach people to ignore failures.
