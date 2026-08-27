# `auth/unscoped-record-access`

> Record fetched by request-supplied id without an ownership check

| | |
| --- | --- |
| **Category** | Authentication & Authorization |
| **Severity** | `high` |
| **Confidence** | `low` |
| **Blocker** | No |
| **Tags** | `idor`, `authorization`, `owasp-a01` |

## What this means

A database lookup uses an identifier taken directly from the request and does not constrain the query to the current user, account or tenant. This is an insecure direct object reference: changing the id in the URL returns somebody else data.

## How to fix it

Add the caller identity to the query itself - where: { id, userId: session.user.id } - so a mismatched id returns nothing rather than another user record. Where the database enforces it, a row-level security policy on the table gives the same guarantee for every query.

## References

- https://owasp.org/Top10/A01_2021-Broken_Access_Control/
- https://cwe.mitre.org/data/definitions/639.html

## Disabling this rule

```json
{
  "rules": {
    "auth/unscoped-record-access": "off"
  }
}
```

---

[← All rules](./README.md)
