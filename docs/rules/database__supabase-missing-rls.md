# `database/supabase-missing-rls`

> Table created without row-level security enabled

| | |
| --- | --- |
| **Category** | Database & Data Safety |
| **Severity** | `critical` |
| **Confidence** | `high` |
| **Blocker** | Yes — forces `NOT READY` |
| **Requires** | `supabase` |
| **Tags** | `supabase`, `rls`, `owasp-a01` |

## What this means

Supabase exposes every table in the public schema through PostgREST, and the anon key is embedded in your client bundle by design. Row-level security is what stands between that key and your data. A table created without "ALTER TABLE ... ENABLE ROW LEVEL SECURITY" is readable - and often writable - by anyone on the internet.

## How to fix it

Enable RLS on the table and add explicit policies for each operation you intend to allow: ALTER TABLE public.your_table ENABLE ROW LEVEL SECURITY; then CREATE POLICY ... USING (auth.uid() = user_id). Verify from an anonymous client that reads and writes are refused.

## References

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/api/securing-your-api

## Disabling this rule

```json
{
  "rules": {
    "database/supabase-missing-rls": "off"
  }
}
```

---

[← All rules](./README.md)
