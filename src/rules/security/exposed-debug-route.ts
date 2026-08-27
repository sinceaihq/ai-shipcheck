import { defineRule } from '../../core/define-rule.js';
import { hasAuthSignal, routeHandlers, MAX_FINDINGS_PER_RULE } from '../helpers.js';

/** Route path segments that indicate an endpoint never meant for production. */
const DEBUG_SEGMENT =
  /(?:^|\/)(?:debug|_debug|test|_test|dev|_dev|internal|_internal|admin-?tools?|seed|reset|migrate|__)(?:\/|$)/;

/** Guards that keep a route out of production. */
const ENV_GUARD =
  /NODE_ENV\s*(?:===|!==|==|!=)\s*['"](?:production|development)['"]|process\.env\.VERCEL_ENV|isProduction|isDev\b|__DEV__/;

export default defineRule({
  meta: {
    id: 'security/exposed-debug-route',
    category: 'security',
    title: 'Debug or maintenance route exposed in production',
    severity: 'high',
    confidence: 'medium',
    description:
      'A route whose path identifies it as a debug, seed, reset or internal endpoint has no authentication check and no environment guard. These endpoints are written for local convenience and routinely dump configuration, reset data or bypass business logic.',
    remediation:
      'Delete the route before deploying, or guard it with both an authentication check and an explicit environment check that returns 404 outside development.',
    tags: ['exposure', 'owasp-a01'],
  },

  checkFile(file, ctx) {
    if (file.role !== 'next-app-route' && file.role !== 'next-pages-api') return;

    const routePath = toRoutePath(file.path);
    if (!DEBUG_SEGMENT.test(routePath)) return;
    if (ENV_GUARD.test(file.text)) return;
    if (hasAuthSignal(file.text)) return;

    const handlers = routeHandlers(file);
    const offset = handlers[0]?.offset ?? 0;
    if (handlers.length === 0) return;

    ctx.report({
      title: `Debug route ${routePath} is publicly reachable`,
      explanation: `${file.path} defines the endpoint ${routePath}. Its path marks it as a debug or maintenance route, but it contains neither an authentication check nor an environment guard, so it is callable by anyone once deployed.`,
      evidence: [file.evidenceAt(offset, { note: routePath })],
    });
    void MAX_FINDINGS_PER_RULE;
  },
});

/** Convert a route file path into the URL path it serves. */
export function toRoutePath(filePath: string): string {
  let p = filePath.replace(/^src\//, '');
  p = p
    .replace(/^app\//, '/')
    .replace(/^pages\/api\//, '/api/')
    .replace(/^pages\//, '/');
  p = p.replace(/\/(?:route|page)\.[cm]?[jt]sx?$/, '');
  p = p.replace(/\.[cm]?[jt]sx?$/, '');
  p = p.replace(/\/index$/, '');
  p = p.replace(/\/\([^/]+\)/g, ''); // Next.js route groups
  return p === '' ? '/' : p;
}
