# `ai-cost/user-controlled-model`

> Model identifier taken from the request

| | |
| --- | --- |
| **Category** | AI Cost & Abuse Controls |
| **Severity** | `high` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `cost`, `abuse`, `llm` |

## What this means

The model name is read from the request body or query without being checked against an allowlist. Model pricing varies by more than an order of magnitude, so a caller who changes one string in a JSON body can multiply the cost of every request they make - and can also opt into models you have not evaluated for safety or data handling.

## How to fix it

Map a small set of product-level choices ("fast", "quality") onto concrete model ids server-side, or validate the incoming value against an explicit allowlist and reject anything else. Never pass a request-supplied string straight through as the model id.

## References

- https://owasp.org/www-project-top-10-for-large-language-model-applications/

## Disabling this rule

```json
{
  "rules": {
    "ai-cost/user-controlled-model": "off"
  }
}
```

---

[← All rules](./README.md)
