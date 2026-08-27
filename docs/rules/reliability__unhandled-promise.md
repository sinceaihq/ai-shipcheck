# `reliability/unhandled-promise`

> Promise chain with no rejection handler

| | |
| --- | --- |
| **Category** | Reliability |
| **Severity** | `medium` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `error-handling`, `resilience` |

## What this means

A .then() chain has no .catch(). An unhandled rejection terminates the Node process by default since Node 15, so a single transient failure in a background task can take the whole server down - and the stack trace points at the promise, not at what called it.

## How to fix it

Attach a .catch() that logs and recovers, or await the promise inside a try/catch. For fire-and-forget work, make the "ignore failures" decision explicit with .catch(err => logger.warn(...)) rather than leaving it implicit.

## References

- https://nodejs.org/api/cli.html#--unhandled-rejectionsmode

## Disabling this rule

```json
{
  "rules": {
    "reliability/unhandled-promise": "off"
  }
}
```

---

[← All rules](./README.md)
