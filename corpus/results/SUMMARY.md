# Corpus validation summary

Generated 2026-08-27T19:28:40.379Z

20 repositories scanned, 2819 findings, 33437 files.

## Per repository

| Repository | Commit | Score | Verdict | Findings | Files | ms |
| --- | --- | --- | --- | --- | --- | --- |
| [vercel/ai-chatbot](https://github.com/vercel/ai-chatbot) | `c2f8235e1f` | 86 | NEEDS ATTENTION | 45 | 163 | 134 |
| [steven-tey/novel](https://github.com/steven-tey/novel) | `fa95098e66` | 93 | NEEDS ATTENTION | 9 | 73 | 40 |
| [supabase-community/nextjs-openai-doc-search](https://github.com/supabase-community/nextjs-openai-doc-search) | `50d6bb7170` | 96 | NEEDS ATTENTION | 7 | 24 | 24 |
| [vercel/platforms](https://github.com/vercel/platforms) | `ec12e65709` | 95 | NEEDS ATTENTION | 5 | 24 | 11 |
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | `683a5a9b37` | 86 | NEEDS ATTENTION | 60 | 4150 | 1486 |
| [t3-oss/create-t3-app](https://github.com/t3-oss/create-t3-app) | `4709861f7e` | 94 | NEEDS ATTENTION | 5 | 358 | 124 |
| [documenso/documenso](https://github.com/documenso/documenso) | `4285c88f12` | 58 | NOT READY | 171 | 2367 | 1780 |
| [dubinc/dub](https://github.com/dubinc/dub) | `dc21ec5285` | 53 | NOT READY | 372 | 4336 | 3330 |
| [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw) | `e1bb9ff8f8` | 74 | NOT READY | 53 | 718 | 589 |
| [TanStack/query](https://github.com/TanStack/query) | `2969edf32f` | 91 | NEEDS ATTENTION | 19 | 1994 | 501 |
| [expressjs/express](https://github.com/expressjs/express) | `023767fe98` | 99 | READY | 2 | 158 | 48 |
| [fastify/fastify](https://github.com/fastify/fastify) | `1beaf7e72d` | 98 | READY | 12 | 356 | 139 |
| [honojs/hono](https://github.com/honojs/hono) | `499c35ebda` | 91 | NEEDS ATTENTION | 19 | 422 | 208 |
| [drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm) | `b7862528fd` | 58 | NOT READY | 137 | 1315 | 709 |
| [nextauthjs/next-auth](https://github.com/nextauthjs/next-auth) | `a1a16a5a77` | 63 | NOT READY | 74 | 792 | 236 |
| [Mintplex-Labs/anything-llm](https://github.com/Mintplex-Labs/anything-llm) | `35c58d8990` | 43 | NOT READY | 1031 | 1340 | 1440 |
| [langchain-ai/langchainjs](https://github.com/langchain-ai/langchainjs) | `679f79bd19` | 62 | NOT READY | 72 | 2415 | 1343 |
| [payloadcms/payload](https://github.com/payloadcms/payload) | `528977b62c` | 61 | NOT READY | 106 | 7542 | 3893 |
| [usebruno/bruno](https://github.com/usebruno/bruno) | `cedf838138` | 68 | NOT READY | 571 | 2753 | 1868 |
| [vitejs/vite](https://github.com/vitejs/vite) | `ee644014aa` | 74 | NOT READY | 49 | 2137 | 508 |

## Findings by rule

| Rule | Findings | Repositories |
| --- | --- | --- |
| `accessibility/form-control-missing-label` | 661 | 7 |
| `accessibility/non-interactive-click-handler` | 343 | 7 |
| `reliability/swallowed-error` | 330 | 13 |
| `accessibility/inaccessible-interactive-element` | 204 | 9 |
| `ai-cost/missing-token-limit` | 198 | 6 |
| `database/raw-sql-interpolation` | 151 | 5 |
| `reliability/unhandled-promise` | 151 | 15 |
| `security/dangerous-html` | 103 | 14 |
| `performance/n-plus-one-query` | 82 | 7 |
| `performance/next-unoptimized-image` | 80 | 7 |
| `database/destructive-migration` | 52 | 2 |
| `performance/heavy-client-import` | 51 | 3 |
| `security/open-redirect` | 49 | 7 |
| `performance/sync-io-in-request-path` | 34 | 5 |
| `security/permissive-cors` | 28 | 5 |
| `ai-cost/missing-llm-timeout` | 26 | 5 |
| `security/sensitive-data-logging` | 25 | 8 |
| `accessibility/img-missing-alt` | 22 | 4 |
| `security/insecure-randomness` | 17 | 6 |
| `database/unbounded-mutation` | 16 | 4 |
| `testing/ci-missing-checks` | 15 | 15 |
| `security/hardcoded-secret` | 13 | 7 |
| `security/weak-crypto` | 13 | 2 |
| `observability/no-error-monitoring` | 12 | 12 |
| `ai-cost/untrusted-prompt-to-tools` | 11 | 1 |
| `observability/console-only-logging` | 11 | 11 |
| `performance/unbounded-query` | 11 | 3 |
| `reliability/hardcoded-environment-url` | 10 | 2 |
| `ai-cost/ai-key-exposed-to-client` | 9 | 1 |
| `observability/silent-catch-in-handler` | 9 | 2 |
| `reliability/missing-health-endpoint` | 8 | 8 |
| `security/disabled-tls-verification` | 7 | 4 |
| `security/eval-usage` | 7 | 3 |
| `accessibility/invalid-anchor` | 6 | 1 |
| `auth/client-side-only-authorization` | 6 | 1 |
| `observability/missing-error-boundary` | 6 | 6 |
| `reliability/retry-without-backoff` | 5 | 5 |
| `database/hardcoded-connection-string` | 4 | 3 |
| `database/prisma-raw-unsafe` | 4 | 2 |
| `security/committed-env-file` | 4 | 3 |
| `testing/no-test-infrastructure` | 4 | 4 |
| `database/supabase-missing-rls` | 3 | 1 |
| `reliability/debug-mode-in-production` | 3 | 3 |
| `security/unsafe-shell-exec` | 3 | 2 |
| `auth/jwt-verification-bypass` | 2 | 1 |
| `auth/missing-auth-middleware` | 2 | 2 |
| `auth/server-action-missing-auth` | 2 | 1 |
| `security/public-env-secret` | 2 | 1 |
| `testing/untested-server-code` | 2 | 2 |
| `reliability/missing-fetch-timeout` | 1 | 1 |
| `testing/focused-test` | 1 | 1 |

