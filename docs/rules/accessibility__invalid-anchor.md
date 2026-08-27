# `accessibility/invalid-anchor`

> Anchor used as a button

| | |
| --- | --- |
| **Category** | Accessibility |
| **Severity** | `medium` |
| **Confidence** | `high` |
| **Blocker** | No |
| **Tags** | `wcag-4.1.2`, `a11y`, `semantics` |

## What this means

An anchor has a placeholder href (or none) and does its work in an onClick handler. Screen readers announce it as a link, so users expect navigation and are told nothing about what will actually happen; middle-click and "open in new tab" do nothing; and with no href it is not even focusable.

## How to fix it

If it performs an action, use a <button type="button">. If it navigates, give it a real href so it behaves like a link for every input method. Anchors are for going places, buttons are for doing things.

## References

- https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a

## Disabling this rule

```json
{
  "rules": {
    "accessibility/invalid-anchor": "off"
  }
}
```

---

[← All rules](./README.md)
