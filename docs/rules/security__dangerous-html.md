# `security/dangerous-html`

> Raw HTML injected without sanitisation

| | |
| --- | --- |
| **Category** | Security |
| **Severity** | `high` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `xss`, `owasp-a03` |

## What this means

Assigning unsanitised HTML through dangerouslySetInnerHTML, innerHTML, outerHTML or document.write turns any attacker-influenced string into executable script in the visitor browser. This is the classic cross-site scripting sink.

## How to fix it

Render text as text - React escapes it automatically. When HTML really is required, sanitise it first with a maintained sanitiser such as DOMPurify, and restrict the allowed tags and attributes.

## References

- https://owasp.org/www-community/attacks/xss/
- https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html

## Disabling this rule

```json
{
  "rules": {
    "security/dangerous-html": "off"
  }
}
```

---

[← All rules](./README.md)
