# `security/open-redirect`

> Redirect target taken from the request without validation

| | |
| --- | --- |
| **Category** | Security |
| **Severity** | `high` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `redirect`, `owasp-a01` |

## What this means

A redirect destination is read from the request (a query parameter, body field or route param) and used without checking it. Attackers use open redirects to make phishing links look like they point at your domain, and to bounce OAuth callbacks to a host they control.

## How to fix it

Only redirect to paths you control. Require the target to start with a single "/" and reject protocol-relative values ("//evil.com"), or resolve it against your own origin with new URL(target, siteOrigin) and confirm the resulting origin matches.

## References

- https://owasp.org/www-community/attacks/Unvalidated_Redirects_and_Forwards_Cheat_Sheet
- https://cwe.mitre.org/data/definitions/601.html

## Disabling this rule

```json
{
  "rules": {
    "security/open-redirect": "off"
  }
}
```

---

[← All rules](./README.md)
