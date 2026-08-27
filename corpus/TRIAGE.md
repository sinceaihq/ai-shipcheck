# Corpus triage

What AI Shipcheck reported on 20 real public repositories, what was wrong with
it, and what was changed as a result.

This is the record that makes the precision claim checkable. Every fix below
has a minimal regression test in
[`tests/integration/corpus-regressions.test.ts`](../tests/integration/corpus-regressions.test.ts),
named after the repository the problem was found in.

## Result

| | Before triage | After |
| --- | --- | --- |
| Findings across the corpus | 5,710 | **2,819** |
| Rules firing | 52 | 51 |
| Rules changed | — | 24 |
| Rules removed or replaced | — | 1 |
| Regression tests added | — | 37 |

The reduction is **51%**, and none of it came from suppressing repositories by
name. Every change is a narrowing of what a rule claims, or a correction of
something that was simply wrong.

## Method

The harness (`npm run corpus:scan`) records every finding grouped by rule. Each
rule that fired was triaged by reading real matches in context — between two
and ten per rule, weighted toward the highest-volume rules and toward every
rule marked as a blocker, since a blocker forces a `NOT READY` verdict and must
be near-certain.

Findings are classified per rule, not per instance. A rule that fires 661 times
on the same defensible basis is one judgement, not 661.

## The one that mattered most

**Line numbers were wrong in any file containing a multi-line comment.**

The tokeniser consumed a block comment in a single jump (`i = close`), so
newlines inside it were never counted. Every line number after any JSDoc or
licence header was reported too low — by exactly the number of lines in the
comment.

The fixtures did not catch this because they are small and put findings before
their comments. Real files put a licence header at the top of everything.

Line starts are now computed in a dedicated pass over the source, independent
of tokenisation, so the class of bug cannot recur. Six constructs that span
newlines are covered by tests.

This is the single strongest argument for validating against real code.

## Blocker rules

A blocker overrides the score. These got the most scrutiny.

| Rule | Verdict | Action |
| --- | --- | --- |
| `security/hardcoded-secret` | **False positive** | Fired on Thai and Chinese UI strings in `payloadcms/payload`. Shannon entropy is per character, and CJK prose scores higher than a real API key; paired with a binding named `…Password`, this produced a blocking critical finding on a localisation file. Entropy is now only considered for values that are ASCII and token-shaped. |
| `database/supabase-missing-rls` | **False positive** | Fired on `nextauthjs/next-auth`, which ships a Supabase adapter, so Supabase was detected and every unrelated Prisma migration in the monorepo was reported as missing RLS. Now scoped to SQL under a `supabase/` directory. |
| `security/disabled-tls-verification` | **Context-dependent** | `usebruno/bruno` disables verification behind an explicit `--insecure` flag, as curl does. No longer reported when the disabling is visibly gated on such an option. Unconditional disabling is unchanged. |
| `auth/jwt-verification-bypass` | **False positive** | Fired on `decodeJwt(token)` used to read an expiry, in both `langchainjs` and `payload`. Decoding is only dangerous when the result is *trusted*; the rule now requires an identity or role claim to be read, and that case is `high`/`low` rather than a blocker. Only `algorithms: ['none']` still blocks. |
| `security/public-env-secret` | **False positive** | A PostHog project key is designed to be in the page. The known-public list now covers the analytics, error-reporting, search and realtime vendors. |
| `ai-cost/ai-key-exposed-to-client` | **Mixed** | Genuine in `environment_tests/` sample code (now excluded as non-production); in `langchain-openai` it is a library pass-through. Blocks only for a deployable application. |
| `database/raw-sql-interpolation` | **False positive** | `Prisma.sql\`…\`` and `sql<number>\`…\`` are the documented *safe* forms and were reported as injection — a lookbehind rejected member access, and a generic type argument broke the tag match. Also now blocks only in request-handling code; in a query builder the same construct is a different risk. |
| `security/unsafe-shell-exec` | True positive | No change. |
| `security/committed-env-file` | **False positive** | `vitejs/vite` commits `.env` files as inputs to its env-loading tests. Now excludes non-production paths. |
| `database/hardcoded-connection-string` | True positive | No change. |
| `ai-cost/llm-route-without-rate-limit` | True positive | No change. |

## High-volume rules

