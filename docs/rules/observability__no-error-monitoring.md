# `observability/no-error-monitoring`

> No production error monitoring

| | |
| --- | --- |
| **Category** | Observability |
| **Severity** | `medium` |
| **Confidence** | `high` |
| **Blocker** | No |
| **Tags** | `monitoring`, `owasp-a09` |

## What this means

No error monitoring or tracing SDK is installed. Without one, a production exception exists only as a line in a log stream nobody is reading - you find out from a user, hours later, with no stack trace and no idea how many people it affected.

## How to fix it

Install an error monitoring SDK and initialise it in both the server and client entry points. Sentry has a first-party Next.js integration; @vercel/otel or the OpenTelemetry SDK work if you would rather not add a vendor. Configure release tracking so errors are attributed to a deploy.

## References

- https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/

## Disabling this rule

```json
{
  "rules": {
    "observability/no-error-monitoring": "off"
  }
}
```

---

[← All rules](./README.md)
