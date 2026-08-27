# `reliability/process-exit-in-request-path`

> process.exit() inside a request handler

| | |
| --- | --- |
| **Category** | Reliability |
| **Severity** | `high` |
| **Confidence** | `high` |
| **Blocker** | No |
| **Tags** | `availability` |

## What this means

Calling process.exit() from code that serves requests kills the process immediately: in-flight requests are dropped without a response, buffered logs are lost, and open database transactions are abandoned. On a serverless platform it also poisons the warm instance for every concurrent invocation.

## How to fix it

Return an error response instead. Reserve process.exit for CLI entry points and startup validation, and even there prefer setting process.exitCode and letting the event loop drain so logs flush.

## Disabling this rule

```json
{
  "rules": {
    "reliability/process-exit-in-request-path": "off"
  }
}
```

---

[← All rules](./README.md)
