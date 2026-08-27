# `database/prisma-raw-unsafe`

> Prisma raw query executed without parameterisation

| | |
| --- | --- |
| **Category** | Database & Data Safety |
| **Severity** | `high` |
| **Confidence** | `high` |
| **Blocker** | No |
| **Requires** | `prisma` |
| **Tags** | `sql-injection`, `prisma`, `owasp-a03` |

## What this means

The Unsafe variants of Prisma raw query helpers take a plain string and send it to the database verbatim. They exist for the rare case where the statement structure itself is dynamic, and they carry no injection protection whatsoever.

## How to fix it

Use the tagged-template forms - prisma.$queryRaw`SELECT ... WHERE id = ${id}` - which parameterise every interpolation. If the table or column name genuinely must be dynamic, validate it against a fixed allowlist before building the string.

## References

- https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries

## Disabling this rule

```json
{
  "rules": {
    "database/prisma-raw-unsafe": "off"
  }
}
```

---

[← All rules](./README.md)
