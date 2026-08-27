import { defineRule } from '../../core/define-rule.js';
import { MAX_FINDINGS_PER_RULE } from '../helpers.js';

/** Role/permission comparisons made in browser code. */
const ROLE_CHECK =
  /\b(?:user|session|profile|account|me|currentUser|auth)\s*(?:\?\.)?\.(?:role|roles|isAdmin|is_admin|permissions|plan|tier|isPro|subscription)\b/g;

const ADMIN_LITERAL = /['"](?:admin|owner|superuser|super_admin|staff|moderator)['"]/;

export default defineRule({
  meta: {
    id: 'auth/client-side-only-authorization',
    category: 'auth',
    title: 'Authorisation decision made only in the browser',
    severity: 'high',
    confidence: 'medium',
    description:
      'A privilege check runs in client-side code. Hiding an admin button stops an honest user from clicking it, but the bundle, the API calls it makes and the responses are all fully visible and editable in devtools. If the same check is not repeated on the server, the capability is effectively public.',
    remediation:
      'Treat the client check as a UX affordance only. Enforce the same rule in the route handler, server action or database policy that performs the privileged operation, and return 403 there.',
    references: ['https://owasp.org/Top10/A01_2021-Broken_Access_Control/'],
    tags: ['authorization', 'owasp-a01'],
  },

  appliesTo(index) {
    if (!index.profile.hasClientCode) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason: 'No browser-side code was found in this project.',
      };
    }
    return { applicable: true };
  },

  checkFile(file, ctx) {
    if (!file.isClientComponent && file.role !== 'react-module' && file.role !== 'next-pages-page')
      return;

    let reported = 0;
    const seenLines = new Set<number>();
    for (const match of file.matches(ROLE_CHECK)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      const line = file.lineAt(match.index);
      if (seenLines.has(line)) continue;
      const text = file.lineText(line);
      // Only report comparisons that gate behaviour, not plain display of a role.
      if (!/[=!]==?|\?\s|&&|\|\||if\s*\(/.test(text)) continue;
      if (
        !ADMIN_LITERAL.test(text) &&
        !/isAdmin|is_admin|permissions|canManage|canEdit|canDelete/.test(text)
      ) {
        continue;
      }
      seenLines.add(line);
      reported++;
      ctx.report({
        title: `Privilege check on ${match.text} runs in the browser`,
        explanation: `${file.path} decides what a user may do by inspecting ${match.text} in client code. Anyone can edit that value in devtools or call the underlying API directly, so this cannot be the only place the rule is enforced.`,
        evidence: [file.evidenceAt(match.index, { length: match.text.length })],
      });
    }
  },
});
