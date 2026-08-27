# `testing/no-test-infrastructure`

> Project has no tests

| | |
| --- | --- |
| **Category** | Testing |
| **Severity** | `high` |
| **Confidence** | `high` |
| **Blocker** | No |
| **Tags** | `testing` |

## What this means

No test files and no test runner were found. Without tests there is no way to tell whether a change breaks existing behaviour, which matters most in a codebase where large amounts of code were generated quickly and never read line by line.

## How to fix it

Add a test runner (vitest is the least-configuration option for a modern TypeScript project) and start with the paths where a bug is most expensive: authentication, payment, and anything that writes to the database. A handful of real tests on those paths is worth more than broad coverage elsewhere.

## Disabling this rule

```json
{
  "rules": {
    "testing/no-test-infrastructure": "off"
  }
}
```

---

[← All rules](./README.md)
