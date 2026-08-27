# GitHub Action

```yaml
- uses: sinceaihq/ai-shipcheck@v1
```

The action runs exactly the same scan as the CLI. It is bundled into a single
committed file, so a workflow pinned to a tag executes precisely the code at
that tag — no npm install on the runner, no lockfile drift, no postinstall
script running next to your checked-out repository.

## Quick start

```yaml
name: Shipcheck

on: [pull_request]

permissions:
  contents: read

jobs:
  shipcheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: sinceaihq/ai-shipcheck@v1
        with:
          fail-on: high
```

That annotates findings inline on the diff and writes a report to the job
summary. It fails the job only if something is high severity or worse.

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `path` | `.` | Directory to scan, relative to the repository root |
| `fail-on` | *(empty)* | Fail the job when a finding is this severity or worse: `critical`, `high`, `medium`, `low`, `info`, `none`. Empty means never fail on findings. |
| `min-score` | *(empty)* | Fail the job when the overall score is below this number (0–100) |
| `config` | *(empty)* | Path to a `shipcheck.config.json`, relative to the repository root |
| `sarif-file` | `shipcheck.sarif` | Where to write the SARIF report |
| `annotations` | `true` | Emit inline annotations on the pull-request diff |
| `summary` | `true` | Write the Markdown report to the job summary |

## Outputs

| Output | Example | Description |
| --- | --- | --- |
| `score` | `67` | Overall production-readiness score, 0–100 |
| `verdict` | `NOT READY` | `READY`, `NEEDS ATTENTION` or `NOT READY` |
| `critical-count` | `7` | Number of critical findings |
| `high-count` | `4` | Number of high-severity findings |
| `medium-count` | `6` | Number of medium-severity findings |
| `low-count` | `2` | Number of low-severity findings |
| `findings-count` | `19` | Total findings |
| `sarif-file` | `shipcheck.sarif` | Path of the SARIF report that was written |

## Recipes

### Upload to GitHub code scanning

Findings appear in the Security tab, deduplicated across pushes and tracked as
they are fixed.

```yaml
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
          fail-on: high

      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: ${{ steps.shipcheck.outputs.sarif-file }}
          category: ai-shipcheck
```

`if: always()` matters: you still want the report uploaded on the runs where
the scan failed the job.

### Comment the report on the pull request

```yaml
- id: shipcheck
  uses: sinceaihq/ai-shipcheck@v1

- name: Comment the verdict
  if: github.event_name == 'pull_request'
  uses: actions/github-script@v7
  with:
    script: |
      const verdict = '${{ steps.shipcheck.outputs.verdict }}';
      const score = '${{ steps.shipcheck.outputs.score }}';
      const icon = verdict === 'READY' ? '✅' : verdict === 'NEEDS ATTENTION' ? '⚠️' : '🛑';
      await github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: `${icon} **AI Shipcheck: ${verdict}** — score ${score}/100\n\n` +
              `See the [job summary](${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}) for the full report.`,
      });
```

Needs `pull-requests: write`.

### Branch on the verdict

```yaml
- id: shipcheck
  uses: sinceaihq/ai-shipcheck@v1

- name: Block the deploy
  if: steps.shipcheck.outputs.verdict == 'NOT READY'
  run: |
    echo "::error::Shipcheck says NOT READY (${{ steps.shipcheck.outputs.critical-count }} critical findings)."
    exit 1
```

### Scan one package in a monorepo

Framework detection is union-based across a whole scan, so a per-package matrix
gives more accurate results than one scan of the root.

```yaml
strategy:
  fail-fast: false
  matrix:
    package: [apps/web, apps/admin, services/api]

steps:
  - uses: actions/checkout@v5
  - uses: sinceaihq/ai-shipcheck@v1
    with:
      path: ${{ matrix.package }}
      sarif-file: shipcheck-${{ strategy.job-index }}.sarif
      fail-on: high
```

### Enforce a score floor that only goes up

```yaml
- uses: sinceaihq/ai-shipcheck@v1
  with:
    min-score: 80
    fail-on: critical
```

Raise `min-score` as the project improves. A ratchet is more useful than a
target nobody meets.

### Report without failing anything

Useful for the first week, while you decide which findings you care about.

```yaml
- uses: sinceaihq/ai-shipcheck@v1
  # No fail-on, no min-score: the job always succeeds and the report is
  # still annotated and summarised.
```

## Behaviour notes

- **Findings alone never fail the job.** You opt in with `fail-on` or
  `min-score`.
- **Annotations are capped at 40**, after which a notice says how many were
  omitted. GitHub stops rendering them beyond roughly that many anyway; the
  SARIF report always contains everything.
- **Configuration is honoured.** A `shipcheck.config.json` in the scanned
  directory is picked up automatically. `fail-on` and `min-score` inputs
  override the file.
- **Exit behaviour.** The action sets every output before failing, so a later
  step can still read the score on a failing run.
- **Runtime.** `node24`, the current supported JavaScript action runtime.

## Pinning

```yaml
uses: sinceaihq/ai-shipcheck@v1      # moving major tag, gets fixes
uses: sinceaihq/ai-shipcheck@v1.2.3  # exact release
uses: sinceaihq/ai-shipcheck@<sha>   # immutable, recommended for high-security repos
```

## Permissions

| Doing this | Needs |
| --- | --- |
| Running the scan | `contents: read` |
| Uploading SARIF | `security-events: write` |
| Commenting on a PR | `pull-requests: write` |

The action makes no network requests of its own. It reads files and writes to
the workspace and to the GitHub-provided output files.
