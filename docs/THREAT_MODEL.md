# Threat model

AI Shipcheck is a security tool that people point at repositories they have not
read. That makes the scanner itself an attack surface: the input is untrusted
by definition, and the output frequently contains the most sensitive strings in
the codebase.

This document states what Shipcheck defends against, how, and what it
deliberately does not defend against.

## Assets

| Asset | Why it matters |
| --- | --- |
| The user's filesystem outside the scan root | A scanner that can be made to read `~/.ssh/id_rsa` and print it is a data-exfiltration tool |
| The user's machine and shell | Executing code from an untrusted repository is arbitrary code execution |
| Credentials discovered during a scan | Printing a secret in full moves it into terminal scrollback, CI logs, PR comments and screenshots |
| Scan availability | A scan that never terminates blocks a pipeline |
| Report integrity | A finding whose text can be forged by a filename misleads whoever reads it |
| The published package and Action bundle | The usual supply-chain concerns |

## Adversaries

**A malicious repository.** The primary adversary. Someone crafts a repository
specifically to attack whoever scans it — through symlinks, pathological file
contents, hostile filenames, or files designed to make an analyser loop.

**A malicious dependency of Shipcheck itself.** Mitigated structurally: there
is exactly one runtime dependency.

**A careless user.** Someone who pastes a report into a public issue. Masking
is what protects them.

## Trust boundaries

```
   ┌─────────────────────────────────────────────────────────────┐
   │ TRUSTED: the Shipcheck process                              │
   │                                                             │
   │   CLI  →  config loader  →  walker  →  reader               │
   │                                          │                  │
   │                                    ══════╪══════ boundary   │
   │                                          ↓                  │
   │   UNTRUSTED DATA: file contents, filenames, ignore files    │
   │                                          ↓                  │
   │   lexer → index → rules → scoring → reporters → masking     │
   └─────────────────────────────────────────────────────────────┘
```

Everything below the boundary is **data**, never code. Shipcheck reads bytes
and analyses them lexically. It never imports, requires, evaluates, resolves,
transpiles or executes anything from the scanned repository.

## Threats and mitigations

### T1 — Escaping the scan root

**Attack.** A symlink in the repository points at `/etc`, `~/.aws`, or a sibling
checkout. The scanner follows it and reports — or prints — the contents.

**Mitigation.** Every symlink is resolved with `realpath` and checked with
`isInside(root, target)` before it is opened. A target outside the root is
recorded as `symlink-outside-root` and never read. The scan root itself is
resolved through `realpath` first, so a platform where `/tmp` is a symlink to
`/private/tmp` does not produce spurious mismatches. Path containment uses
`path.relative` rather than string prefixes, so `/tmp/project-other` is not
treated as inside `/tmp/project`.

**Tests.** `tests/unit/filesystem.test.ts` — "refuses to follow a symlink
pointing outside the scan root", "refuses to follow a symlink to a file outside
the scan root", and the sibling-prefix case in `tests/unit/paths.test.ts`.

### T2 — Executing code from the target repository

**Attack.** A repository contains a malicious `next.config.js` or a
`package.json` with a lifecycle script, and the scanner runs it in order to
understand the project.

**Mitigation.** Shipcheck never executes anything. Configuration files are
parsed as text: `package.json` and `tsconfig.json` through a JSONC parser, and
JavaScript config files through the same lexer used for source. No `import()`,
no `require`, no `vm`, no `child_process`, no package manager invocation. Node
config files are analysed textually — which is why a config that computes its
values dynamically may be reported as `unassessed` rather than misread.

**Consequence accepted.** Some checks would be easier with a runtime. They are
not worth it.

### T3 — Non-termination and resource exhaustion

**Attack.** A symlink loop, a 4 GB generated file, half a million files, a
directory nested a thousand deep, or source crafted to trigger catastrophic
backtracking in a regular expression.

**Mitigation.**

- Every visited directory's real path is recorded; revisiting one ends that
  branch, so loops terminate.
- Limits are applied and reported: `maxFileSizeBytes` (1 MiB),
  `maxFiles` (25,000), `maxTotalBytes` (192 MiB), `maxDepth` (24),
  `maxLines` (20,000). A truncated scan says so.
- The lexer is single-pass and linear. Regular-expression literals must
  terminate on the line they start on and are capped at 400 characters, so a
  misclassification cannot cascade.
- Rule patterns avoid nested quantifiers and alternation inside repetition.
  Bounded quantifiers (`{0,200}`) are used wherever a match could otherwise run
  away.
- Files whose average line length exceeds 500 characters are treated as
  generated and skipped — this is what keeps minified bundles out of the
  analysis.
