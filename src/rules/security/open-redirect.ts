import { defineRule } from '../../core/define-rule.js';
import { MAX_FINDINGS_PER_RULE } from '../helpers.js';

/** Redirect sinks across Next.js, Express and the browser. */
const REDIRECT_SINKS = [
  /\bredirect\s*\(\s*([^)]{0,160})\)/g,
  /\bNextResponse\s*\.\s*redirect\s*\(\s*([^)]{0,160})\)/g,
  /\bres\s*\.\s*redirect\s*\(\s*([^)]{0,160})\)/g,
  /\bwindow\s*\.\s*location\s*(?:\.\s*(?:href|assign|replace)\s*=?\s*\(?)\s*([^;)\n]{0,160})/g,
];

/** Expressions that carry request-controlled data. */
const REQUEST_SOURCE =
  /(?:searchParams\s*\.\s*get|req\.query|request\.query|req\.body|request\.body|params\s*\.\s*|query\s*\.\s*|formData\s*\.\s*get|\bnext\b|redirect(?:To|_to|Url|_url)|returnTo|return_to|callbackUrl|continue)/i;

/** Validation constructs that make a redirect target safe. */
const VALIDATION =
  /(?:startsWith\s*\(\s*['"]\/|allowlist|allowList|whitelist|ALLOWED_|isSafeRedirect|sanitizeRedirect|validateRedirect|new URL\([^)]*,\s*(?:process\.env|['"]https?:)|\.origin\s*(?:===|!==)|hostname\s*(?:===|!==))/;

export default defineRule({
  meta: {
    id: 'security/open-redirect',
    category: 'security',
    title: 'Redirect target taken from the request without validation',
    severity: 'high',
    confidence: 'medium',
    description:
      'A redirect destination is read from the request (a query parameter, body field or route param) and used without checking it. Attackers use open redirects to make phishing links look like they point at your domain, and to bounce OAuth callbacks to a host they control.',
    remediation:
      'Only redirect to paths you control. Require the target to start with a single "/" and reject protocol-relative values ("//evil.com"), or resolve it against your own origin with new URL(target, siteOrigin) and confirm the resulting origin matches.',
    references: [
      'https://owasp.org/www-community/attacks/Unvalidated_Redirects_and_Forwards_Cheat_Sheet',
      'https://cwe.mitre.org/data/definitions/601.html',
    ],
    tags: ['redirect', 'owasp-a01'],
  },

  checkFile(file, ctx) {
    if (file.role === 'test') return;
    let reported = 0;

    for (const pattern of REDIRECT_SINKS) {
      for (const match of file.matches(pattern)) {
        if (reported >= MAX_FINDINGS_PER_RULE) return;
        const argument = match.groups[0];
        if (argument === undefined) continue;
        if (!REQUEST_SOURCE.test(argument)) continue;

        // Look at the surrounding lines for a validation guard.
        const line = file.lineAt(match.index);
        const context = [line - 4, line - 3, line - 2, line - 1, line]
          .filter((n) => n >= 1)
          .map((n) => file.lineText(n))
          .join('\n');
        if (VALIDATION.test(context)) continue;

        reported++;
        ctx.report({
          explanation: `${file.path} redirects to a value derived from the request without validating it. A crafted link can send your users to an attacker-controlled site while appearing to originate from your application.`,
          evidence: [file.evidenceAt(match.index, { length: Math.min(match.text.length, 160) })],
        });
      }
    }
  },
});
