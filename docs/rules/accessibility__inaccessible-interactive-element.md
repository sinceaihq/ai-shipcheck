# `accessibility/inaccessible-interactive-element`

> Interactive element with no accessible name

| | |
| --- | --- |
| **Category** | Accessibility |
| **Severity** | `medium` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `wcag-4.1.2`, `a11y` |

## What this means

A button or link contains only an icon, with no text and no aria-label. Screen readers announce it as "button" with nothing else - the user is told a control exists but not what it does. Voice control users cannot address it by name either.

## How to fix it

Add aria-label describing the action ("Close dialog", "Delete invoice"), or include visually hidden text inside the element. Mark the icon itself aria-hidden="true" so it is not announced separately.

## References

- https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html
- https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html

## Disabling this rule

```json
{
  "rules": {
    "accessibility/inaccessible-interactive-element": "off"
  }
}
```

---

[← All rules](./README.md)
