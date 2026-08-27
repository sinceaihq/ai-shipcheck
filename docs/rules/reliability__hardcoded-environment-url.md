# `reliability/hardcoded-environment-url`

> Localhost URL hardcoded in application code

| | |
| --- | --- |
| **Category** | Reliability |
| **Severity** | `medium` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `configuration` |

## What this means

A localhost URL is written directly into application code with no environment fallback. It works on the machine it was written on and fails in every deployed environment - usually as a connection refused error at the moment a user tries the feature, not at startup.

## How to fix it

Read the base URL from an environment variable and use the localhost value only as an explicit development default: process.env.API_URL ?? "http://localhost:3000". Validate required URLs at startup so a missing value fails the deploy instead of the request.

## References

- https://12factor.net/config

## Disabling this rule

```json
{
  "rules": {
    "reliability/hardcoded-environment-url": "off"
  }
}
```

---

[← All rules](./README.md)
