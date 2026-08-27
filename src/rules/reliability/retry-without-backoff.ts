import { defineRule } from '../../core/define-rule.js';
import { isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';

/** A bounded loop whose body performs a network call. */
const RETRY_LOOP =
  /\bfor\s*\(\s*(?:let|var|const)?\s*[\w$]+\s*=\s*0\s*;[^;]{0,60};[^)]{0,40}\)\s*\{|\bwhile\s*\(\s*(?:true|[\w$]+\s*<\s*[\w$]+|retries?\b[^)]{0,40})\)\s*\{/g;

const NETWORK_CALL = /\b(?:fetch|axios|got|ky|request|\$fetch)\s*[.(]/;
const BACKOFF =
  /\b(?:setTimeout|setInterval|sleep|delay|wait|waitFor|backoff|jitter|pRetry|retryWithBackoff)\b|p-retry|scheduler\.wait/i;

export default defineRule({
  meta: {
    id: 'reliability/retry-without-backoff',
    category: 'reliability',
    title: 'Retry loop with no delay between attempts',
    severity: 'medium',
    confidence: 'low',
    description:
      'A loop retries a network call with no delay. When the dependency is failing because it is overloaded, retrying immediately multiplies the load at exactly the wrong moment - the classic retry storm that turns a brief blip into a sustained outage.',
    remediation:
      'Add exponential backoff with jitter between attempts and cap the total number of retries. Only retry idempotent operations, and give up quickly on 4xx responses, which will not succeed on a second attempt.',
    references: [
      'https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/',
    ],
    tags: ['resilience', 'retries'],
  },

  checkFile(file, ctx) {
    if (!file.isServer) return;
    if (isNonProductionFile(file)) return;
    let reported = 0;

    for (const match of file.matches(RETRY_LOOP)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      const open = file.code.indexOf('{', match.index);
      if (open === -1) continue;
      const close = file.matchBrace(open);
      if (close === -1) continue;
      const body = file.code.slice(open, close);
      if (body.length > 3000) continue;
      if (!NETWORK_CALL.test(body)) continue;
      if (BACKOFF.test(body)) continue;

      reported++;
      ctx.report({
        explanation: `${file.path} retries a network call in a loop with no delay between attempts. If the dependency is failing under load, this adds to that load immediately.`,
        evidence: [file.evidenceAt(match.index, { length: Math.min(match.text.length, 100) })],
      });
    }
  },
});
