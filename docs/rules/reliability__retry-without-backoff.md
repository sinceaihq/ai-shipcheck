# `reliability/retry-without-backoff`

> Retry loop with no delay between attempts

| | |
| --- | --- |
| **Category** | Reliability |
| **Severity** | `medium` |
| **Confidence** | `low` |
| **Blocker** | No |
| **Tags** | `resilience`, `retries` |

## What this means

A loop retries a network call with no delay. When the dependency is failing because it is overloaded, retrying immediately multiplies the load at exactly the wrong moment - the classic retry storm that turns a brief blip into a sustained outage.

## How to fix it

Add exponential backoff with jitter between attempts and cap the total number of retries. Only retry idempotent operations, and give up quickly on 4xx responses, which will not succeed on a second attempt.

## References

- https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/

## Disabling this rule

```json
{
  "rules": {
    "reliability/retry-without-backoff": "off"
  }
}
```

---

[← All rules](./README.md)
