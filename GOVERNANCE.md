# Governance

How AI Shipcheck is maintained. Written so that anyone with maintainer access
can run the project without needing to ask the original author anything.

## Principles

The project optimises for **trust over coverage**. A scanner people stop
reading is worse than no scanner. Concretely:

1. A false positive costs more than a missed finding gains.
2. Every actionable finding cites a file, a line and a rule.
3. A check that cannot be evaluated is reported as `unassessed`, never as a
   pass.
4. Nothing from a scanned repository is executed, imported or uploaded.
5. The dependency tree stays close to empty.

When a decision is unclear, the question to ask is: *would a reader who
disagrees with this finding lose confidence in the whole report?*

## How changes are made

**Everything goes through a pull request.** That includes maintainers; the
value is the review and the CI run, not the ceremony.

**CI must be green.** Four workflows run on every pull request:

| Workflow | What it protects |
| --- | --- |
| `ci.yml` | Types, lint, format, docs sync, tests on Linux/macOS/Windows × Node 22/24, coverage |
| `package.yml` | The published tarball actually installs and runs, on Linux and Windows |
| `action-selftest.yml` | The bundled GitHub Action works against both a clean and a broken fixture |
| `self-scan.yml` | Shipcheck scans itself and uploads SARIF |

`npm run check` reproduces most of this locally. `npm run gate` runs the full
release gate, which is a superset.

**A rule change needs evidence.** See below.

## Rules

Every rule must have all five of these. The build enforces the first four.

1. An implementation under `src/rules/<category>/` using `defineRule`.
2. Metadata: id, severity, confidence, description, remediation. Documentation
   is generated from it by `npm run docs:rules`; `npm run docs:check` fails if
   the committed pages have drifted.
3. A **vulnerable fixture** it fires on. `tests/integration/fixtures.test.ts`
   fails the build if a rule never fires on any of them — a rule that cannot
   produce a finding is dead code.
4. A **secure fixture** it does not fire on. The same test asserts the secure
   fixtures produce **zero** findings. That is the false-positive budget, and
   it is zero.
5. Focused cases in `tests/integration/rules.test.ts` covering the near-miss
   shapes that must *not* fire. These matter more than the positive case.

`docs/adding-a-rule.md` is a worked example from an empty file to a merged
pull request.

### False positives are regressions

A rule firing on correct code is treated as a bug of the same severity as a
crash, not as tuning. The fix is:

1. A failing test in `tests/integration/corpus-regressions.test.ts` (if it came
   from the corpus) or `tests/integration/rules.test.ts`, with a comment naming
   where it was found. That comment is what stops the next person
   "simplifying" the fix away.
2. The **narrowest** change to the rule that makes it pass.
3. A note in `CHANGELOG.md` under `Unreleased`.

Do not fix a false positive by deleting the rule, by broadening an exclusion
until the rule stops catching the real case, or by adding a project name to an
ignore list. If a rule cannot be made precise, narrow its applicability, lower
its confidence, or remove it — a smaller trustworthy rule set beats a larger
noisy one.

### Validating against real code

Fixtures agree with the rule that produced them by construction. Before merging
any change to a rule, the lexer or detection:

```bash
npm run build
npm run corpus:sync    # 20 public repositories, pinned by commit SHA
npm run corpus:scan
```

Compare `corpus/results/SUMMARY.md` before and after. A change that moves a
rule's total by an order of magnitude needs an explanation in the pull request.
A change that silences a rule entirely usually means it was narrowed too far.
Update the rule's row in `corpus/TRIAGE.md` when its behaviour changes.

Widening the corpus is among the most valuable contributions available.

## Releases

Releases are cut by the `release.yml` workflow and nothing else. There is no
npm token in the repository, in a GitHub secret, or on anyone's machine:
publishing authenticates with a short-lived OIDC token that npm Trusted
Publishing exchanges for publish rights, scoped to this repository, this
workflow file and the `release` environment.

The process, the one-time npm configuration, and the checklist are in
**[docs/RELEASING.md](docs/RELEASING.md)**. In short: bump the version in
`package.json` *and* `src/version.ts`, write the changelog entry, run
`npm run gate`, dispatch the workflow with `dry-run` ticked, then again with it
unticked.

### Tags

| Tag | Meaning |
| --- | --- |
| `vX.Y.Z` | Immutable. Points at one commit, forever. |
| `vX` | Moving. Always the newest `X.y.z`. This is what the Action docs tell people to use. |

**The `v1` tag moves only for releases that are compatible with v1.** A change
that renames or removes a rule id, removes a CLI flag, changes an exit code, or
alters the JSON schema shape is a major release and gets `v2` — moving `v1` onto
it would silently break every workflow pinned to `@v1`.

### What is public contract

- **Rule ids.** They appear in user configuration and in SARIF.
- **The JSON `schemaVersion`.**
- **CLI flags and exit codes.**

The full table of what bumps which version component is in
`docs/RELEASING.md`.

## Security

Vulnerabilities in Shipcheck itself are reported privately through
**[SECURITY.md](SECURITY.md)**, never as a public issue. That document defines
what counts — escaping the scan root, executing target code, leaking a
discovered secret, non-termination, output injection — and the response times.

A missed or wrong finding is a bug, not a vulnerability; those go to the normal
issue templates.

## Maintainer responsibilities

- **Triage.** Label incoming issues. False-positive reports get priority over
  feature requests.
- **Review.** Check that rule changes carry both fixtures and the near-miss
  tests, and that CI is green. Ask for the corpus comparison when a rule
  changed.
- **Merge.** Squash unless the branch has a genuinely useful history.
- **Release.** Follow `docs/RELEASING.md`. Do not publish from a laptop.
- **Dependencies.** Dependabot opens grouped pull requests weekly. Review them;
  do not enable auto-merge. The production dependency tree is one package, and
  keeping it that way is a deliberate constraint — a new runtime dependency
  needs an argument in the pull request.
- **Say no.** Rules that exist to make a number bigger make the tool worse.
  Declining a proposal with a clear reason is a normal part of the job.

## Decisions

Small changes: any maintainer may merge after review. Anything that changes
what a verdict means — scoring constants, blocker status, removing a rule,
altering the public contract — should have agreement from a second maintainer
on the pull request, and an entry in `CHANGELOG.md` explaining the reasoning.

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
Enforcement contact is in that document.
