import { defineRule } from '../../core/define-rule.js';
import { findCreatedTables, findRlsEnabledTables, stripSqlComments } from './sql.js';
import { MAX_FINDINGS_PER_RULE } from '../helpers.js';

/** Postgres internal schemas that are managed by the platform. */
const MANAGED_PREFIX =
  /^(?:auth|storage|realtime|supabase_|pgsodium|vault|extensions|graphql|net|cron)\b/i;

export default defineRule({
  meta: {
    id: 'database/supabase-missing-rls',
    category: 'database',
    title: 'Table created without row-level security enabled',
    severity: 'critical',
    confidence: 'high',
    blocker: true,
    requiresFrameworks: ['supabase'],
    description:
      'Supabase exposes every table in the public schema through PostgREST, and the anon key is embedded in your client bundle by design. Row-level security is what stands between that key and your data. A table created without "ALTER TABLE ... ENABLE ROW LEVEL SECURITY" is readable - and often writable - by anyone on the internet.',
    remediation:
      'Enable RLS on the table and add explicit policies for each operation you intend to allow: ALTER TABLE public.your_table ENABLE ROW LEVEL SECURITY; then CREATE POLICY ... USING (auth.uid() = user_id). Verify from an anonymous client that reads and writes are refused.',
    references: [
      'https://supabase.com/docs/guides/database/postgres/row-level-security',
      'https://supabase.com/docs/guides/api/securing-your-api',
    ],
    tags: ['supabase', 'rls', 'owasp-a01'],
  },

  fileExtensions: ['.sql'],

  appliesTo(index) {
    const sqlFiles = index.findFiles((f) => f.ext === '.sql');
    if (sqlFiles.length === 0) {
      return {
        applicable: false,
        status: 'unassessed',
        reason:
          'No SQL migration files were found, so table-level RLS could not be verified from source. Check policies in the Supabase dashboard.',
      };
    }
    return { applicable: true };
  },

  checkProject(ctx) {
    const sqlFiles = ctx.index.findFiles((f) => f.ext === '.sql');
    if (sqlFiles.length === 0) return;

    // RLS may be enabled in a later migration than the CREATE TABLE, so the
    // whole migration set is considered as one document.
    const enabled = new Set<string>();
    for (const file of sqlFiles) {
      for (const name of findRlsEnabledTables(stripSqlComments(file.content))) enabled.add(name);
    }

    let reported = 0;
    for (const file of sqlFiles) {
      const sql = stripSqlComments(file.content);
      for (const table of findCreatedTables(sql)) {
        if (reported >= MAX_FINDINGS_PER_RULE) return;
        if (MANAGED_PREFIX.test(table.qualified)) continue;
        if (enabled.has(table.name)) continue;
        reported++;
        ctx.report({
          title: `Table "${table.name}" is created without row-level security`,
          explanation: `${file.path} creates ${table.qualified} and no migration enables row-level security on it. With RLS off, every row is readable through the public PostgREST API using the anon key that ships in your client bundle.`,
          evidence: [file.evidenceAt(table.offset, { note: table.qualified })],
        });
      }
    }
  },
});
