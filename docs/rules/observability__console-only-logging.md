# `observability/console-only-logging`

> Server logging goes only through console

| | |
| --- | --- |
| **Category** | Observability |
| **Severity** | `medium` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `logging`, `monitoring` |

## What this means

Server code logs exclusively with console. Unstructured text lines cannot be filtered by request id, severity or user, they carry no timestamps beyond what the platform adds, and they cannot be sampled or redacted. When something breaks at 3am, the difference between structured and unstructured logs is the difference between a query and a grep.

## How to fix it

Add a structured logger (pino is fast and has no runtime dependencies) and log JSON objects with a consistent shape: level, message, request id, user id. Configure a redaction list so credentials never reach the log stream.

## References

- https://12factor.net/logs

## Disabling this rule

```json
{
  "rules": {
    "observability/console-only-logging": "off"
  }
}
```

---

[← All rules](./README.md)
