# `testing/focused-test`

> Focused test committed

| | |
| --- | --- |
| **Category** | Testing |
| **Severity** | `high` |
| **Confidence** | `high` |
| **Blocker** | No |
| **Tags** | `testing`, `ci` |

## What this means

A .only() test silently disables every other test in its file. The suite still reports success, having run a single assertion - which is worse than a failing build, because nothing looks wrong.

## How to fix it

Remove .only before committing, and add an ESLint rule (no-only-tests) or a grep in CI so it cannot happen again.

## Disabling this rule

```json
{
  "rules": {
    "testing/focused-test": "off"
  }
}
```

---

[← All rules](./README.md)
