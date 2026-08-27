# `database/permissive-rls-policy`

> Row-level security policy allows unrestricted access

| | |
| --- | --- |
| **Category** | Database & Data Safety |
| **Severity** | `critical` |
| **Confidence** | `high` |
| **Blocker** | No |
| **Requires** | `supabase` |
| **Tags** | `supabase`, `rls`, `owasp-a01` |

## What this means

A row-level security policy uses an always-true predicate. Enabling RLS and then adding "USING (true)" restores exactly the access RLS was turned on to prevent - and it looks secure in a dashboard that only reports whether RLS is on.

## How to fix it

Write the predicate against the caller identity: USING (auth.uid() = user_id) for owner-scoped rows, or a membership subquery for team data. Keep separate policies per operation, and only use "USING (true)" for genuinely public read-only reference tables.

## References

- https://supabase.com/docs/guides/database/postgres/row-level-security

## Disabling this rule

```json
{
  "rules": {
    "database/permissive-rls-policy": "off"
  }
}
```

---

[← All rules](./README.md)
