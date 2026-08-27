import { defineRule } from '../../core/define-rule.js';
import { projectEvidence } from '../helpers.js';

const TEST_RUNNERS = [
  'vitest',
  'jest',
  'mocha',
  'ava',
  'tap',
  'node-tap',
  'uvu',
  '@playwright/test',
  'cypress',
  'jasmine',
  '@japa/runner',
  'bun-types',
];

export default defineRule({
  meta: {
    id: 'testing/no-test-infrastructure',
    category: 'testing',
    title: 'Project has no tests',
    severity: 'high',
    confidence: 'high',
    description:
      'No test files and no test runner were found. Without tests there is no way to tell whether a change breaks existing behaviour, which matters most in a codebase where large amounts of code were generated quickly and never read line by line.',
    remediation:
      'Add a test runner (vitest is the least-configuration option for a modern TypeScript project) and start with the paths where a bug is most expensive: authentication, payment, and anything that writes to the database. A handful of real tests on those paths is worth more than broad coverage elsewhere.',
    tags: ['testing'],
  },

  appliesTo(index) {
    // A directory that is not a JavaScript project has nothing to test, and
    // reporting "no tests" for it would be noise rather than a finding.
    if (index.packageJson === null && index.sourceFiles.length === 0) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason: 'No package.json and no JavaScript or TypeScript source files were found.',
      };
    }
    return { applicable: true };
  },

  checkProject(ctx) {
    const testFiles = ctx.index.withRole('test');
    const hasRunner = ctx.index.hasDependency(...TEST_RUNNERS);
    const hasTestScript = Object.entries(ctx.index.profile.scripts).some(
      ([name, body]) =>
        (name === 'test' || name.startsWith('test:')) &&
        body.trim().length > 0 &&
        !/no test specified|exit 1/i.test(body),
    );

    if (testFiles.length > 0) return;
    if (hasRunner && hasTestScript) {
      ctx.report({
        title: 'A test runner is configured but no test files exist',
        severity: 'medium',
        explanation:
          'The project declares a test runner and a test script, but no test or spec files were found. The command will pass trivially, which is worse than having no tests at all because CI reports green.',
        remediation:
          'Write the first tests for the highest-risk paths, or remove the test script so the gap is visible.',
        evidence: [
          projectEvidence(ctx.index, 'package.json', {
            anchor: /"scripts"/,
            note: 'a test script is declared but no test files exist',
          }),
        ],
      });
      return;
    }

    ctx.report({
      explanation: `No test files and no test runner were found across ${ctx.index.files.length} scanned files. Nothing in this repository verifies that it works.`,
      evidence: [
        projectEvidence(ctx.index, 'package.json', {
          anchor: /"(?:scripts|devDependencies)"/,
          note: 'no test runner declared and no test files in the tree',
        }),
      ],
    });
  },
});
