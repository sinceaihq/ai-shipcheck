# `security/disabled-tls-verification`

> TLS certificate verification disabled

| | |
| --- | --- |
| **Category** | Security |
| **Severity** | `critical` |
| **Confidence** | `high` |
| **Blocker** | Yes — forces `NOT READY` |
| **Tags** | `tls`, `owasp-a02` |

## What this means

Turning off certificate verification makes every outbound HTTPS request accept any certificate, including one presented by an attacker on the network path. The connection is still encrypted, but to whoever is in the middle - which is strictly worse than plain HTTP, because it looks secure.

## How to fix it

Remove the override. If you need to trust a private certificate authority, add its certificate with NODE_EXTRA_CA_CERTS or pass a ca option, rather than disabling verification for every host.

## References

- https://nodejs.org/api/cli.html#node_tls_reject_unauthorizedvalue
- https://cwe.mitre.org/data/definitions/295.html

## Disabling this rule

```json
{
  "rules": {
    "security/disabled-tls-verification": "off"
  }
}
```

---

[← All rules](./README.md)
