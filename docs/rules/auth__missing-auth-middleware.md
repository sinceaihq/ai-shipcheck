# `auth/missing-auth-middleware`

> Private area has no route-level authentication gate

| | |
| --- | --- |
| **Category** | Authentication & Authorization |
| **Severity** | `medium` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Requires** | `next` |
| **Tags** | `authorization`, `nextjs` |

## What this means

Pages under a clearly private path prefix are reachable without any authentication gate: there is no middleware matcher covering them, and the pages themselves contain no session check. In Next.js nothing is protected by default, so an unauthenticated visitor renders the page.

## How to fix it

Add a middleware.ts with a matcher covering the private prefixes and redirect unauthenticated requests, or resolve the session in the layout for that segment and redirect there. Middleware alone is not sufficient for data access - keep enforcing authorisation in the route handlers too.

## References

- https://nextjs.org/docs/app/building-your-application/routing/middleware
- https://nextjs.org/docs/app/guides/authentication

## Disabling this rule

```json
{
  "rules": {
    "auth/missing-auth-middleware": "off"
  }
}
```

---

[← All rules](./README.md)
