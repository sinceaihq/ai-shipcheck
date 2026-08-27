# `security/exposed-debug-route`

> Debug or maintenance route exposed in production

| | |
| --- | --- |
| **Category** | Security |
| **Severity** | `high` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `exposure`, `owasp-a01` |

## What this means

A route whose path identifies it as a debug, seed, reset or internal endpoint has no authentication check and no environment guard. These endpoints are written for local convenience and routinely dump configuration, reset data or bypass business logic.

## How to fix it

Delete the route before deploying, or guard it with both an authentication check and an explicit environment check that returns 404 outside development.

## Disabling this rule

```json
{
  "rules": {
    "security/exposed-debug-route": "off"
  }
}
```

---

[← All rules](./README.md)
