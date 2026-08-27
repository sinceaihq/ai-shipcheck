# `performance/n-plus-one-query`

> Database query issued inside a loop

| | |
| --- | --- |
| **Category** | Performance |
| **Severity** | `medium` |
| **Confidence** | `low` |
| **Blocker** | No |
| **Tags** | `queries`, `latency` |

## What this means

A query runs once per iteration of a loop. With ten rows the page is fine; with a thousand it makes a thousand sequential round trips, and total latency becomes the row count multiplied by the network latency to the database. This is the most common reason a page that was fast in development is slow in production.

## How to fix it

Fetch the related rows in one query with an IN clause or a join - findMany({ where: { id: { in: ids } } }) - and match them up in memory. With an ORM, use its include/with syntax so the join happens in the database.

## Disabling this rule

```json
{
  "rules": {
    "performance/n-plus-one-query": "off"
  }
}
```

---

[← All rules](./README.md)
