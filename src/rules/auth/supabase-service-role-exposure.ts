import { defineRule } from '../../core/define-rule.js';
import { isClientReachable, isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';

const SERVICE_ROLE =
  /(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_KEY|service_role|serviceRoleKey|SERVICE_ROLE_KEY)/g;

const PUBLIC_PREFIX = /NEXT_PUBLIC_|VITE_|PUBLIC_|REACT_APP_|EXPO_PUBLIC_/;

export default defineRule({
  meta: {
    id: 'auth/supabase-service-role-exposure',
    category: 'auth',
    title: 'Supabase service-role key reachable from the browser',
    severity: 'critical',
    confidence: 'high',
    blocker: true,
    requiresFrameworks: ['supabase'],
    description:
      'The Supabase service-role key bypasses every row-level security policy on the project. It is a full-access database credential. Referencing it in a client component, or behind a public environment prefix, publishes complete read and write access to your database to anyone who opens the bundle.',
    remediation:
      'Use the anon key in the browser and rely on row-level security for access control. Keep the service-role key in server-only code - a route handler, server action, or edge function - and rotate it immediately if it has ever been in a client bundle.',
    references: [
      'https://supabase.com/docs/guides/api/api-keys',
      'https://supabase.com/docs/guides/database/postgres/row-level-security',
    ],
    tags: ['supabase', 'secrets', 'owasp-a01'],
  },

  checkFile(file, ctx) {
    if (isNonProductionFile(file)) return;
    let reported = 0;
    for (const match of file.matches(SERVICE_ROLE)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      const line = file.lineAt(match.index);
      const text = file.lineText(line);

      const publiclyPrefixed = PUBLIC_PREFIX.test(text);
      const clientReachable = isClientReachable(file);
      if (!publiclyPrefixed && !clientReachable) continue;

      reported++;
      ctx.report({
        title: publiclyPrefixed
          ? 'Service-role key read through a browser-visible environment variable'
          : `Service-role key referenced in client-reachable module ${file.path}`,
        explanation: publiclyPrefixed
          ? `${file.path} reads the Supabase service-role key from a variable with a public build-time prefix. The value is inlined into the browser bundle, granting every visitor full, RLS-bypassing access to the database.`
          : `${file.path} is client-reachable${file.isClientComponent ? ' (it is marked "use client")' : ''} and references the Supabase service-role key. That key bypasses all row-level security.`,
        evidence: [file.evidenceAt(match.index, { length: match.text.length })],
      });
    }
  },
});
