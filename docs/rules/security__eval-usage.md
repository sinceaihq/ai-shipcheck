# `security/eval-usage`

> Dynamic code execution

| | |
| --- | --- |
| **Category** | Security |
| **Severity** | `high` |
| **Confidence** | `high` |
| **Blocker** | No |
| **Tags** | `injection`, `owasp-a03` |

## What this means

eval, new Function, string-bodied timers and the vm module compile strings into executable code. If any part of the string can be influenced by input, the process is fully compromised; even when it cannot, these constructs defeat bundler analysis and Content-Security-Policy.

## How to fix it

Replace dynamic evaluation with an explicit implementation: JSON.parse for data, a lookup table or switch for dispatch, and a real expression parser if user-supplied formulas are a product requirement.

## References

- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval#never_use_eval
- https://owasp.org/Top10/A03_2021-Injection/

## Disabling this rule

```json
{
  "rules": {
    "security/eval-usage": "off"
  }
}
```

---

[← All rules](./README.md)
