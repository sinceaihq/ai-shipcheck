# `testing/focused-or-skipped-test`

> Focused or skipped test committed

| | |
| --- | --- |
| **Category** | Testing |
| **Severity** | `high` |
| **Confidence** | `high` |
| **Blocker** | No |
| **Tags** | `testing`, `ci` |

## What this means

A .only() test silently disables every other test in its file - the suite still reports success, having run one assertion. A .skip() leaves a test that looks like coverage in the file listing but never executes.

## How to fix it

Remove .only before committing and add a lint rule that fails on it. For a skipped test, either fix it or delete it and open an issue; a permanently skipped test is documentation that has stopped being true.

## Disabling this rule

```json
{
  "rules": {
    "testing/focused-or-skipped-test": "off"
  }
}
```

---

[← All rules](./README.md)
