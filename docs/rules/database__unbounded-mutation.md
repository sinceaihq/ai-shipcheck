# `database/unbounded-mutation`

> Destructive query with no filter

| | |
| --- | --- |
| **Category** | Database & Data Safety |
| **Severity** | `critical` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `data-loss` |

## What this means

A delete or update is issued without a filter, so it applies to every row in the table. In Supabase this is a particularly common mistake because the query builder happily executes .from("table").delete() with no .eq() attached.

## How to fix it

Always attach a filter that scopes the mutation - .eq("id", id) or where: { id } at minimum, and ideally a caller-ownership predicate as well. If a full-table operation is genuinely intended, isolate it in a maintenance script rather than application code.

## Disabling this rule

```json
{
  "rules": {
    "database/unbounded-mutation": "off"
  }
}
```

---

[← All rules](./README.md)
