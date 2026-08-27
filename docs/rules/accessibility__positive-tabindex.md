# `accessibility/positive-tabindex`

> Positive tabIndex disrupts focus order

| | |
| --- | --- |
| **Category** | Accessibility |
| **Severity** | `low` |
| **Confidence** | `high` |
| **Blocker** | No |
| **Tags** | `wcag-2.4.3`, `a11y`, `keyboard` |

## What this means

A tabIndex greater than zero pulls the element to the front of the tab sequence, ahead of everything in document order. One such element reorders the whole page for keyboard users, and the effect compounds as more are added - the resulting order rarely matches what anyone expects.

## How to fix it

Use tabIndex={0} to make an element focusable in its natural position, and tabIndex={-1} to make it focusable only programmatically. If the tab order is wrong, fix the order of the markup instead.

## References

- https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/tabindex

## Disabling this rule

```json
{
  "rules": {
    "accessibility/positive-tabindex": "off"
  }
}
```

---

[← All rules](./README.md)
