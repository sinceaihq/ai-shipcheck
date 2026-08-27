# `performance/heavy-client-import`

> Large dependency imported into client code

| | |
| --- | --- |
| **Category** | Performance |
| **Severity** | `low` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `bundle-size` |

## What this means

A large package is imported wholesale into code that ships to the browser. Every visitor downloads, parses and executes it before the page becomes interactive, on whatever connection they happen to have.

## How to fix it

Import only the specific function you use, switch to a smaller equivalent, or load the module with a dynamic import so it is fetched on demand.

## Disabling this rule

```json
{
  "rules": {
    "performance/heavy-client-import": "off"
  }
}
```

---

[← All rules](./README.md)
