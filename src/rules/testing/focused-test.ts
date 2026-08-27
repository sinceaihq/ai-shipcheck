import { defineRule } from '../../core/define-rule.js';
import { MAX_FINDINGS_PER_RULE } from '../helpers.js';

/** `describe.only`, `it.only`, `test.only`, and the `fdescribe`/`fit` forms. */
const FOCUSED = /\b(?:describe|it|test|context|suite)\s*\.\s*only\s*\(|\bf(?:describe|it)\s*\(/g;

export default defineRule({
  meta: {
    id: 'testing/focused-test',
    category: 'testing',
    title: 'Focused test committed',
    severity: 'high',
    confidence: 'high',
    description:
      'A .only() test silently disables every other test in its file. The suite still reports success, having run a single assertion - which is worse than a failing build, because nothing looks wrong.',
    remediation:
      'Remove .only before committing, and add an ESLint rule (no-only-tests) or a grep in CI so it cannot happen again.',
    tags: ['testing', 'ci'],
  },

  appliesTo(index) {
    if (index.withRole('test').length === 0) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason: 'This project has no test files.',
      };
    }
    return { applicable: true };
  },

  checkFile(file, ctx) {
    if (file.role !== 'test') return;
    let reported = 0;

    for (const match of file.matches(FOCUSED)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      reported++;
      ctx.report({
        explanation: `${file.path} contains ${match.text.trim()}, so only that test runs. Every other test in the file is skipped and CI still reports success.`,
        evidence: [file.evidenceAt(match.index, { length: match.text.length })],
      });
    }
  },
});