| Rule | Before | After | Verdict and action |
| --- | --- | --- | --- |
| `accessibility/form-control-missing-label` | 828 | 661 | **Mostly true positive.** Sampled matches were real: a sibling `<label>` with no `htmlFor` does not associate. But `<label><input/></label>` is valid HTML and was not recognised, and hidden or `tabIndex={-1}` controls are not user-facing. Both fixed; the remainder is genuine accessibility debt. |
| `reliability/missing-fetch-timeout` | 572 | 1 | **Too broad to be useful.** Fired in 17 of 20 repositories — effectively reporting that a codebase uses `fetch`. Now restricted to request-handling code, where a hung upstream actually holds a client connection open. |
| `performance/unbounded-query` | 444 | 11 | **False positive.** `findMany({ where: { id: { in: ids } } })` is a targeted lookup, not a table scan. A `where` clause now counts as a bound. |
| `ai-cost/missing-token-limit` | 436 | 198 | **True positive** for real model calls. The `.invoke({ messages })` pattern was removed: in LangChain it is the generic runnable entry point, where limits are configured on the model rather than at the call site. |
| `performance/next-unoptimized-image` | 351 | 80 | **Style lint, not readiness.** Narrowed to the measurable harm — an `<img>` the browser cannot reserve space for, which is what causes layout shift. |
| `accessibility/non-interactive-click-handler` | 349 | 343 | **True positive.** Real keyboard inaccessibility. Unchanged apart from path exclusions. |
| `reliability/swallowed-error` | 350 | 330 | **True positive.** Overwhelmingly `catch {}` with an empty body. A catch paired with a `finally` is now accepted as deliberate. |
| `reliability/unhandled-promise` | 301 | 151 | **False positive.** The statement scan stopped at the first brace of an intervening object literal, losing the `const x =` or `await` that showed the result was handled. Boundary detection is now depth-aware, and confidence is `low`. |
| `testing/focused-or-skipped-test` | 256 | — | **Rule replaced.** `.skip` in a mature suite is normal and deliberate; 256 reports of it are noise. Replaced by `testing/focused-test`, which reports only `.only` — rare, dangerous, and silently disables the rest of a file. |
| `database/destructive-migration` | 102 | 52 | **False positive.** `ALTER TABLE … DROP CONSTRAINT` destroys no data, and Prisma emits it in nearly every migration touching a relation. Only table, column, schema and database drops and truncations now count. |
| `database/unbounded-mutation` | 135 | 16 | **False positive.** `ON UPDATE CASCADE` inside a foreign key contains `update` followed by an identifier. DML must now start at a statement boundary. |
| `security/dangerous-html` | 172 | 103 | **True positive**, except for `__html` assigned a constant string — there is no input to inject into a literal. |
| `security/open-redirect` | 58 | 49 | **False positive.** A bare `next` is one of the commonest identifiers in a Next.js codebase; matching it reported every redirect that mentioned the word. Also now recognises validation helpers (`isValidReturnTo`, `normalizeRedirect`) and literal same-origin targets. |
| `performance/sync-io-in-request-path` | 48 | 34 | **Context-dependent.** Genuine in route handlers; in a build tool a `server-module` is not a request path. Now requires a deployable application for the module case. |
| `security/permissive-cors` | 28 | 28 | **Context-dependent.** A wildcard on a deliberately public endpoint returning static data is correct. Reported as `medium`/`low` unless credentials are also allowed, which remains `critical`. |
| `reliability/hardcoded-environment-url` | 152 | 10 | **False positive.** Localhost defaults in email templates and candidate-endpoint lists are normal. Narrowed to request-handling code. |

## Structural changes

**Non-production paths.** 21% of all findings sat in `examples/`, `templates/`,
`benchmarks/`, `playground/`, `docs/`, `e2e/` and generated bindings. These are
written to demonstrate or measure something, not to be deployed. The shared
guard now covers them and is applied by every file-scoped rule; the sole
exception is `reliability/debug-mode-in-production`, which must read build
configuration by design.

**Monorepo detection.** Found while triaging: a monorepo root manifest usually
declares no framework, so detection found nothing and every framework-specific
rule was skipped — a confident-looking report that had checked almost nothing.
Dependencies are now unioned across every `package.json` in the tree.

## Accepted as context-dependent

Not everything reported is a defect, and not everything left is wrong. These
remain, deliberately:

- **`drizzle-orm` builds SQL by interpolation** (91 findings). That is what a
  query builder does. Reported at `high`/`low` and non-blocking, because the
  construct is real and a reader should confirm the values are its own
  identifiers rather than request data.
- **`anything-llm` model calls have no token cap** (173 findings). Accurate:
  each provider wrapper calls `create({ model, messages })` with no
  `max_tokens`. Whether that matters is the maintainers' call.
- **Accessibility debt in real applications** (1,200+ findings). Sampling
  confirmed these are real. The volume reflects the codebases, not the rules.
  Per-rule scoring is capped at three times the base weight, so 661 findings
  cost exactly what 5 would — the report is long, but the score is not
  distorted.

## Reproducing this

```bash
npm run build
npm run corpus:sync    # clone/checkout the pinned commits
npm run corpus:scan    # rewrite results/
npm run corpus:report
```

The repositories are pinned by SHA in `corpus.json`. Moving them forward
(`npm run corpus:sync -- --pin`) means re-triaging what changed.
