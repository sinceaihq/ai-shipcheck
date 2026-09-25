# Configuration

Configuration is entirely optional. `npx ai-shipcheck .` is meant to be right
out of the box; the file exists for the cases where it is not.

## Where it lives

Resolved in this order — the first one found wins:

1. `--config <file>` (a missing file here is an error)
2. `shipcheck.config.json` in the scan root
3. `.shipcheckrc.json` in the scan root
4. `.shipcheckrc` in the scan root
5. A `"shipcheck"` key in `package.json`
6. Built-in defaults

Comments and trailing commas are accepted in all of the JSON forms.

## Full example

```jsonc
{
  // Extra paths to skip, using .gitignore syntax.
  "exclude": ["**/legacy/**", "packages/generated/**"],

  // Per-rule overrides.
  "rules": {
    "performance/next-unoptimized-image": "off",
    "accessibility/positive-tabindex": { "severity": "low" },
    "reliability/missing-fetch-timeout": { "enabled": false }
  },

  // Whole categories to skip.
  "disabledCategories": ["accessibility"],

  // Exit 1 below this score.
  "minScore": 80,

  // Exit 1 if any finding is this severity or worse.
  "failOn": "high",

  // Honour .gitignore files while walking. Default true.
  "respectGitignore": true,

  // Resource ceilings. Raise with care.
  "limits": {
    "maxFileSizeBytes": 1048576,
    "maxFiles": 25000,
    "maxTotalBytes": 201326592,
    "maxDepth": 24
  }
}
```

## Options

### `exclude`

Array of `.gitignore`-syntax patterns, relative to the scan root. Applied on
top of the built-in exclusions (`node_modules`, build output, minified bundles,
lockfiles, generated directories) and any `.gitignore` files found.

```json
{ "exclude": ["**/*.stories.tsx", "supabase/seed/**"] }
```

You can also add a `.shipcheckignore` file anywhere in the tree; it uses the
same syntax as `.gitignore` and is scoped to its directory.

### `rules`

Keyed by rule id. Run `ai-shipcheck rules` to see them all.

```json
{
  "rules": {
    "security/eval-usage": "off",
    "auth/unprotected-route-handler": "on",
    "database/destructive-migration": { "severity": "low" },
    "testing/untested-server-code": { "enabled": false }
  }
}
```

| Value | Meaning |
| --- | --- |
| `"off"` | Disable the rule. It is reported as `disabled` and excluded from scoring. |
| `"on"` | Enable it, even if its category is disabled. |
| `{ "severity": "..." }` | Change how much a finding costs: `critical`, `high`, `medium`, `low`, `info`. |
| `{ "enabled": false }` | Same as `"off"`. |

An unknown rule id produces a warning with a suggestion, not an error, so a
config written for a newer version still runs.

### `disabledCategories`

```json
{ "disabledCategories": ["accessibility", "performance"] }
```

Valid values: `security`, `auth`, `database`, `reliability`, `testing`,
`observability`, `performance`, `accessibility`, `ai-cost`.

A disabled category is excluded from the overall score entirely — it does not
become a free 100.

### `minScore` and `failOn`

Both control the exit code, and both are overridden by the matching CLI flag.

```json
{ "minScore": 80, "failOn": "high" }
```

`failOn` accepts a severity or `"none"`. With neither set, the CLI exits `0`
whatever it finds, which makes adding Shipcheck to an existing pipeline a safe,
reversible step.

### `respectGitignore`

Default `true`. Set to `false` to scan files git ignores — occasionally useful
for auditing a build output directory, rarely what you want.

### `limits`

The ceilings that bound a scan. See
[THREAT_MODEL.md](THREAT_MODEL.md#t3--non-termination-and-resource-exhaustion)
for why they exist.

| Limit | Default | Effect |
| --- | --- | --- |
| `maxFileSizeBytes` | `1048576` (1 MiB) | Larger files are skipped |
| `maxFiles` | `25000` | The walk stops and reports truncation |
| `maxTotalBytes` | `201326592` (192 MiB) | The walk stops and reports truncation |
| `maxDepth` | `24` | Deeper directories are not entered |

When a limit truncates a scan the report says so. Do not raise these to work
around a runaway `node_modules` copy — exclude it instead.

## Suppressing a single finding

For adopting an existing project while keeping checks enabled for new code,
use a [baseline](#baselines-for-existing-projects).

There is deliberately no inline suppression comment. Two reasons: a comment
that disables analysis is an obvious thing for a compromised dependency or a
careless refactor to add, and a suppression scattered through source is
invisible to anyone reviewing what the project has chosen not to check.

If a rule is wrong about your code, that is a bug worth
[reporting](https://github.com/sinceaihq/ai-shipcheck/issues/new?template=false_positive.yml).
If it is right but you have accepted the risk, disable it in the config file
where the decision is visible and reviewable:

```json
{ "rules": { "performance/heavy-client-import": "off" } }
```

If you need finer granularity, exclude the path:

```json
{ "exclude": ["src/legacy-admin/**"] }
```

## Baselines for existing projects

Record the findings you accept today, then check only for new findings:

```bash
ai-shipcheck . --baseline shipcheck-baseline.json --write-baseline
ai-shipcheck . --baseline shipcheck-baseline.json --fail-on high
```

Keep the baseline in version control and review changes to it. It is a central
record of accepted identities, not a way to disable checks from source comments.
Rules still run, and every report visibly counts the current findings suppressed
by the baseline. Only remaining findings affect scores, verdicts and thresholds;
a high score with a baseline does not mean accepted issues were fixed. Stale
entries for findings that no longer exist do not count as suppressed.

Matching reuses SARIF's exact FNV-1a fingerprint over the rule ID and the first
evidence item's repository-relative POSIX file path and snippet. Line and column
numbers are excluded, so adding unrelated lines above a finding does not make it
new. Moving to a different file or changing the snippet changes the identity.
Formatting that changes the recorded snippet can therefore make a finding new.
Some project-level findings use the file's first line as evidence; prepending a
comment changes that snippet and can make those findings new as well.
Identical snippets for the same rule within one file share an identity, including
new copies; the existing 32-bit hash can also collide. Findings without evidence
share an identity by rule ID. Baselines inherit these SARIF limitations.

The baseline has its own `schemaVersion` (`"1.0"`) and a `fingerprints` array of
eight-character lowercase hexadecimal strings. It stores no snippets, expiry
dates, justifications or inline suppression directives. `--write-baseline` replaces
the entire file with the current findings, so review regeneration carefully.
Paths are relative to the working directory. Missing or invalid files cause a
usage error; a baseline is never silently ignored. The flags and recording-mode
behavior are covered in the [CLI reference](cli.md#adopting-shipcheck-with-a-baseline).
