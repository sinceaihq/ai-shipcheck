# Contributing to AI Shipcheck

Thanks for helping. This document covers the practical parts: how to get set
up, what the project optimises for, and what a good contribution looks like.

## Getting set up

```bash
git clone https://github.com/sinceaihq/ai-shipcheck.git
cd ai-shipcheck
npm install
npm run check
```

`npm run check` is the whole gate: typecheck, lint, documentation sync, tests,
build. If it passes locally it will pass in CI.

Node 22 or newer is required. CI runs Node 22 and 24 on Linux, macOS and
Windows, plus the current Node release informationally.

### Useful commands

| Command | What it does |
| --- | --- |
| `npm test` | Run the test suite |
| `npm run test:watch` | Watch mode |
| `npm run test:coverage` | Coverage report with thresholds |
| `npm run build` | Build `dist/` |
| `npm run build:action` | Rebuild the bundled GitHub Action |
| `npm run docs:rules` | Regenerate `docs/rules/` from rule metadata |
| `npm run bench` | Run the benchmark harness |
| `npm run verify:package` | Clean-room package verification |
| `npm run corpus:sync` | Clone the validation corpus at its pinned commits |
| `npm run corpus:scan` | Scan the corpus and write `corpus/results/` |
| `npm run check` | Everything |

## What this project optimises for

Read this before proposing a change. It explains most review feedback in
advance.

**Correctness over coverage.** A rule that fires on correct code costs more
trust than a rule that misses something gains. When in doubt, do not report.

**Evidence over inference.** Every actionable finding cites a file, a line and
a snippet. If a check cannot point at something concrete, it probably belongs
in documentation rather than in the rule set.

**Honesty over completeness.** A check that cannot be evaluated is marked
`unassessed` and excluded from the score. Manufacturing a pass is worse than
admitting a gap.

**Nothing leaves the machine, nothing gets executed.** No network calls, no
telemetry, and never running, importing or evaluating code from the scanned
repository. These are not negotiable — they are what makes the tool safe to
point at an unknown repository.

**Small dependency tree.** A tool that inspects other people's supply chains
should have almost none of its own. There is exactly one runtime dependency
(`ignore`, for `.gitignore` semantics). Adding a second needs a real argument.

## Adding a rule

The full walkthrough with a worked example is in
**[docs/adding-a-rule.md](docs/adding-a-rule.md)**. The short version:

1. Implement it in `src/rules/<category>/<rule-name>.ts` using `defineRule`.
2. Register it in `src/rules/index.ts`.
3. Add code to a `fixtures/vulnerable-*` project that it fires on.
4. Make sure it does **not** fire on the `fixtures/secure-*` projects.
5. Add focused cases to `tests/integration/rules.test.ts` — especially the
   near-miss shapes that must not fire.
6. Run `npm run docs:rules` and commit the generated page.
7. Run `npm run check`.

The fixture suite enforces both halves of this automatically: a rule that never
fires on any vulnerable fixture fails the build, and any rule that fires on a
secure fixture fails the build.

### What makes a good rule

- **Specific.** "Route handler writes to the database with no authorisation
  check" is a rule. "Code might be insecure" is not.
- **Statically decidable.** If it depends on runtime configuration or
  infrastructure you cannot see, it is not a rule.
- **Actionable.** The remediation should tell someone what to type. "Consider
  reviewing this" is not a remediation.
- **Honest about confidence.** `confidence` is separate from `severity` for a
  reason: a heuristic finding can still be described as critical while being
  weighted lightly in the score.

Rules that exist mainly to increase the rule count will be declined.

## Validating against real code

Fixtures agree with the rule that produced them by construction. The thing that
actually tells you whether a rule is precise is running it over code written by
people who have never heard of this project.

```bash
npm run build
npm run corpus:sync    # clones 20 pinned repositories into ~/.cache
npm run corpus:scan    # scans them, writes corpus/results/
```

The repositories are never vendored — they live in a cache directory outside
the repository, so third-party source can never be staged or published by
accident.

**Run this before and after any change to a rule, the lexer, or detection.**
Compare `corpus/results/SUMMARY.md`: a change that moves a rule's total by an
order of magnitude needs an explanation in the pull request, and a change that
silences a rule entirely usually means it was narrowed too far.

If you change what a rule reports, update its row in
[`corpus/TRIAGE.md`](corpus/TRIAGE.md).

Widening the corpus is one of the most valuable contributions available. Add a
repository to `corpus/corpus.json`, run `npm run corpus:sync -- --pin`, triage
whatever it surfaces, and open a pull request with the fixes.

## Fixing a false positive

These get priority. A good fix is:

1. A regression test in `tests/integration/rules.test.ts` that fails before
   your change, in a `does not fire` case.
2. The narrowest possible change to the rule.
3. A note in `CHANGELOG.md` under `Unreleased`.

Please do not fix a false positive by deleting the rule or by broadening an
exclusion so far that the rule stops catching the real case.

## Commit and pull-request conventions

Commit messages: imperative mood, explain *why* in the body when it is not
obvious.

```
Narrow the SSRF rule to request-derived hosts

The rule fired on any interpolated fetch URL, including base URLs read
from configuration. It now requires the interpolated binding to be
assigned from request data somewhere in the module.
```

Pull requests should be focused. A rule change and a refactor in the same PR
will be asked to split.

## Testing expectations

- New behaviour needs a test. Not "a test file exists" — a test that fails if
  the behaviour is removed.
- Rule changes need both a positive and a negative case.
- A fix for something the corpus surfaced belongs in
  `tests/integration/corpus-regressions.test.ts`, with a comment naming the
  repository it came from. That comment is what stops the next person
  "simplifying" the fix away.
- Filesystem and parser changes need a hostile-input case.
- No test may depend on network access, wall-clock timing, or the contents of
  a directory outside the repository or a temporary directory.

Coverage thresholds are enforced at 75% (lines, functions, branches,
statements). Coverage is a floor, not a goal.

## Reporting things

- [Bug report](https://github.com/sinceaihq/ai-shipcheck/issues/new?template=bug_report.yml)
- [False positive](https://github.com/sinceaihq/ai-shipcheck/issues/new?template=false_positive.yml)
- [False negative](https://github.com/sinceaihq/ai-shipcheck/issues/new?template=false_negative.yml)
- [New rule proposal](https://github.com/sinceaihq/ai-shipcheck/issues/new?template=rule_proposal.yml)
- [Feature request](https://github.com/sinceaihq/ai-shipcheck/issues/new?template=feature_request.yml)
- Security vulnerabilities: see [SECURITY.md](SECURITY.md) — please report
  privately.

## How the project is run

[GOVERNANCE.md](GOVERNANCE.md) covers how decisions are made, what a rule must
carry before it can merge, how releases are cut, and what maintainers are
responsible for. Read it if you plan to contribute more than once.

## Code of conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

By contributing you agree that your contributions are licensed under the MIT
Licence, the same terms as the project.
