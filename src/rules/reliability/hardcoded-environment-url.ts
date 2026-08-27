import { defineRule } from '../../core/define-rule.js';
import { isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';

const LOCAL_URL =
  /['"`](https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d{2,5})?[^'"`\s]{0,120})['"`]/g;

/** Places where a localhost default is legitimate. */
const ACCEPTABLE_CONTEXT =
  /(?:process\.env|import\.meta\.env|\?\?|\|\||NODE_ENV|isDev|development|fallback|default|=\s*['"`]https?:\/\/(?:localhost|127)[^'"`]*['"`]\s*[,)}])/;

export default defineRule({
  meta: {
    id: 'reliability/hardcoded-environment-url',
    category: 'reliability',
    title: 'Localhost URL hardcoded in application code',
    severity: 'medium',
    confidence: 'medium',
    description:
      'A localhost URL is written directly into application code with no environment fallback. It works on the machine it was written on and fails in every deployed environment - usually as a connection refused error at the moment a user tries the feature, not at startup.',
    remediation:
      'Read the base URL from an environment variable and use the localhost value only as an explicit development default: process.env.API_URL ?? "http://localhost:3000". Validate required URLs at startup so a missing value fails the deploy instead of the request.',
    references: ['https://12factor.net/config'],
    tags: ['configuration'],
  },

  checkFile(file, ctx) {
    if (isNonProductionFile(file)) return;
    // A localhost default in an email template, a constants list of candidate
    // local endpoints, or a dev script is normal. What breaks in production is
    // a localhost URL that a request path actually calls.
    if (
      file.role !== 'next-app-route' &&
      file.role !== 'next-pages-api' &&
      file.role !== 'server-actions' &&
      file.role !== 'next-middleware' &&
      file.role !== 'server-module'
    ) {
      return;
    }
    let reported = 0;

    for (const match of file.matchesText(LOCAL_URL)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      const line = file.lineAt(match.index);
      const context = [file.lineText(line - 1), file.lineText(line)].join('\n');
      if (ACCEPTABLE_CONTEXT.test(context)) continue;

      reported++;
      ctx.report({
        explanation: `${file.path} hardcodes ${match.groups[0] ?? 'a localhost URL'} with no environment override. This request fails everywhere except a developer machine.`,
        evidence: [file.evidenceAt(match.index, { length: Math.min(match.text.length, 140) })],
      });
    }
  },
});
