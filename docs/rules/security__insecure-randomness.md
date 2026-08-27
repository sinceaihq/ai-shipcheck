# `security/insecure-randomness`

> Security value generated with Math.random()

| | |
| --- | --- |
| **Category** | Security |
| **Severity** | `high` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `crypto`, `owasp-a02` |

## What this means

Math.random() is a fast, seeded pseudo-random generator with no cryptographic guarantees. Its output is predictable from previous values, so tokens, password-reset codes, session identifiers and nonces built from it can be guessed.

## How to fix it

Use crypto.randomUUID() for identifiers and crypto.randomBytes(32).toString("hex") for tokens - both are available in Node without a dependency, and crypto.getRandomValues() is the browser equivalent.

## References

- https://nodejs.org/api/crypto.html#cryptorandomuuidoptions
- https://cwe.mitre.org/data/definitions/338.html

## Disabling this rule

```json
{
  "rules": {
    "security/insecure-randomness": "off"
  }
}
```

---

[← All rules](./README.md)
