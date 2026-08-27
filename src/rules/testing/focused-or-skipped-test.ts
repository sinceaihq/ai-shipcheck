import { defineRule } from '../../core/define-rule.js';
import { MAX_FINDINGS_PER_RULE } from '../helpers.js';

const FOCUSED = /\b(?:describe|it|test|context|suite)\s*\.\s*only\s*\(|\bf(?:describe|it)\s*\(/g;
const SKIPPED =
  /\b(?:describe|it|test|context|suite)\s*\.\s*(?:skip|todo)\s*\(|\bx(?:describe|it)\s*\(/g;

export default defineRule({
  meta: {
    id: 'testing/focused-or-skipped-test',
    category: 'testing',
    title: 'Focused or skipped test committed',
    severity: 'high',
    confidence: 'high',
    description:
      'A .only() test silently disables every other test in its file - the suite still reports success, having run one assertion. A .skip() leaves a test that looks like coverage in the file listing but never executes.',
    remediation:
      'Remove .only before committing and add a lint rule that fails on it. For a skipped test, either fix it or delete it and open an issue; a permanently skipped test is documentation that has stopped being true.',
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
        title: 'Focused test disables the rest of its file',
        severity: 'high',
        explanation: `${file.path} contains ${match.text.trim()}, so only that test runs. Every other test in the file is skipped and CI still reports success.`,
        evidence: [file.evidenceAt(match.index, { length: match.text.length })],
      });
    }

    for (const match of file.matches(SKIPPED)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      reported++;
      ctx.report({
        title: 'Skipped test committed',
        severity: 'low',
        confidence: 'high',
        explanation: `${file.path} contains ${match.text.trim()}. The test appears in the file but never runs, so the behaviour it describes is unverified.`,
        remediation: 'Fix and re-enable the test, or delete it and track the gap in an issue.',
        evidence: [file.evidenceAt(match.index, { length: match.text.length })],
      });
    }
  },
});
