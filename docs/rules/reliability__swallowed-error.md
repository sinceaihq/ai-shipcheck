# `reliability/swallowed-error`

> Error caught and discarded

| | |
| --- | --- |
| **Category** | Reliability |
| **Severity** | `medium` |
| **Confidence** | `high` |
| **Blocker** | No |
| **Tags** | `error-handling` |

## What this means

A catch block does nothing with the error. The failure still happened - a write did not land, a payment did not go through - but there is no log, no metric and no rethrow, so the system reports success and the problem surfaces later as inconsistent data with no trace of the cause.

## How to fix it

Do one of three things in every catch: rethrow, handle the failure explicitly (return a fallback and log it), or record it. If the error genuinely is expected and safe to ignore, say so in a comment naming the case - a bare empty block is indistinguishable from an oversight.

## References

- https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/

## Disabling this rule

```json
{
  "rules": {
    "reliability/swallowed-error": "off"
  }
}
```

---

[← All rules](./README.md)
