import { defineRule } from '../../core/define-rule.js';
import { MAX_FINDINGS_PER_RULE } from '../helpers.js';

const NEXT_IGNORE_ERRORS = /(?:ignoreBuildErrors|ignoreDuringBuilds)\s*:\s*true/g;
const TS_STRICT_OFF = /"strict"\s*:\s*false/g;
const DEBUG_TRUE = /\bdebug\s*:\s*true/g;

export default defineRule({
  meta: {
    id: 'reliability/debug-mode-in-production',
    category: 'reliability',
    title: 'Build safety checks disabled',
    severity: 'high',
    confidence: 'high',
    description:
      'The build is configured to ignore TypeScript or ESLint errors, or type checking is switched off entirely. This is the single most common way an AI-generated project ships code that never compiled: the failing check is disabled to get a green build, and every error it would have caught reaches production instead.',
    remediation:
      'Remove ignoreBuildErrors and ignoreDuringBuilds, turn TypeScript strict mode on, and fix the errors that surface. If some are genuinely not worth fixing now, suppress them individually with a comment explaining why, so the check keeps working everywhere else.',
    references: [
      'https://nextjs.org/docs/app/api-reference/config/next-config-js/typescript',
      'https://www.typescriptlang.org/tsconfig/#strict',
    ],
    tags: ['configuration', 'build'],
  },

  fileExtensions: ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.json'],

  checkFile(file, ctx) {
    // This rule exists to inspect build configuration, so it deliberately does
    // not use the shared non-production guard - that guard excludes files with
    // the `config` role, which is precisely what is being checked here.
    if (/(?:^|\/)(?:examples?|templates?|fixtures?|__tests__|e2e)\//i.test(file.path)) return;
    let reported = 0;

    if (/^(?:src\/)?next\.config\.[cm]?[jt]s$/.test(file.path)) {
      for (const match of file.matches(NEXT_IGNORE_ERRORS)) {
        if (reported >= MAX_FINDINGS_PER_RULE) return;
        reported++;
        const which = match.text.includes('ignoreBuildErrors') ? 'TypeScript' : 'ESLint';
        ctx.report({
          title: `next.config disables ${which} checks during builds`,
          explanation: `${file.path} sets ${match.text.trim()}, so the production build succeeds even when ${which} reports errors. Whatever those errors are, they ship.`,
          evidence: [file.evidenceAt(match.index, { length: match.text.length })],
        });
      }
    }

    if (file.path === 'tsconfig.json') {
      for (const match of file.matchesText(TS_STRICT_OFF)) {
        if (reported >= MAX_FINDINGS_PER_RULE) return;
        reported++;
        ctx.report({
          title: 'TypeScript strict mode is disabled',
          severity: 'medium',
          explanation:
            'tsconfig.json sets "strict": false, so null and undefined are not tracked and implicit any is allowed. The most common runtime crash in a TypeScript codebase - reading a property of undefined - is exactly what strict mode prevents.',
          remediation:
            'Set "strict": true. If the codebase has too many errors to fix at once, enable strictNullChecks first and work through the rest incrementally.',
          evidence: [file.evidenceAt(match.index, { length: match.text.length })],
        });
      }
    }

    if (file.isServer && file.role !== 'test' && file.role !== 'config') {
      for (const match of file.matches(DEBUG_TRUE)) {
        if (reported >= MAX_FINDINGS_PER_RULE) return;
        const line = file.lineText(file.lineAt(match.index));
        if (/NODE_ENV|process\.env|isDev|development/.test(line)) continue;
        reported++;
        ctx.report({
          title: 'Debug mode hardcoded on in server code',
          severity: 'medium',
          confidence: 'medium',
          explanation: `${file.path} sets debug: true unconditionally. Debug modes typically log request bodies and internal state, and disable optimisations.`,
          remediation:
            'Drive the flag from an environment variable so it is off in production by default.',
          evidence: [file.evidenceAt(match.index, { length: match.text.length })],
        });
      }
    }
  },
});
