# `security/weak-crypto`

> Broken or unsuitable cryptographic primitive

| | |
| --- | --- |
| **Category** | Security |
| **Severity** | `high` |
| **Confidence** | `high` |
| **Blocker** | No |
| **Tags** | `crypto`, `owasp-a02` |

## What this means

MD5 and SHA-1 are broken for any security purpose, and ECB-mode ciphers leak structure from the plaintext. Fast general-purpose hashes are also the wrong tool for passwords: they are designed to be quick, which is exactly what an offline cracking rig wants.

## How to fix it

Use SHA-256 or better for integrity, AES-256-GCM for encryption, and a dedicated password hash - argon2, scrypt or bcrypt - for credentials. Node ships scrypt in the crypto module.

## References

- https://owasp.org/Top10/A02_2021-Cryptographic_Failures/
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

## Disabling this rule

```json
{
  "rules": {
    "security/weak-crypto": "off"
  }
}
```

---

[← All rules](./README.md)
