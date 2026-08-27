# `ai-cost/ai-key-exposed-to-client`

> Model provider API key reachable from the browser

| | |
| --- | --- |
| **Category** | AI Cost & Abuse Controls |
| **Severity** | `critical` |
| **Confidence** | `high` |
| **Blocker** | Yes — forces `NOT READY` |
| **Tags** | `cost`, `secrets`, `llm` |

## What this means

A model provider key is exposed to client-side code, either through a public environment prefix or by constructing the SDK client with dangerouslyAllowBrowser. Provider keys are account-level credentials with no per-key spending limit by default: anyone who reads it from the bundle can spend your entire budget and access every model on the account.

## How to fix it

Keep the key on the server and call the provider from a route handler that the browser talks to instead. Remove dangerouslyAllowBrowser, drop the public prefix from the variable name, and rotate the key - assume it is compromised the moment it reaches a bundle.

## References

- https://platform.openai.com/docs/guides/production-best-practices
- https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety

## Disabling this rule

```json
{
  "rules": {
    "ai-cost/ai-key-exposed-to-client": "off"
  }
}
```

---

[← All rules](./README.md)
