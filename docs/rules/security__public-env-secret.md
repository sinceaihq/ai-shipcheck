# `security/public-env-secret`

> Secret exposed through a browser-visible environment variable

| | |
| --- | --- |
| **Category** | Security |
| **Severity** | `critical` |
| **Confidence** | `high` |
| **Blocker** | Yes — forces `NOT READY` |
| **Tags** | `secrets`, `client-exposure` |

## What this means

Environment variables prefixed NEXT_PUBLIC_, VITE_, REACT_APP_ and similar are inlined into the JavaScript bundle at build time. Anyone who opens devtools can read them. A name in that namespace that refers to a secret, private key or service-role credential is published to every visitor.

## How to fix it

Drop the public prefix and read the variable only in server code (a route handler, server action, or API route). If the browser genuinely needs the capability, proxy it through a server endpoint that holds the credential. Rotate the exposed value.

## References

- https://nextjs.org/docs/app/guides/environment-variables
- https://vite.dev/guide/env-and-mode

## Disabling this rule

```json
{
  "rules": {
    "security/public-env-secret": "off"
  }
}
```

---

[← All rules](./README.md)
