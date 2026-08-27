import { defineRule } from '../../core/define-rule.js';
import { isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';

const FETCH_CALL = /\bfetch\s*\(/g;

/** Constructs that bound how long a request may take. */
const TIMEOUT_SIGNAL =
  /(?:signal\s*:|AbortSignal\.timeout|AbortController|timeout\s*:|requestTimeout|withTimeout|Promise\.race)/;

export default defineRule({
  meta: {
    id: 'reliability/missing-fetch-timeout',
    category: 'reliability',
    title: 'Outbound request with no timeout',
    severity: 'medium',
    confidence: 'medium',
    description:
      'fetch has no default timeout in Node. A dependency that stops responding - rather than failing - holds the request open indefinitely, and every inbound request waiting on it holds a connection too. This is how a slow third party turns into a full outage.',
    remediation:
      'Pass a signal: AbortSignal.timeout(5000) to every outbound fetch, or wrap calls in a small helper that applies a default. Pair it with a retry budget so a slow dependency degrades instead of cascading.',
    references: ['https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static'],
    tags: ['timeouts', 'resilience'],
  },

  appliesTo(index) {
    if (
      index.routeFiles.length === 0 &&
      index.withRole('server-actions', 'server-module').length === 0
    ) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason:
          'No request-handling code was found. A missing timeout matters where a hung upstream holds a client connection open.',
      };
    }
    return { applicable: true };
  },

  checkFile(file, ctx) {
    // Restricted to code that serves requests. A missing timeout in a build
    // script or a shared utility is worth far less than one in a route
    // handler, and reporting every fetch in a codebase amounts to reporting
    // that the codebase uses fetch.
    if (
      file.role !== 'next-app-route' &&
      file.role !== 'next-pages-api' &&
      file.role !== 'server-actions' &&
      file.role !== 'next-middleware' &&
      file.role !== 'server-module'
    ) {
      return;
    }
    if (isNonProductionFile(file)) return;
    // A module-level timeout helper covers everything in the file.
    if (TIMEOUT_SIGNAL.test(file.code)) return;

    let reported = 0;
    for (const match of file.matches(FETCH_CALL)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      reported++;
      ctx.report({
        explanation: `${file.path} calls fetch() with no AbortSignal or timeout anywhere in the module. If the remote host accepts the connection and then stalls, this request never completes.`,
        evidence: [file.evidenceAt(match.index, { length: match.text.length })],
      });
    }
  },
});
