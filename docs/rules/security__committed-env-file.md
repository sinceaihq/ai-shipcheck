# `security/committed-env-file`

> Environment file is not excluded from version control

| | |
| --- | --- |
| **Category** | Security |
| **Severity** | `high` |
| **Confidence** | `high` |
| **Blocker** | No |
| **Tags** | `secrets`, `configuration` |

## What this means

A .env file with real-looking values is present in the working tree and is not matched by .gitignore. Environment files hold database URLs, API keys and signing secrets; once committed they are in the history of every clone and every CI checkout.

## How to fix it

Add .env and .env.*.local to .gitignore, remove the file from tracking with "git rm --cached .env", keep a committed .env.example containing only placeholder values, and rotate anything that was exposed.

## References

- https://12factor.net/config

## Disabling this rule

```json
{
  "rules": {
    "security/committed-env-file": "off"
  }
}
```

---

[← All rules](./README.md)
