# `auth/client-side-only-authorization`

> Authorisation decision made only in the browser

| | |
| --- | --- |
| **Category** | Authentication & Authorization |
| **Severity** | `high` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `authorization`, `owasp-a01` |

## What this means

A privilege check runs in client-side code. Hiding an admin button stops an honest user from clicking it, but the bundle, the API calls it makes and the responses are all fully visible and editable in devtools. If the same check is not repeated on the server, the capability is effectively public.

## How to fix it

Treat the client check as a UX affordance only. Enforce the same rule in the route handler, server action or database policy that performs the privileged operation, and return 403 there.

## References

- https://owasp.org/Top10/A01_2021-Broken_Access_Control/

## Disabling this rule

```json
{
  "rules": {
    "auth/client-side-only-authorization": "off"
  }
}
```

---

[← All rules](./README.md)
