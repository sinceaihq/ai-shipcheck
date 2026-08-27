# `observability/silent-catch-in-handler`

> Request handler catches an error without recording it

| | |
| --- | --- |
| **Category** | Observability |
| **Severity** | `medium` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `error-handling`, `monitoring`, `owasp-a09` |

## What this means

A route handler catches an exception and returns an error response without logging or reporting it. The user sees "something went wrong" and you see nothing at all: there is no signal that the endpoint is failing, no stack trace, and no way to tell one failure from a thousand.

## How to fix it

Log the caught error with enough context to find it again - route, user id, request id - and report it to your monitoring service before returning the response. Return a generic message to the client, but keep the detail server-side.

## References

- https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/

## Disabling this rule

```json
{
  "rules": {
    "observability/silent-catch-in-handler": "off"
  }
}
```

---

[← All rules](./README.md)
