import { defineRule } from '../../core/define-rule.js';
import { isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';

/** Redirect sinks across Next.js, Express and the browser. */
const REDIRECT_SINKS = [
  // `NextResponse.redirect(...)` and `res.redirect(...)` both end in
  // `redirect(`, so one pattern covers all three call shapes. Listing them
  // separately would report the same call site more than once.
  /(?:\bNextResponse\s*\.\s*|\bres(?:ponse)?\s*\.\s*|\b)redirect\s*\(\s*([^)]{0,160})\)/g,
  /\bwindow\s*\.\s*location\s*(?:\.\s*(?:href|assign|replace)\s*=?\s*\(?)\s*([^;)\n]{0,160})/g,
];

/** Expressions that carry request-controlled data. */
/**
 * Expressions that carry request-controlled data.
 *
 * A bare `next` is deliberately absent: it is one of the most common
 * identifiers in a Next.js codebase and matching it reported every redirect
 * that merely mentioned the word.
 */
const REQUEST_SOURCE =
  /(?:searchParams\s*\.\s*get|req\.query|request\.query|req\.body|request\.body|params\s*\.\s*\w|query\s*\.\s*\w|formData\s*\.\s*get|\b(?:redirectTo|redirect_to|redirectUrl|redirect_url|returnTo|return_to|returnUrl|callbackUrl|continueTo)\b)/i;

/** Validation constructs that make a redirect target safe. */
/**
 * Constructs that make a redirect target safe.
 *
 * Includes any helper whose name says it validates or normalises the
 * destination. Applications overwhelmingly factor this out - `isValidReturnTo`,
 * `normalizeRedirect`, `safeRedirectPath` - and not recognising that shape
 * reported the codebases that had done exactly the right thing.
 */
const VALIDATION =
  /(?:startsWith\s*\(\s*['"]\/|allowlist|allowList|whitelist|ALLOWED_|new URL\([^)]*,\s*(?:process\.env|['"]https?:)|\.origin\s*(?:===|!==)|hostname\s*(?:===|!==)|\b(?:is|validate|check|assert|ensure|normali[sz]e|sanitiz\w*|safe|clean|resolve)\w*(?:Redirect|Return|ReturnTo|Url|Uri|Path|Next|Callback|Destination)\w*\s*\(|\bisValid\w*\s*\()/i;

/** A redirect to a literal same-origin path cannot leave the site. */
const SAME_ORIGIN_LITERAL = /^\s*(?:new\s+URL\s*\(\s*)?[`'"]\//;

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
    if (isNonProductionFile(file)) return;
    let reported = 0;

    for (const pattern of REDIRECT_SINKS) {
      for (const match of file.matches(pattern)) {
        if (reported >= MAX_FINDINGS_PER_RULE) return;
        const argument = match.groups[0];
        if (argument === undefined) continue;
        if (SAME_ORIGIN_LITERAL.test(argument)) continue;
        // The destination is usually read into a local first, so a bare
        // identifier is traced back to its assignment before being dismissed.
        if (!REQUEST_SOURCE.test(argument) && !bindingComesFromRequest(file.content, argument)) {
          continue;
        }

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

/**
 * True when the redirect target's root identifier is assigned from request
 * data somewhere in the module.
 *
 * A deliberately shallow, single-hop check: it catches the overwhelmingly
 * common shape - read the parameter into a const, redirect to it a few lines
 * later - without pretending to do real dataflow analysis.
 */
function bindingComesFromRequest(content: string, expression: string): boolean {
  const root = /^[A-Za-z_$][\w$]*/.exec(expression.trim())?.[0];
  if (root === undefined) return false;
  const assignment = new RegExp(`(?:const|let|var)\\s+${root}\\s*=\\s*[^;\\n]{0,200}`, 'g');
  let m: RegExpExecArray | null;
  while ((m = assignment.exec(content)) !== null) {
    if (
      REQUEST_SOURCE.test(m[0]) ||
      /searchParams|\\bquery\\b|\\bbody\\b|\\bparams\\b/.test(m[0])
    ) {
      return true;
    }
  }
  return false;
}
