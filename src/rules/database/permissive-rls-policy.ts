import { defineRule } from '../../core/define-rule.js';
import { findPolicies, stripSqlComments } from './sql.js';
import { MAX_FINDINGS_PER_RULE } from '../helpers.js';

/** `USING (true)` / `WITH CHECK (true)` - a policy that allows everything. */
const ALWAYS_TRUE = /(?:using|with\s+check)\s*\(\s*true\s*\)/i;
/** A policy granted to the anonymous or public role. */
const PUBLIC_ROLE = /\bto\s+(?:public|anon)\b/i;
/** A policy that covers every operation. */
const ALL_OPERATIONS = /\bfor\s+all\b/i;

export default defineRule({
  meta: {
    id: 'database/permissive-rls-policy',
    category: 'database',
    title: 'Row-level security policy allows unrestricted access',
    severity: 'critical',
    confidence: 'high',
    requiresFrameworks: ['supabase'],
    description:
      'A row-level security policy uses an always-true predicate. Enabling RLS and then adding "USING (true)" restores exactly the access RLS was turned on to prevent - and it looks secure in a dashboard that only reports whether RLS is on.',
    remediation:
      'Write the predicate against the caller identity: USING (auth.uid() = user_id) for owner-scoped rows, or a membership subquery for team data. Keep separate policies per operation, and only use "USING (true)" for genuinely public read-only reference tables.',
    references: ['https://supabase.com/docs/guides/database/postgres/row-level-security'],
    tags: ['supabase', 'rls', 'owasp-a01'],
  },

  fileExtensions: ['.sql'],

  appliesTo(index) {
    if (index.findFiles((f) => f.ext === '.sql').length === 0) {
      return {
        applicable: false,
        status: 'unassessed',
        reason:
          'No SQL migration files were found, so RLS policies could not be reviewed from source.',
      };
    }
    return { applicable: true };
  },

  checkFile(file, ctx) {
    if (file.ext !== '.sql') return;
    const sql = stripSqlComments(file.content);
    let reported = 0;

    for (const policy of findPolicies(sql)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      if (!ALWAYS_TRUE.test(policy.statement)) continue;

      const forAll = ALL_OPERATIONS.test(policy.statement);
      const toPublic = PUBLIC_ROLE.test(policy.statement);
      const writable = forAll || /\bfor\s+(?:insert|update|delete)\b/i.test(policy.statement);

      reported++;
      ctx.report({
        title: `Policy "${policy.name}" on ${policy.table} permits unrestricted ${forAll ? 'access' : 'access to its operation'}`,
        severity: writable ? 'critical' : 'high',
        explanation: writable
          ? `${file.path} defines policy "${policy.name}" on ${policy.table} with an always-true predicate covering ${forAll ? 'all operations' : 'a write operation'}${toPublic ? ' for the public/anon role' : ''}. Anyone holding the anon key can modify this table.`
          : `${file.path} defines policy "${policy.name}" on ${policy.table} with an always-true read predicate${toPublic ? ' for the public/anon role' : ''}. Every row is world-readable.`,
        evidence: [file.evidenceAt(policy.offset, { note: policy.name })],
      });
    }
  },
});
