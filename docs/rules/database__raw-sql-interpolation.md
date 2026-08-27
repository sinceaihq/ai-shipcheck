# `database/raw-sql-interpolation`

> SQL query built by string interpolation

| | |
| --- | --- |
| **Category** | Database & Data Safety |
| **Severity** | `critical` |
| **Confidence** | `medium` |
| **Blocker** | Yes — forces `NOT READY` |
| **Tags** | `sql-injection`, `owasp-a03` |

## What this means

A SQL statement is assembled by interpolating values into a string. If any interpolated value can be influenced by a request, the caller controls the query - they can read other tables, drop data, or return every row regardless of the intended filter.

## How to fix it

Use parameter placeholders and pass values separately: prisma.$queryRaw`SELECT * FROM users WHERE id = ${id}` (a tagged template, which parameterises), db.query("SELECT * FROM users WHERE id = $1", [id]), or the query builder your ORM provides. Never build the WHERE clause with template interpolation.

## References

- https://owasp.org/Top10/A03_2021-Injection/
- https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html

## Disabling this rule

```json
{
  "rules": {
    "database/raw-sql-interpolation": "off"
  }
}
```

---

[← All rules](./README.md)
