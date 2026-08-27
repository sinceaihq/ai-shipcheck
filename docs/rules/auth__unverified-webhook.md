# `auth/unverified-webhook`

> Webhook endpoint does not verify its signature

| | |
| --- | --- |
| **Category** | Authentication & Authorization |
| **Severity** | `high` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `webhooks`, `authorization` |

## What this means

A webhook receiver processes the request body without verifying the provider signature. Webhook URLs are not secrets - they appear in provider dashboards, logs and error reports - so an unauthenticated endpoint that trusts its payload lets anyone forge events such as "payment succeeded" or "subscription upgraded".

## How to fix it

Verify the signature header against the raw request body before parsing it, using the provider SDK (stripe.webhooks.constructEvent, svix Webhook.verify) or an HMAC comparison with crypto.timingSafeEqual. Reject the request when verification fails.

## References

- https://docs.stripe.com/webhooks#verify-events
- https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries

## Disabling this rule

```json
{
  "rules": {
    "auth/unverified-webhook": "off"
  }
}
```

---

[← All rules](./README.md)
