import { defineRule } from '../../core/define-rule.js';
import { hasAuthSignal, MAX_FINDINGS_PER_RULE } from '../helpers.js';

/**
 * A record lookup keyed directly by an identifier taken from the request.
 * Covers Prisma, Drizzle, Supabase and Mongoose shapes.
 */
const LOOKUP_PATTERNS: readonly RegExp[] = [
  /\.\s*(?:findUnique|findFirst|findById|findOne)\s*\(\s*\{?[^)]{0,200}\)/g,
  /\.\s*eq\s*\(\s*['"]id['"]\s*,\s*([^)]{0,80})\)/g,
  /\.\s*where\s*\(\s*eq\s*\(\s*[\w.]+\.id\s*,\s*([^)]{0,80})\)/g,
];

/** Identifier expressions that come straight from the request. */
const REQUEST_ID =
  /(?:params\s*(?:\?\.)?\.\s*\w*[Ii]d|(?:search)?[Pp]arams\s*\.\s*get\s*\(|req\.query|request\.query|body\s*\.\s*\w*[Ii]d|await\s+params|\bfrom\s+params\b)/;

/** Scoping that ties the lookup to the caller. */
const OWNERSHIP_SCOPE =
  /(?:userId|user_id|ownerId|owner_id|accountId|account_id|tenantId|tenant_id|organizationId|organisation_id|orgId|org_id|workspaceId|teamId|createdBy|created_by|auth\.uid)/;

export default defineRule({
  meta: {
    id: 'auth/unscoped-record-access',
    category: 'auth',
    title: 'Record fetched by request-supplied id without an ownership check',
    severity: 'high',
    confidence: 'low',
    description:
      'A database lookup uses an identifier taken directly from the request and does not constrain the query to the current user, account or tenant. This is an insecure direct object reference: changing the id in the URL returns somebody else data.',
    remediation:
      'Add the caller identity to the query itself - where: { id, userId: session.user.id } - so a mismatched id returns nothing rather than another user record. Where the database enforces it, a row-level security policy on the table gives the same guarantee for every query.',
    references: [
      'https://owasp.org/Top10/A01_2021-Broken_Access_Control/',
      'https://cwe.mitre.org/data/definitions/639.html',
    ],
    tags: ['idor', 'authorization', 'owasp-a01'],
  },

  appliesTo(index) {
    if (index.routeFiles.length === 0 && index.withRole('server-actions').length === 0) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason: 'No route handlers or server actions were found to analyse.',
      };
    }
    if (!index.hasFramework('prisma', 'drizzle', 'supabase', 'mongoose')) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason: 'No supported database client (Prisma, Drizzle, Supabase, Mongoose) was detected.',
      };
    }
    return { applicable: true };
  },

  checkFile(file, ctx) {
    if (
      file.role !== 'next-app-route' &&
      file.role !== 'next-pages-api' &&
      file.role !== 'server-actions'
    ) {
      return;
    }
    // Without any auth at all this is reported by auth/unprotected-route-handler;
    // this rule is specifically about *authenticated but unscoped* access.
    if (!hasAuthSignal(file.text)) return;

    let reported = 0;
    const seenLines = new Set<number>();

    for (const pattern of LOOKUP_PATTERNS) {
      for (const match of file.matchesText(pattern)) {
        if (reported >= MAX_FINDINGS_PER_RULE) return;
        const line = file.lineAt(match.index);
        if (seenLines.has(line)) continue;

        const region = file.content.slice(match.index, match.index + 400);
        if (!REQUEST_ID.test(region) && !REQUEST_ID.test(nearbyLines(file, line))) continue;
        if (OWNERSHIP_SCOPE.test(region)) continue;

        seenLines.add(line);
        reported++;
        ctx.report({
          explanation: `${file.path} looks a record up by an id taken from the request without constraining the query to the authenticated user. A caller can substitute another id and read or modify records that are not theirs.`,
          evidence: [file.evidenceAt(match.index, { length: Math.min(match.text.length, 120) })],
        });
      }
    }

    function nearbyLines(f: typeof file, line: number): string {
      return [line - 2, line - 1, line, line + 1]
        .filter((n) => n >= 1)
        .map((n) => f.lineText(n))
        .join('\n');
    }
  },
});
