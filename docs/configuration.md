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
