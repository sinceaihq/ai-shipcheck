# `security/unsafe-url-construction`

> Outbound request URL host built from request data

| | |
| --- | --- |
| **Category** | Security |
| **Severity** | `high` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `ssrf`, `owasp-a10` |

## What this means

The host portion of an outbound request URL is interpolated from a value that originates in the incoming request. This is server-side request forgery: an attacker chooses which host your server connects to, and can reach cloud metadata endpoints, internal admin panels and services behind your firewall.

## How to fix it

Never let request data determine the host. Keep the base URL in configuration and interpolate only the path, then validate that path. If arbitrary destinations are a product requirement, resolve the URL, check the resulting hostname against an allowlist, and block private and link-local address ranges.

## References

- https://owasp.org/Top10/A10_2021-Server-Side_Request_Forgery_%28SSRF%29/
- https://cwe.mitre.org/data/definitions/918.html

## Disabling this rule

```json
{
  "rules": {
    "security/unsafe-url-construction": "off"
  }
}
```

---

[← All rules](./README.md)
