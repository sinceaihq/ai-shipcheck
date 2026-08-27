# `observability/missing-error-boundary`

> No React error boundary

| | |
| --- | --- |
| **Category** | Observability |
| **Severity** | `medium` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Requires** | `react`, `next` |
| **Tags** | `error-handling`, `react` |

## What this means

An uncaught render error in React unmounts the entire component tree - the user gets a blank white page with no explanation and no way back. An error boundary catches it, shows a recoverable UI, and gives you somewhere to report the error from.

## How to fix it

In the Next.js App Router, add an error.tsx to each route segment (and a global-error.tsx at the root). Elsewhere, wrap the app in an error boundary component and report the caught error to your monitoring service from its handler.

## References

- https://nextjs.org/docs/app/building-your-application/routing/error-handling
- https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary

## Disabling this rule

```json
{
  "rules": {
    "observability/missing-error-boundary": "off"
  }
}
```

---

[← All rules](./README.md)
