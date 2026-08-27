# `auth/server-action-missing-auth`

> Server action performs a write with no authorisation check

| | |
| --- | --- |
| **Category** | Authentication & Authorization |
| **Severity** | `high` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Requires** | `next` |
| **Tags** | `authorization`, `server-actions`, `owasp-a01` |

## What this means

Every exported function in a "use server" module becomes a callable HTTP endpoint. Next.js generates an id for it and wires it into the client bundle, so it can be invoked directly with a crafted request - it is not protected by whichever page happens to import it.

## How to fix it

Authenticate inside the action itself, not in the component that calls it. Start each exported action by resolving the session and returning early when there is none, then verify the caller owns the record being changed.

## References

- https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations#authentication-and-authorization

## Disabling this rule

```json
{
  "rules": {
    "auth/server-action-missing-auth": "off"
  }
}
```

---

[← All rules](./README.md)
