# `security/sensitive-data-logging`

> Credential or personal data written to logs

| | |
| --- | --- |
| **Category** | Security |
| **Severity** | `high` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `logging`, `secrets`, `owasp-a09` |

## What this means

Logging a password, token, request header set or the whole environment copies secrets into a place they were never meant to be: log aggregators, third-party monitoring vendors, terminal scrollback and support tickets. Log retention typically outlives credential rotation.

## How to fix it

Log an identifier instead of the value - a user id rather than a session token, a request id rather than the header block. If a structured logger is in use, configure a redaction list for these fields.

## References

- https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/

## Disabling this rule

```json
{
  "rules": {
    "security/sensitive-data-logging": "off"
  }
}
```

---

[← All rules](./README.md)
