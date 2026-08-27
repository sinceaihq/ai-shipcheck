# `testing/ci-missing-checks`

> CI pipeline is missing a core check

| | |
| --- | --- |
| **Category** | Testing |
| **Severity** | `medium` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `ci`, `testing` |

## What this means

A continuous integration workflow exists but does not run one or more of the checks that would catch a broken change before it merges. A pipeline that only lints gives the reassuring appearance of automated verification without any of the substance.

## How to fix it

Add the missing steps to the workflow so tests, the production build and type checking all run on pull requests, and make them required for merge.

## References

- https://docs.github.com/en/actions/writing-workflows/quickstart

## Disabling this rule

```json
{
  "rules": {
    "testing/ci-missing-checks": "off"
  }
}
```

---

[← All rules](./README.md)
