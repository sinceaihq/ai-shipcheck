# `reliability/debug-mode-in-production`

> Build safety checks disabled

| | |
| --- | --- |
| **Category** | Reliability |
| **Severity** | `high` |
| **Confidence** | `high` |
| **Blocker** | No |
| **Tags** | `configuration`, `build` |

## What this means

The build is configured to ignore TypeScript or ESLint errors, or type checking is switched off entirely. This is the single most common way an AI-generated project ships code that never compiled: the failing check is disabled to get a green build, and every error it would have caught reaches production instead.

## How to fix it

Remove ignoreBuildErrors and ignoreDuringBuilds, turn TypeScript strict mode on, and fix the errors that surface. If some are genuinely not worth fixing now, suppress them individually with a comment explaining why, so the check keeps working everywhere else.

## References

- https://nextjs.org/docs/app/api-reference/config/next-config-js/typescript
- https://www.typescriptlang.org/tsconfig/#strict

## Disabling this rule

```json
{
  "rules": {
    "reliability/debug-mode-in-production": "off"
  }
}
```

---

[← All rules](./README.md)
