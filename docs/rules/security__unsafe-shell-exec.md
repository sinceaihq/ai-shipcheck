# `security/unsafe-shell-exec`

> Shell command built from interpolated values

| | |
| --- | --- |
| **Category** | Security |
| **Severity** | `critical` |
| **Confidence** | `medium` |
| **Blocker** | Yes — forces `NOT READY` |
| **Tags** | `injection`, `command-injection`, `owasp-a03` |

## What this means

A shell command is assembled with template interpolation or string concatenation. If any interpolated value reaches this code from a request, a filename, or a third-party API, an attacker can append their own command and run it with the privileges of the server process.

## How to fix it

Use execFile or spawn with an explicit argument array and no shell, so arguments are passed to the process directly instead of being parsed by a shell. Validate any value that determines which binary runs against an allowlist.

## References

- https://owasp.org/Top10/A03_2021-Injection/
- https://nodejs.org/api/child_process.html#child_processexecfilefile-args-options-callback

## Disabling this rule

```json
{
  "rules": {
    "security/unsafe-shell-exec": "off"
  }
}
```

---

[← All rules](./README.md)
