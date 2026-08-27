import { defineRule } from '../../core/define-rule.js';
import { isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';

const CATCH_BLOCK = /catch\s*(?:\(\s*[\w$]*\s*(?::\s*[\w$<>|\s]+)?\s*\))?\s*\{/g;
const EMPTY_PROMISE_CATCH = /\.\s*catch\s*\(\s*(?:\(\s*\)|\(?\s*[\w$]+\s*\)?)\s*=>\s*\{\s*\}\s*\)/g;

export default defineRule({
  meta: {
    id: 'reliability/swallowed-error',
    category: 'reliability',
    title: 'Error caught and discarded',
    severity: 'medium',
    confidence: 'high',
    description:
      'A catch block does nothing with the error. The failure still happened - a write did not land, a payment did not go through - but there is no log, no metric and no rethrow, so the system reports success and the problem surfaces later as inconsistent data with no trace of the cause.',
    remediation:
      'Do one of three things in every catch: rethrow, handle the failure explicitly (return a fallback and log it), or record it. If the error genuinely is expected and safe to ignore, say so in a comment naming the case - a bare empty block is indistinguishable from an oversight.',
    references: ['https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/'],
    tags: ['error-handling'],
  },

  checkFile(file, ctx) {
    if (isNonProductionFile(file)) return;
    let reported = 0;

    for (const match of file.matches(CATCH_BLOCK)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      const open = file.code.indexOf('{', match.index);
      if (open === -1) continue;
      const close = file.matchBrace(open);
      if (close === -1) continue;

      const masked = file.code.slice(open + 1, close).trim();
      if (masked.length > 0) continue; // real statements present

      // The masked view blanks comments, so recover the original to see whether
      // the developer explained the omission.
      const original = file.content.slice(open + 1, close);
      if (/\/\/|\/\*/.test(original)) continue;

      reported++;
      ctx.report({
        title: 'Empty catch block discards the error',
        explanation: `${file.path} catches an error and does nothing with it. The operation failed silently: no log entry, no metric, no rethrow.`,
        evidence: [file.evidenceAt(match.index, { length: match.text.length })],
      });
    }

    for (const match of file.matches(EMPTY_PROMISE_CATCH)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      reported++;
      ctx.report({
        title: 'Promise rejection discarded by an empty .catch()',
        explanation: `${file.path} attaches an empty .catch() handler. The rejection is suppressed with no record that anything went wrong.`,
        evidence: [file.evidenceAt(match.index, { length: match.text.length })],
      });
    }
  },
});
