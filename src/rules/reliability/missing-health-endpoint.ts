import { defineRule } from '../../core/define-rule.js';
import { toRoutePath } from '../security/exposed-debug-route.js';

const HEALTH_PATH =
  /(?:^|\/)(?:health|healthz|healthcheck|health-check|ready|readyz|readiness|liveness|livez|ping|status|up)(?:\/|$)/;
const EXPRESS_HEALTH =
  /\.(?:get|all)\s*\(\s*['"`][^'"`]*\/(?:health|healthz|ready|readyz|ping|status|up)\b/;

export default defineRule({
  meta: {
    id: 'reliability/missing-health-endpoint',
    category: 'reliability',
    title: 'No health or readiness endpoint',
    severity: 'low',
    confidence: 'medium',
    description:
      'The application exposes no health endpoint. Load balancers, container orchestrators and uptime monitors all need a cheap URL that reports whether this instance can serve traffic; without one they fall back to "the port is open", which stays true long after the database connection has died.',
    remediation:
      'Add a GET /api/health route that returns 200 with a small JSON body. Keep it cheap - no authentication, no heavy queries - and add a separate readiness endpoint if you need to check dependencies before accepting traffic.',
    tags: ['operations', 'monitoring'],
  },

  appliesTo(index) {
    const hasHttpSurface =
      index.routeFiles.length > 0 || index.hasFramework('express', 'fastify', 'hono', 'nestjs');
    if (!hasHttpSurface) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason: 'This project does not expose an HTTP server that a health check would apply to.',
      };
    }
    return { applicable: true };
  },

  checkProject(ctx) {
    const hasRouteHealth = ctx.index.routeFiles.some((f) => HEALTH_PATH.test(toRoutePath(f.path)));
    if (hasRouteHealth) return;

    const hasExpressHealth = ctx.index.files.some((f) => f.isServer && EXPRESS_HEALTH.test(f.text));
    if (hasExpressHealth) return;

    // Deployment configs sometimes declare a health path handled elsewhere.
    const declared = ctx.index.findFiles((f) =>
      /^(?:fly\.toml|railway\.json|vercel\.json|Dockerfile|docker-compose\.ya?ml)$/i.test(f.path),
    );
    if (declared.some((f) => /health|HEALTHCHECK/i.test(f.content))) return;

    ctx.report({
      title: 'No health or readiness endpoint was found',
      explanation:
        'No route matching /health, /healthz, /ready or /status was found, and no deployment config declares a health check. Orchestrators and uptime monitors have nothing to probe, so a wedged instance keeps receiving traffic.',
      evidence: [
        {
          file: 'package.json',
          line: 1,
          column: 1,
          snippet: ctx.index.profile.name ?? 'project',
          note: 'No health endpoint found anywhere in the project',
        },
      ],
    });
  },
});
