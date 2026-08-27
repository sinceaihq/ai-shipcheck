# `auth/supabase-service-role-exposure`

> Supabase service-role key reachable from the browser

| | |
| --- | --- |
| **Category** | Authentication & Authorization |
| **Severity** | `critical` |
| **Confidence** | `high` |
| **Blocker** | Yes — forces `NOT READY` |
| **Requires** | `supabase` |
| **Tags** | `supabase`, `secrets`, `owasp-a01` |

## What this means

The Supabase service-role key bypasses every row-level security policy on the project. It is a full-access database credential. Referencing it in a client component, or behind a public environment prefix, publishes complete read and write access to your database to anyone who opens the bundle.

## How to fix it

Use the anon key in the browser and rely on row-level security for access control. Keep the service-role key in server-only code - a route handler, server action, or edge function - and rotate it immediately if it has ever been in a client bundle.

## References

- https://supabase.com/docs/guides/api/api-keys
- https://supabase.com/docs/guides/database/postgres/row-level-security

## Disabling this rule

```json
{
  "rules": {
    "auth/supabase-service-role-exposure": "off"
  }
}
```

---

[← All rules](./README.md)
