# `performance/next-unoptimized-image`

> Raw <img> tag in a Next.js application

| | |
| --- | --- |
| **Category** | Performance |
| **Severity** | `low` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Requires** | `next` |
| **Tags** | `images`, `core-web-vitals` |

## What this means

A plain <img> tag skips the Next.js image pipeline: no automatic resizing for the viewport, no modern format negotiation, no lazy loading, and no width/height reservation - which means the image contributes directly to layout shift as it loads.

## How to fix it

Use next/image with explicit width and height (or fill with a sized parent). Configure remotePatterns in next.config for external hosts. Keep a raw <img> only where the pipeline genuinely cannot help, such as inline SVG data URIs.

## References

- https://nextjs.org/docs/app/api-reference/components/image

## Disabling this rule

```json
{
  "rules": {
    "performance/next-unoptimized-image": "off"
  }
}
```

---

[← All rules](./README.md)
