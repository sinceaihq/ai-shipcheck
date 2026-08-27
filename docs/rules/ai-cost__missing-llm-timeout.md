# `ai-cost/missing-llm-timeout`

> Model call with no timeout

| | |
| --- | --- |
| **Category** | AI Cost & Abuse Controls |
| **Severity** | `medium` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `cost`, `timeouts`, `llm` |

## What this means

A model call has no timeout configured. Generation latency is highly variable and provider incidents routinely manifest as requests that hang rather than fail. Each hung call holds a server connection open, and on a serverless platform it bills until the function times out.

## How to fix it

Set an explicit timeout on the client (new OpenAI({ timeout: 30_000 }) or an AbortSignal on the request) and bound retries. Stream responses where the UI allows it, so a slow generation shows progress instead of blocking.

## References

- https://platform.openai.com/docs/guides/production-best-practices

## Disabling this rule

```json
{
  "rules": {
    "ai-cost/missing-llm-timeout": "off"
  }
}
```

---

[← All rules](./README.md)
