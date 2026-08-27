# `auth/unprotected-route-handler`

> State-changing API route with no authorisation check

| | |
| --- | --- |
| **Category** | Authentication & Authorization |
| **Severity** | `high` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `authorization`, `owasp-a01` |

## What this means

A route handler that writes data exposes no evidence of an authentication or authorisation check. Route files in both Next.js routers are public by default - there is no implicit gate - so anyone who can reach the URL can invoke the write.

## How to fix it

Resolve the caller at the top of the handler and return 401 when there is none, then check that the caller is allowed to act on the specific record before writing. Shared helpers (requireUser, protectedProcedure, middleware matchers) make this consistent across routes.

## References

- https://owasp.org/Top10/A01_2021-Broken_Access_Control/
- https://nextjs.org/docs/app/building-your-application/routing/route-handlers

## Disabling this rule

```json
{
  "rules": {
    "auth/unprotected-route-handler": "off"
  }
}
```

---

[← All rules](./README.md)
