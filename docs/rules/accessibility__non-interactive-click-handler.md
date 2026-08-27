# `accessibility/non-interactive-click-handler`

> Click handler on a non-interactive element

| | |
| --- | --- |
| **Category** | Accessibility |
| **Severity** | `medium` |
| **Confidence** | `high` |
| **Blocker** | No |
| **Tags** | `wcag-2.1.1`, `a11y`, `keyboard` |

## What this means

A div or span has an onClick handler but no keyboard support. It cannot be reached with Tab, it does not respond to Enter or Space, and a screen reader announces nothing that suggests it can be activated - so the feature simply does not exist for anyone not using a mouse.

## How to fix it

Use a <button> - it is focusable, keyboard-activated and announced correctly with no extra work, and can be styled to look like anything. If the element must stay a div, add role="button", tabIndex={0} and an onKeyDown handler for Enter and Space.

## References

- https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html
- https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/button_role

## Disabling this rule

```json
{
  "rules": {
    "accessibility/non-interactive-click-handler": "off"
  }
}
```

---

[← All rules](./README.md)
