# `accessibility/img-missing-alt`

> Image without an alt attribute

| | |
| --- | --- |
| **Category** | Accessibility |
| **Severity** | `medium` |
| **Confidence** | `high` |
| **Blocker** | No |
| **Tags** | `wcag-1.1.1`, `a11y` |

## What this means

An image has no alt attribute. Screen readers fall back to announcing the file name, which is noise at best and confusing at worst. Alt text is also what is shown when the image fails to load, and what search engines read.

## How to fix it

Add alt text describing what the image conveys in context. For a decorative image that adds nothing a caption does not already say, use alt="" so assistive technology skips it - an empty alt is a deliberate, meaningful choice, and a missing one is not.

## References

- https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/img#alt

## Disabling this rule

```json
{
  "rules": {
    "accessibility/img-missing-alt": "off"
  }
}
```

---

[← All rules](./README.md)
