# Support

## Start here

| What you have | Where it goes |
| --- | --- |
| A rule fired on correct code | [False positive report](https://github.com/sinceaihq/ai-shipcheck/issues/new?template=false_positive.yml) — the highest-priority kind of bug here |
| A real problem it failed to report | [False negative report](https://github.com/sinceaihq/ai-shipcheck/issues/new?template=false_negative.yml) |
| Something crashed or behaved wrongly | [Bug report](https://github.com/sinceaihq/ai-shipcheck/issues/new?template=bug_report.yml) |
| An idea for a new check | [Rule proposal](https://github.com/sinceaihq/ai-shipcheck/issues/new?template=rule_proposal.yml) |
| An idea for a capability | [Feature request](https://github.com/sinceaihq/ai-shipcheck/issues/new?template=feature_request.yml) |
| A question, or you want to think out loud | [Discussions](https://github.com/sinceaihq/ai-shipcheck/discussions) |
| A security vulnerability **in AI Shipcheck itself** | [Private report](https://github.com/sinceaihq/ai-shipcheck/security/advisories/new) — see [SECURITY.md](SECURITY.md). Never a public issue. |

If none of that fits, email **builders@sinceai.fi**.

## Before you file

Most reports are resolved faster with two things: the **version**
(`npx ai-shipcheck --version`) and a **minimal reproduction** — the smallest
project that still shows the behaviour. A few files inline in the issue is
ideal.

`ai-shipcheck explain <rule-id>` prints the full reasoning behind any finding,
including why it is considered a problem and how to fix it. That answers a lot
of "is this a false positive?" questions before an issue is needed.

For an unexpected crash, `SHIPCHECK_DEBUG=1` adds a stack trace. Read it before
pasting — Shipcheck masks credentials it detects, but nothing masks a stack
trace.

## Response expectations

AI Shipcheck is maintained by a small team at Since AI alongside other work.
Issues are read, and false positives are treated as regressions rather than
tuning requests. We do not promise a response time, and we would rather say
that plainly than publish a target we cannot hold to.

Security reports are the exception: they are prioritised, and
[SECURITY.md](SECURITY.md) describes how they are handled.

## Things worth knowing first

A lot of questions are answered by the documented limits of what static
analysis can do:

- **[docs/LIMITATIONS.md](docs/LIMITATIONS.md)** — what Shipcheck cannot tell
  you, including the deliberate trade-offs in the lexer and the known
  false-positive sources.
- **[docs/SCORING.md](docs/SCORING.md)** — why a score is what it is, and why
  a category can be reported as *not assessed* rather than scored.
- **[docs/rules](docs/rules/README.md)** — every rule, what it means, how to
  fix it, and how to switch it off.
- **[docs/configuration.md](docs/configuration.md)** — excluding paths,
  disabling rules, changing severities, thresholds.

In particular: a clean report means the checks Shipcheck knows how to make
found nothing. It is not a security certification, and a score of 100 is not a
claim that the code is correct.

## Contributing a fix

Fixes are welcome and the process is short — see
[CONTRIBUTING.md](CONTRIBUTING.md) and, for a new check,
[docs/adding-a-rule.md](docs/adding-a-rule.md). Issues labelled
[`good first issue`](https://github.com/sinceaihq/ai-shipcheck/issues?q=is%3Aopen+label%3A%22good+first+issue%22)
are scoped to be a reasonable first contribution.

## Commercial

AI Shipcheck is MIT-licensed and free. It is built by
[Since AI](https://sinceai.ai) — reach us at **builders@sinceai.fi**.
