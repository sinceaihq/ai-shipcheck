# `ai-cost/llm-route-without-rate-limit`

> LLM endpoint with neither authentication nor rate limiting

| | |
| --- | --- |
| **Category** | AI Cost & Abuse Controls |
| **Severity** | `critical` |
| **Confidence** | `medium` |
| **Blocker** | Yes — forces `NOT READY` |
| **Tags** | `cost`, `abuse`, `llm` |

## What this means

A route that calls a language model is reachable without authentication and without any rate limit. Every request spends real money on your account. A single script pointed at this endpoint can run up a five-figure bill overnight, and the first signal is usually the invoice.

## How to fix it

Require authentication on the endpoint, then apply a per-user rate limit and a spending cap before the model call. @upstash/ratelimit works well on serverless; express-rate-limit or @fastify/rate-limit for a long-running server. Set a hard budget alert with your model provider as a backstop.

## References

- https://platform.openai.com/docs/guides/rate-limits
- https://owasp.org/www-project-top-10-for-large-language-model-applications/

## Disabling this rule

```json
{
  "rules": {
    "ai-cost/llm-route-without-rate-limit": "off"
  }
}
```

---

[← All rules](./README.md)
