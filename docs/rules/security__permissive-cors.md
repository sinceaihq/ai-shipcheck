# `security/permissive-cors`

> Permissive CORS configuration

| | |
| --- | --- |
| **Category** | Security |
| **Severity** | `high` |
| **Confidence** | `high` |
| **Blocker** | No |
| **Tags** | `cors`, `owasp-a05` |

## What this means

The API accepts cross-origin requests from any origin. On its own that exposes every unauthenticated endpoint to any website; combined with credentialed requests it lets any site read authenticated responses on behalf of a logged-in visitor.

## How to fix it

Replace the wildcard with an explicit allowlist of origins you control, read from configuration. If credentials are needed, the origin must be a single concrete value - the CORS specification forbids "*" with credentials, and reflecting the request Origin header back is equivalent to allowing everything.

## References

- https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS
- https://portswigger.net/web-security/cors

## Disabling this rule

```json
{
  "rules": {
    "security/permissive-cors": "off"
  }
}
```

---

[← All rules](./README.md)
