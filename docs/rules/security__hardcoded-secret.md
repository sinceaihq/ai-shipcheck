# `security/hardcoded-secret`

> Hardcoded credential in source

| | |
| --- | --- |
| **Category** | Security |
| **Severity** | `critical` |
| **Confidence** | `high` |
| **Blocker** | Yes — forces `NOT READY` |
| **Tags** | `secrets`, `owasp-a05` |

## What this means

A credential appears to be written directly into source code. Anything committed to a repository must be treated as public: it is in the git history forever, it is copied into every clone, and it is readable by every CI job and every contributor.

## How to fix it

Move the value into an environment variable, read it with process.env at runtime, and rotate the exposed credential immediately - removing the line is not enough once it has been committed.

## References

- https://owasp.org/Top10/A05_2021-Security_Misconfiguration/
- https://docs.github.com/en/code-security/secret-scanning

## Disabling this rule

```json
{
  "rules": {
    "security/hardcoded-secret": "off"
  }
}
```

---

[← All rules](./README.md)
