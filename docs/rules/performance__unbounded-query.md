# `performance/unbounded-query`

> Query returns every row with no limit

| | |
| --- | --- |
| **Category** | Performance |
| **Severity** | `medium` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `queries`, `scalability` |

## What this means

A query fetches an entire table with no limit or pagination. It is fast with the fifty rows in development and it is an out-of-memory crash with the two million rows in production - and the failure arrives suddenly, on a table that had been fine for months.

## How to fix it

Add a limit to every list query and paginate the results - cursor pagination for infinite scroll, offset pagination for numbered pages. Select only the columns you render rather than the whole row.

## Disabling this rule

```json
{
  "rules": {
    "performance/unbounded-query": "off"
  }
}
```

---

[← All rules](./README.md)
