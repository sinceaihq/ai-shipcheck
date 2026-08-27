# `performance/sync-io-in-request-path`

> Synchronous I/O in a request handler

| | |
| --- | --- |
| **Category** | Performance |
| **Severity** | `high` |
| **Confidence** | `high` |
| **Blocker** | No |
| **Tags** | `event-loop`, `latency` |

## What this means

Node runs JavaScript on a single thread. A synchronous filesystem read, a synchronous hash or a synchronous child process blocks that thread completely: every other request being served by the same instance waits, including health checks. Latency degrades for everyone, not just the caller who triggered it.

## How to fix it

Use the promise-based equivalents - fs/promises, crypto.scrypt with a callback, bcrypt.hash - so the event loop stays free. For values that never change, read them once at module load rather than per request.

## References

- https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop

## Disabling this rule

```json
{
  "rules": {
    "performance/sync-io-in-request-path": "off"
  }
}
```

---

[← All rules](./README.md)
