import { defineRule } from '../../core/define-rule.js';

/** Command fragments that indicate a given check runs in CI. */
const CHECK_PATTERNS: Readonly<Record<string, RegExp>> = {
  tests:
    /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|\bvitest\b|\bjest\b|\bplaywright\s+test\b|\bcypress\s+run\b|\bnode\s+--test\b|\bgo\s+test\b/,
  build:
    /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?build\b|\bnext\s+build\b|\bvite\s+build\b|\btsc\s+-b\b/,
  typecheck: /\btypecheck\b|\btype-check\b|\btsc\s+(?:--noEmit|-p|--project)/,
};

export default defineRule({
  meta: {
    id: 'testing/ci-missing-checks',
    category: 'testing',
    title: 'CI pipeline is missing a core check',
    severity: 'medium',
    confidence: 'medium',
    description:
      'A continuous integration workflow exists but does not run one or more of the checks that would catch a broken change before it merges. A pipeline that only lints gives the reassuring appearance of automated verification without any of the substance.',
    remediation:
      'Add the missing steps to the workflow so tests, the production build and type checking all run on pull requests, and make them required for merge.',
    references: ['https://docs.github.com/en/actions/writing-workflows/quickstart'],
    tags: ['ci', 'testing'],
  },

  appliesTo(index) {
    if (index.withRole('ci').length === 0) {
      return {
        applicable: false,
        status: 'unassessed',
        reason: 'No CI workflow files were found, so pipeline steps could not be inspected.',
      };
    }
    return { applicable: true };
  },

  checkProject(ctx) {
    const workflows = ctx.index.withRole('ci');
    const combined = workflows.map((w) => w.content).join('\n');

    const missing: string[] = [];
    for (const [name, pattern] of Object.entries(CHECK_PATTERNS)) {
      if (name === 'typecheck' && !ctx.index.profile.languages.includes('typescript')) continue;
      if (name === 'tests' && ctx.index.withRole('test').length === 0) continue;
      if (!pattern.test(combined)) missing.push(name);
    }

    if (missing.length === 0) return;

    const first = workflows[0]!;
    ctx.report({
      title: `CI does not run: ${missing.join(', ')}`,
      severity: missing.includes('tests') ? 'medium' : 'low',
      explanation: `The ${workflows.length} workflow file${workflows.length === 1 ? '' : 's'} in .github/workflows contain no step that runs ${missing.join(' or ')}. A change that breaks ${missing[0]} merges without anything noticing.`,
      evidence: [first.evidenceAt(0, { note: `missing: ${missing.join(', ')}` })],
    });
  },
});