- A rule that throws is contained: it is recorded as `unassessed` with the
  error message and the scan continues.

**Tests.** `tests/unit/filesystem.test.ts` covers every limit and the loop
case; `tests/unit/lexer.test.ts` includes a pathological-input timing
assertion; `tests/integration/rules.test.ts` scans malformed and unterminated
source.

### T4 — Leaking discovered secrets

**Attack.** Shipcheck finds an API key and prints it, moving it into CI logs,
a pull-request comment, or a screenshot.

**Mitigation.** Every value that reaches an output passes through
[`src/utils/mask.ts`](../src/utils/mask.ts). Provider key formats, JWTs,
connection-string passwords, and both quoted and unquoted credential-shaped
assignments are redacted to a four-character prefix and a length
(`sk-a…[masked:23]`). Values shorter than 12 characters are redacted entirely.
Masking is applied at snippet construction, so it covers every reporter by
construction rather than by each reporter remembering.

**Tests.** `tests/unit/mask.test.ts`, plus `tests/integration/fixtures.test.ts`
which asserts no fixture credential appears in any serialised result, and
`tests/integration/action.test.ts` which asserts the same for annotations and
job summaries.

### T5 — Output injection

**Attack.** A filename or code snippet containing `|`, backticks, `::`, or
newlines breaks out of a Markdown table, a SARIF field, or a GitHub workflow
command — injecting formatting, a link, or a forged annotation.

**Mitigation.**

- **Markdown**: `escapeMd` escapes backslash, backtick, asterisk, underscore,
  brackets, angle brackets and pipe, and collapses newlines. A test asserts no
  raw pipe survives inside any table cell.
- **SARIF**: everything is emitted through `JSON.stringify`. Rule help text is
  built from rule metadata, never from scanned content.
- **GitHub workflow commands**: message bodies escape `%`, `\r` and `\n`;
  property values additionally escape `:` and `,`, per the workflow-command
  specification.
- **Outputs**: written using the `GITHUB_OUTPUT` delimiter protocol, so a value
  containing newlines cannot inject another output.

### T6 — Path handling across platforms

**Attack.** A Windows-specific path, a UNC path, or a filename containing a
backslash produces a path in the report that a downstream tool resolves
differently.

**Mitigation.** Every path in output is a repository-relative POSIX path. A
test asserts no finding's evidence path is absolute or contains a backslash.
Path containment uses `path.relative`, never string comparison.

### T7 — Malformed input causing incorrect analysis

**Attack.** Source that is not valid JavaScript — a merge conflict, an
unterminated string, a truncated file — causes the lexer to mis-tokenise and a
rule to report nonsense.

**Mitigation.** The lexer is designed to fail locally rather than globally. An
unterminated string is treated as a plain character (bounding the damage to one
line, and letting an apostrophe in JSX text behave sensibly). An unterminated
template is blanked to end of file, which suppresses findings rather than
inventing them. A `/` preceded by `<` is never a regular expression, so JSX
closing tags cannot start one. A malformed `package.json` degrades detection
and adds a warning instead of aborting the scan.

**Known limitation.** These are heuristics, not a parser. `docs/LIMITATIONS.md`
lists the cases where they are wrong.

### T8 — Supply chain

**Mitigation.** One runtime dependency (`ignore`). Development dependencies are
limited to TypeScript, Vitest, ESLint, Prettier and esbuild. The GitHub Action
is bundled into a single committed file, so a workflow pinned to a tag executes
exactly the reviewed code with nothing fetched at run time; CI fails if the
committed bundle differs from a fresh build. `npm publish` runs
`prepack` → `build`, so the published artefact is built from the source in the
tree.

## Explicitly out of scope

**Shipcheck does not sandbox itself.** It runs with the privileges of the user
who invoked it. The mitigations above are about what it will *do* with those
privileges, not about containing a compromise of Shipcheck itself. If you are
scanning genuinely hostile code, run it in a container.

**Shipcheck does not verify your infrastructure.** It cannot see your database
settings, your reverse proxy, your WAF, your secrets manager, or anything set
at deploy time. A table might have RLS enabled in the Supabase dashboard and no
migration saying so — Shipcheck reports that as `unassessed`, not as safe.

**Shipcheck does not detect deliberately obfuscated code.** The analysis is
lexical. Code written to evade it will evade it. The target is honest mistakes
in code written quickly, not an adversary hiding a backdoor from a linter.

**A clean report is not a certification.** Every output says so.

## Reporting

Security issues in Shipcheck itself: see [SECURITY.md](../SECURITY.md). Please
report privately.
