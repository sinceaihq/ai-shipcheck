# `accessibility/missing-html-lang`

> Root <html> element has no lang attribute

| | |
| --- | --- |
| **Category** | Accessibility |
| **Severity** | `low` |
| **Confidence** | `high` |
| **Blocker** | No |
| **Requires** | `next` |
| **Tags** | `wcag-3.1.1`, `a11y` |

## What this means

Without a lang attribute, screen readers guess the document language - usually from the user system settings - and read the page with the wrong pronunciation rules. It also affects automatic translation, hyphenation and font selection.

## How to fix it

Set lang on the root html element in your layout: <html lang="en">. For a localised app, drive the value from the active locale.

## References

- https://www.w3.org/WAI/WCAG22/Understanding/language-of-page.html

## Disabling this rule

```json
{
  "rules": {
    "accessibility/missing-html-lang": "off"
  }
}
```

---

[← All rules](./README.md)
