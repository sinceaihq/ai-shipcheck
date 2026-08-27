# Rule reference

AI Shipcheck ships 63 rules across 9 production-readiness categories.

This page is generated from rule metadata by `npm run docs:rules`. Do not edit it by hand.

⛔ marks a **blocker**: a single finding forces a `NOT READY` verdict regardless of score.

## Security

| Rule | Severity | Confidence | Description |
| --- | --- | --- | --- |
| [`security/committed-env-file`](./security__committed-env-file.md) | `high` | `high` | Environment file is not excluded from version control |
| [`security/dangerous-html`](./security__dangerous-html.md) | `high` | `medium` | Raw HTML injected without sanitisation |
| [`security/disabled-tls-verification`](./security__disabled-tls-verification.md) ⛔ | `critical` | `high` | TLS certificate verification disabled |
| [`security/eval-usage`](./security__eval-usage.md) | `high` | `high` | Dynamic code execution |
| [`security/exposed-debug-route`](./security__exposed-debug-route.md) | `high` | `medium` | Debug or maintenance route exposed in production |
| [`security/hardcoded-secret`](./security__hardcoded-secret.md) ⛔ | `critical` | `high` | Hardcoded credential in source |
| [`security/insecure-randomness`](./security__insecure-randomness.md) | `high` | `medium` | Security value generated with Math.random() |
| [`security/open-redirect`](./security__open-redirect.md) | `high` | `medium` | Redirect target taken from the request without validation |
| [`security/permissive-cors`](./security__permissive-cors.md) | `high` | `high` | Permissive CORS configuration |
| [`security/public-env-secret`](./security__public-env-secret.md) ⛔ | `critical` | `high` | Secret exposed through a browser-visible environment variable |
| [`security/sensitive-data-logging`](./security__sensitive-data-logging.md) | `high` | `medium` | Credential or personal data written to logs |
| [`security/unsafe-shell-exec`](./security__unsafe-shell-exec.md) ⛔ | `critical` | `medium` | Shell command built from interpolated values |
| [`security/unsafe-url-construction`](./security__unsafe-url-construction.md) | `high` | `medium` | Outbound request URL host built from request data |
| [`security/weak-crypto`](./security__weak-crypto.md) | `high` | `high` | Broken or unsuitable cryptographic primitive |

## Authentication & Authorization

| Rule | Severity | Confidence | Description |
| --- | --- | --- | --- |
| [`auth/client-side-only-authorization`](./auth__client-side-only-authorization.md) | `high` | `medium` | Authorisation decision made only in the browser |
| [`auth/jwt-verification-bypass`](./auth__jwt-verification-bypass.md) ⛔ | `critical` | `high` | JWT accepted without verifying its signature |
| [`auth/missing-auth-middleware`](./auth__missing-auth-middleware.md) | `medium` | `medium` | Private area has no route-level authentication gate |
| [`auth/server-action-missing-auth`](./auth__server-action-missing-auth.md) | `high` | `medium` | Server action performs a write with no authorisation check |
| [`auth/supabase-service-role-exposure`](./auth__supabase-service-role-exposure.md) ⛔ | `critical` | `high` | Supabase service-role key reachable from the browser |
| [`auth/unprotected-route-handler`](./auth__unprotected-route-handler.md) | `high` | `medium` | State-changing API route with no authorisation check |
| [`auth/unscoped-record-access`](./auth__unscoped-record-access.md) | `high` | `low` | Record fetched by request-supplied id without an ownership check |
| [`auth/unverified-webhook`](./auth__unverified-webhook.md) | `high` | `medium` | Webhook endpoint does not verify its signature |

## Database & Data Safety

| Rule | Severity | Confidence | Description |
| --- | --- | --- | --- |
| [`database/destructive-migration`](./database__destructive-migration.md) | `high` | `medium` | Migration destroys data without a guard |
| [`database/hardcoded-connection-string`](./database__hardcoded-connection-string.md) ⛔ | `critical` | `high` | Database connection string with inline credentials |
| [`database/permissive-rls-policy`](./database__permissive-rls-policy.md) | `critical` | `high` | Row-level security policy allows unrestricted access |
| [`database/prisma-raw-unsafe`](./database__prisma-raw-unsafe.md) | `high` | `high` | Prisma raw query executed without parameterisation |
| [`database/raw-sql-interpolation`](./database__raw-sql-interpolation.md) ⛔ | `critical` | `medium` | SQL query built by string interpolation |
| [`database/supabase-missing-rls`](./database__supabase-missing-rls.md) ⛔ | `critical` | `high` | Table created without row-level security enabled |
| [`database/unbounded-mutation`](./database__unbounded-mutation.md) | `critical` | `medium` | Destructive query with no filter |

## Reliability

