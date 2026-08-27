# `database/destructive-migration`

> Migration destroys data without a guard

| | |
| --- | --- |
| **Category** | Database & Data Safety |
| **Severity** | `high` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `migrations`, `data-loss` |

## What this means

A migration drops a table, column or schema, or truncates data. Migrations run automatically on deploy in most hosting setups, so a destructive statement that reaches production is irreversible without a restore - and the deploy that runs it is usually not the one being watched closely.

## How to fix it

Split destructive changes into their own migration, deploy it separately from application changes, and confirm a backup exists first. For column removal, use the expand/contract pattern: stop writing the column, deploy, then drop it in a later migration once nothing reads it.

## Disabling this rule

```json
{
  "rules": {
    "database/destructive-migration": "off"
  }
}
```

---

[← All rules](./README.md)
