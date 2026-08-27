import { defineRule } from '../../core/define-rule.js';

export default defineRule({
  meta: {
    id: 'testing/untested-server-code',
    category: 'testing',
    title: 'Server-side code has no visible test coverage',
    severity: 'medium',
    confidence: 'low',
    description:
      'The project has tests, but none of them appear to reference the route handlers, server actions or server modules. Server code is where authorisation, data writes and payments live: a regression there is silent, expensive, and usually discovered by a user.',
    remediation:
      'Add integration tests that call each route handler directly with a fake request - assert both the happy path and the unauthenticated case. Testing the 401 is often more valuable than testing the 200.',
    tags: ['testing', 'coverage'],
  },

  appliesTo(index) {
    if (index.withRole('test').length === 0) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason: 'The project has no tests at all; testing/no-test-infrastructure covers that case.',
      };
    }
    const server = index.serverFiles.filter((f) => f.role !== 'sql' && f.role !== 'prisma-schema');
    if (server.length === 0) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason: 'No server-side modules were found in this project.',
      };
    }
    return { applicable: true };
  },

  checkProject(ctx) {
    const tests = ctx.index.withRole('test');
    const testText = tests.map((t) => t.content).join('\n');

    const serverModules = ctx.index.serverFiles.filter(
      (f) =>
        f.role === 'next-app-route' || f.role === 'next-pages-api' || f.role === 'server-actions',
    );
    if (serverModules.length === 0) return;

    const untested = serverModules.filter((file) => {
      const dir = file.path.slice(0, file.path.lastIndexOf('/'));
      const segment = dir
        .split('/')
        .filter((s) => s.length > 0 && !s.startsWith('('))
        .pop();
      if (segment === undefined) return true;
      // A test that imports the module, or merely names the route segment,
      // counts as coverage evidence. This is deliberately generous.
      if (testText.includes(file.path)) return false;
      if (testText.includes(`/${segment}`)) return false;
      const stem = file.path.replace(/\.[cm]?[jt]sx?$/, '');
      return !testText.includes(stem);
    });

    const ratio = untested.length / serverModules.length;
    if (ratio < 0.8) return;

    ctx.report({
      title: `${untested.length} of ${serverModules.length} server modules have no test referencing them`,
      explanation: `The test suite (${tests.length} file${tests.length === 1 ? '' : 's'}) does not reference ${untested.length} of the ${serverModules.length} route handlers and server actions in this project. Nothing verifies their authorisation or data-writing behaviour.`,
      evidence: untested
        .slice(0, 5)
        .map((f) => f.evidenceAt(0, { note: 'no test references this module' })),
    });
  },
});