| Rule | Severity | Confidence | Description |
| --- | --- | --- | --- |
| [`reliability/debug-mode-in-production`](./reliability__debug-mode-in-production.md) | `high` | `high` | Build safety checks disabled |
| [`reliability/hardcoded-environment-url`](./reliability__hardcoded-environment-url.md) | `medium` | `medium` | Localhost URL hardcoded in application code |
| [`reliability/missing-fetch-timeout`](./reliability__missing-fetch-timeout.md) | `medium` | `medium` | Outbound request with no timeout |
| [`reliability/missing-health-endpoint`](./reliability__missing-health-endpoint.md) | `low` | `medium` | No health or readiness endpoint |
| [`reliability/process-exit-in-request-path`](./reliability__process-exit-in-request-path.md) | `high` | `high` | process.exit() inside a request handler |
| [`reliability/retry-without-backoff`](./reliability__retry-without-backoff.md) | `medium` | `low` | Retry loop with no delay between attempts |
| [`reliability/swallowed-error`](./reliability__swallowed-error.md) | `medium` | `high` | Error caught and discarded |
| [`reliability/unhandled-promise`](./reliability__unhandled-promise.md) | `medium` | `medium` | Promise chain with no rejection handler |

## Testing

| Rule | Severity | Confidence | Description |
| --- | --- | --- | --- |
| [`testing/ci-missing-checks`](./testing__ci-missing-checks.md) | `medium` | `medium` | CI pipeline is missing a core check |
| [`testing/focused-or-skipped-test`](./testing__focused-or-skipped-test.md) | `high` | `high` | Focused or skipped test committed |
| [`testing/no-test-infrastructure`](./testing__no-test-infrastructure.md) | `high` | `high` | Project has no tests |
| [`testing/untested-server-code`](./testing__untested-server-code.md) | `medium` | `low` | Server-side code has no visible test coverage |

## Observability

| Rule | Severity | Confidence | Description |
| --- | --- | --- | --- |
| [`observability/console-only-logging`](./observability__console-only-logging.md) | `medium` | `medium` | Server logging goes only through console |
| [`observability/missing-error-boundary`](./observability__missing-error-boundary.md) | `medium` | `medium` | No React error boundary |
| [`observability/no-error-monitoring`](./observability__no-error-monitoring.md) | `medium` | `high` | No production error monitoring |
| [`observability/silent-catch-in-handler`](./observability__silent-catch-in-handler.md) | `medium` | `medium` | Request handler catches an error without recording it |

## Performance

| Rule | Severity | Confidence | Description |
| --- | --- | --- | --- |
| [`performance/heavy-client-import`](./performance__heavy-client-import.md) | `low` | `medium` | Large dependency imported into client code |
| [`performance/n-plus-one-query`](./performance__n-plus-one-query.md) | `medium` | `low` | Database query issued inside a loop |
| [`performance/next-unoptimized-image`](./performance__next-unoptimized-image.md) | `low` | `medium` | Raw <img> tag in a Next.js application |
| [`performance/sync-io-in-request-path`](./performance__sync-io-in-request-path.md) | `high` | `high` | Synchronous I/O in a request handler |
| [`performance/unbounded-query`](./performance__unbounded-query.md) | `medium` | `medium` | Query returns every row with no limit |

## Accessibility

| Rule | Severity | Confidence | Description |
| --- | --- | --- | --- |
| [`accessibility/form-control-missing-label`](./accessibility__form-control-missing-label.md) | `medium` | `medium` | Form control with no accessible label |
| [`accessibility/img-missing-alt`](./accessibility__img-missing-alt.md) | `medium` | `high` | Image without an alt attribute |
| [`accessibility/inaccessible-interactive-element`](./accessibility__inaccessible-interactive-element.md) | `medium` | `medium` | Interactive element with no accessible name |
| [`accessibility/invalid-anchor`](./accessibility__invalid-anchor.md) | `medium` | `high` | Anchor used as a button |
| [`accessibility/missing-html-lang`](./accessibility__missing-html-lang.md) | `low` | `high` | Root <html> element has no lang attribute |
| [`accessibility/non-interactive-click-handler`](./accessibility__non-interactive-click-handler.md) | `medium` | `high` | Click handler on a non-interactive element |
| [`accessibility/positive-tabindex`](./accessibility__positive-tabindex.md) | `low` | `high` | Positive tabIndex disrupts focus order |

## AI Cost & Abuse Controls

| Rule | Severity | Confidence | Description |
| --- | --- | --- | --- |
| [`ai-cost/ai-key-exposed-to-client`](./ai-cost__ai-key-exposed-to-client.md) ⛔ | `critical` | `high` | Model provider API key reachable from the browser |
| [`ai-cost/llm-route-without-rate-limit`](./ai-cost__llm-route-without-rate-limit.md) ⛔ | `critical` | `medium` | LLM endpoint with neither authentication nor rate limiting |
| [`ai-cost/missing-llm-timeout`](./ai-cost__missing-llm-timeout.md) | `medium` | `medium` | Model call with no timeout |
| [`ai-cost/missing-token-limit`](./ai-cost__missing-token-limit.md) | `medium` | `medium` | Model call with no output token limit |
| [`ai-cost/untrusted-prompt-to-tools`](./ai-cost__untrusted-prompt-to-tools.md) | `high` | `low` | User input reaches a tool-enabled model call |
| [`ai-cost/user-controlled-model`](./ai-cost__user-controlled-model.md) | `high` | `medium` | Model identifier taken from the request |
