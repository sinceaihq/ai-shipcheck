# Scoring

The score is the number people quote in pull requests, so its definition is
public, fixed in one file, and pinned by unit tests. Every constant below lives
in [`src/scoring/weights.ts`](../src/scoring/weights.ts) and is asserted in
[`tests/unit/scoring.test.ts`](../tests/unit/scoring.test.ts).

## The short version

1. Every category starts at 100.
2. Each rule that fired deducts points based on severity, confidence and how
   many times it fired.
3. Categories that could not be assessed are excluded from the overall score
   rather than given a free 100.
4. The overall score is the weighted mean of the assessed categories.
5. A **blocker** forces `NOT READY` regardless of the number.

## Severity weights

Points deducted for the *first* finding from a rule, before confidence is
applied:

| Severity | Points |
| --- | --- |
| `critical` | 40 |
| `high` | 20 |
| `medium` | 8 |
| `low` | 3 |
| `info` | 0 |

`info` is deliberately zero. Informational findings are shown but never move a
score, so reports do not drift downward as the rule set grows.

## Confidence multipliers

Confidence scales the penalty. It never changes the reported severity.

| Confidence | Multiplier |
| --- | --- |
| `high` | 1.0 |
| `medium` | 0.7 |
| `low` | 0.4 |

This separation matters. A heuristic finding is still described as `high`
severity, because that is how bad it would be if real — it simply costs fewer
points, so a report full of low-confidence guesses cannot tank an otherwise
healthy project.

## Repeated findings

One rule firing forty times is usually one systemic mistake, not forty
problems. Repeats have diminishing returns:

```
penalty = min(weight × (1 + 0.25 × (n − 1)), weight × 3) × confidenceMultiplier
```

For a `high` severity rule at `high` confidence:

| Findings | Penalty |
| --- | --- |
| 1 | 20 |
| 2 | 25 |
| 3 | 30 |
| 5 | 40 |
| 10 | 60 (capped) |
| 100 | 60 (capped) |

Without the cap, a single repeated mistake would zero a category and drown out
every other signal in it.

## Category score

```
categoryScore = clamp(round(100 − totalPenalty), 0, 100)
```

Each category also reports its `contributions`: every rule that deducted
points, how many findings it produced, and how many points it cost. That list
is why the number is what it is.

## Category status

| Status | Meaning | Counts toward the score? |
| --- | --- | --- |
| `assessed` | At least one rule ran and produced a verdict | Yes |
| `unassessed` | Rules applied but nothing could be evaluated — for example, no SQL migrations exist so RLS could not be checked | No |
| `not-applicable` | No rule in the category applies — for example, database rules on a project with no database client | No |

This is the honesty guarantee. A project with no SQL files does not get a free
100 for database safety; it gets "not assessed", and the report says so.

## Category weights

The overall score is a weighted mean over the **assessed** categories only, so
the divisor changes with what could actually be evaluated.

| Category | Weight |
| --- | --- |
| Security | 1.6 |
| Authentication & Authorization | 1.4 |
| Database & Data Safety | 1.3 |
| Reliability | 1.0 |
| AI Cost & Abuse Controls | 0.9 |
| Testing | 0.9 |
| Observability | 0.8 |
| Performance | 0.7 |
| Accessibility | 0.7 |

```
overallScore = round(Σ(categoryScore × weight) / Σ(weight))   over assessed categories only
```

If no category could be assessed, the score is reported as `0` with the verdict
`NEEDS ATTENTION` and an explicit reason — never as `100`.

## Verdicts

Evaluated in order; the first match wins.

| Condition | Verdict |
| --- | --- |
| Any finding marked **blocker** | `NOT READY` |
| Score < 60 | `NOT READY` |
| Any `critical` finding | `NOT READY` |
| Score < 85, or any `high` finding | `NEEDS ATTENTION` |
| Otherwise | `READY` |

### Blockers

A blocker is a finding that is unambiguously unsafe to deploy. One is enough to
force `NOT READY` at a score of 99. This is the guarantee that a good-looking
number cannot hide a service-role key in a client bundle.

Rules marked as blockers today:

- `security/hardcoded-secret`
- `security/public-env-secret`
- `security/unsafe-shell-exec`
- `security/disabled-tls-verification`
- `auth/jwt-verification-bypass`
- `auth/supabase-service-role-exposure`
- `database/supabase-missing-rls`
- `database/raw-sql-interpolation`
- `database/hardcoded-connection-string`
- `ai-cost/ai-key-exposed-to-client`
- `ai-cost/llm-route-without-rate-limit`

A rule may only be a blocker if its severity is `critical` or `high` and its
confidence is `high` or `medium`. That constraint is enforced by a test.

## Why the score changed

Every report explains itself:

- **`verdictReasons`** — the sentences that justify the verdict, including
  which blockers forced it and which categories were excluded.
- **`categories[].contributions`** — the per-rule breakdown of every deduction.
- **`checks[]`** — the status of every rule that was considered, including why
  the skipped ones were skipped.

In JSON output all three are present; the terminal report shows the first and
third, and `--format markdown` shows the first two.

## What the score is not

It is not a measure of code quality, and it is not a security rating. It
summarises how many of *these specific checks* found something, weighted by how
bad each would be. A project can score 100 and still be badly broken in ways no
static analyser can see. The verdict line says this in every report, and it is
worth repeating: **static analysis of source code, not a security
certification**.
