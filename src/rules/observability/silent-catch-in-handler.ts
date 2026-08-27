import { defineRule } from '../../core/define-rule.js';
import { MAX_FINDINGS_PER_RULE } from '../helpers.js';

const CATCH_BLOCK = /catch\s*(?:\(\s*[\w$]*\s*(?::\s*[\w$<>|\s]+)?\s*\))?\s*\{/g;

/** Anything that records the error rather than discarding it. */
const RECORDS_ERROR =
  /(?:console\s*\.\s*(?:error|warn)|logger?\s*\.|log\s*\.|captureException|captureError|reportError|Sentry|track\s*\(|notify\s*\(|throw\b|trace\s*\()/;

export default defineRule({
  meta: {
    id: 'observability/silent-catch-in-handler',
    category: 'observability',
    title: 'Request handler catches an error without recording it',
    severity: 'medium',
    confidence: 'medium',
    description:
      'A route handler catches an exception and returns an error response without logging or reporting it. The user sees "something went wrong" and you see nothing at all: there is no signal that the endpoint is failing, no stack trace, and no way to tell one failure from a thousand.',
    remediation:
      'Log the caught error with enough context to find it again - route, user id, request id - and report it to your monitoring service before returning the response. Return a generic message to the client, but keep the detail server-side.',
    references: ['https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/'],
    tags: ['error-handling', 'monitoring', 'owasp-a09'],
  },

  appliesTo(index) {
    if (index.routeFiles.length === 0 && index.withRole('server-actions').length === 0) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason: 'No route handlers or server actions were found in this project.',
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
    let reported = 0;

    for (const match of file.matches(CATCH_BLOCK)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      const open = file.code.indexOf('{', match.index);
      if (open === -1) continue;
      const close = file.matchBrace(open);
      if (close === -1) continue;
      const body = file.code.slice(open + 1, close);
      if (body.trim().length === 0) continue; // reliability/swallowed-error covers this
      if (RECORDS_ERROR.test(body)) continue;
      // Only report when the handler actually responds, i.e. hides the failure.
      if (!/\breturn\b|\bres\s*\.\s*(?:status|json|send)/.test(body)) continue;

      reported++;
      ctx.report({
        explanation: `${file.path} catches an error and returns a response without logging or reporting it. Failures on this endpoint are invisible in production.`,
        evidence: [file.evidenceAt(match.index, { length: match.text.length })],
      });
    }
  },
});
