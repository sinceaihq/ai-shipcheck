# `database/hardcoded-connection-string`

> Database connection string with inline credentials

| | |
| --- | --- |
| **Category** | Database & Data Safety |
| **Severity** | `critical` |
| **Confidence** | `high` |
| **Blocker** | Yes — forces `NOT READY` |
| **Tags** | `secrets`, `database` |

## What this means

A connection string containing a username and password is written into a tracked file. Database URLs are the highest-value credential in most applications - they usually grant full read and write access to production data with no second factor.

## How to fix it

Read the connection string from an environment variable, keep the real value in your hosting provider secret store, and rotate the exposed password. Local development defaults belong in .env.example with placeholder credentials.

## Disabling this rule

```json
{
  "rules": {
    "database/hardcoded-connection-string": "off"
  }
}
```

---

[← All rules](./README.md)
