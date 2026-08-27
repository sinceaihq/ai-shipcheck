# `accessibility/form-control-missing-label`

> Form control with no accessible label

| | |
| --- | --- |
| **Category** | Accessibility |
| **Severity** | `medium` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `wcag-3.3.2`, `a11y`, `forms` |

## What this means

A form field has no associated label, aria-label or aria-labelledby. A screen reader announces it as "edit text, blank" with no indication of what belongs in it. Placeholder text does not substitute: it disappears the moment the user starts typing, and is not reliably announced.

## How to fix it

Associate a <label htmlFor="fieldId"> with the control, or add aria-label when a visible label genuinely does not fit the design. Keep the placeholder as an example of the format, not as the field name.

## References

- https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/label

## Disabling this rule

```json
{
  "rules": {
    "accessibility/form-control-missing-label": "off"
  }
}
```

---

[← All rules](./README.md)
