import { defineRule } from '../../core/define-rule.js';
import { isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';

const PROCESS_EXIT = /\bprocess\s*\.\s*(?:exit|abort)\s*\(/g;

export default defineRule({
  meta: {
    id: 'reliability/process-exit-in-request-path',
    category: 'reliability',
    title: 'process.exit() inside a request handler',
    severity: 'high',
    confidence: 'high',
    description:
      'Calling process.exit() from code that serves requests kills the process immediately: in-flight requests are dropped without a response, buffered logs are lost, and open database transactions are abandoned. On a serverless platform it also poisons the warm instance for every concurrent invocation.',
    remediation:
      'Return an error response instead. Reserve process.exit for CLI entry points and startup validation, and even there prefer setting process.exitCode and letting the event loop drain so logs flush.',
    tags: ['availability'],
  },

  checkFile(file, ctx) {
    if (isNonProductionFile(file)) return;
    if (
      file.role !== 'next-app-route' &&
      file.role !== 'next-pages-api' &&
      file.role !== 'server-actions' &&
      file.role !== 'next-middleware'
    ) {
      return;
    }
    let reported = 0;
    for (const match of file.matches(PROCESS_EXIT)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      reported++;
      ctx.report({
        explanation: `${file.path} serves requests and calls ${match.text.trim()}. Every concurrent request on this instance is dropped without a response when it runs.`,
        evidence: [file.evidenceAt(match.index, { length: match.text.length })],
      });
    }
  },
});
