# `auth/jwt-verification-bypass`

> JWT accepted without verifying its signature

| | |
| --- | --- |
| **Category** | Authentication & Authorization |
| **Severity** | `critical` |
| **Confidence** | `high` |
| **Blocker** | Yes — forces `NOT READY` |
| **Tags** | `jwt`, `authorization`, `owasp-a07` |

## What this means

Decoding a JWT only parses base64; it does not check the signature. A token whose payload is read with decode() can be forged by anyone - change the "sub" or "role" claim, re-encode, and the server accepts it. Allowing the "none" algorithm or ignoring expiry has the same effect.

## How to fix it

Verify with the signing key and an explicit algorithm allowlist - jwt.verify(token, key, { algorithms: ["RS256"] }) or jose.jwtVerify - and let expiry checks run. Use decode() only for values you have already verified.

## References

- https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html
- https://cwe.mitre.org/data/definitions/347.html

## Disabling this rule

```json
{
  "rules": {
    "auth/jwt-verification-bypass": "off"
  }
}
```

---

[← All rules](./README.md)
