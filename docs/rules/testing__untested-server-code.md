# `testing/untested-server-code`

> Server-side code has no visible test coverage

| | |
| --- | --- |
| **Category** | Testing |
| **Severity** | `medium` |
| **Confidence** | `low` |
| **Blocker** | No |
| **Tags** | `testing`, `coverage` |

## What this means

The project has tests, but none of them appear to reference the route handlers, server actions or server modules. Server code is where authorisation, data writes and payments live: a regression there is silent, expensive, and usually discovered by a user.

## How to fix it

Add integration tests that call each route handler directly with a fake request - assert both the happy path and the unauthenticated case. Testing the 401 is often more valuable than testing the 200.

## Disabling this rule

```json
{
  "rules": {
    "testing/untested-server-code": "off"
  }
}
```

---

[← All rules](./README.md)
