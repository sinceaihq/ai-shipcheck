# `reliability/missing-fetch-timeout`

> Outbound request with no timeout

| | |
| --- | --- |
| **Category** | Reliability |
| **Severity** | `medium` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `timeouts`, `resilience` |

## What this means

fetch has no default timeout in Node. A dependency that stops responding - rather than failing - holds the request open indefinitely, and every inbound request waiting on it holds a connection too. This is how a slow third party turns into a full outage.

## How to fix it

Pass a signal: AbortSignal.timeout(5000) to every outbound fetch, or wrap calls in a small helper that applies a default. Pair it with a retry budget so a slow dependency degrades instead of cascading.

## References

- https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static

## Disabling this rule

```json
{
  "rules": {
    "reliability/missing-fetch-timeout": "off"
  }
}
```

---

[← All rules](./README.md)
