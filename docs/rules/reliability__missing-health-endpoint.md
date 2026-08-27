# `reliability/missing-health-endpoint`

> No health or readiness endpoint

| | |
| --- | --- |
| **Category** | Reliability |
| **Severity** | `low` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `operations`, `monitoring` |

## What this means

The application exposes no health endpoint. Load balancers, container orchestrators and uptime monitors all need a cheap URL that reports whether this instance can serve traffic; without one they fall back to "the port is open", which stays true long after the database connection has died.

## How to fix it

Add a GET /api/health route that returns 200 with a small JSON body. Keep it cheap - no authentication, no heavy queries - and add a separate readiness endpoint if you need to check dependencies before accepting traffic.

## Disabling this rule

```json
{
  "rules": {
    "reliability/missing-health-endpoint": "off"
  }
}
```

---

[← All rules](./README.md)
