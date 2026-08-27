import { defineRule } from '../../core/define-rule.js';
import { hasAuthSignal, routeHandlers, MAX_FINDINGS_PER_RULE } from '../helpers.js';
import { toRoutePath } from '../security/exposed-debug-route.js';

/** Endpoints that are meant to be callable without a session. */
const PUBLIC_BY_DESIGN =
  /(?:^|\/)(?:auth|login|logout|signin|sign-in|signup|sign-up|register|callback|oauth|webhook|webhooks|health|healthz|ready|readyz|status|ping|public|contact|newsletter|subscribe|waitlist|feedback|revalidate|og|opengraph|sitemap|robots|cron|stripe|checkout)(?:\/|$)/;

/** Verification that replaces session auth for machine-to-machine endpoints. */
const MACHINE_AUTH =
  /(?:constructEvent|verifySignature|verifyWebhook|createHmac|timingSafeEqual|svix|CRON_SECRET|x-vercel-signature|verify_signature)/i;

/** Data-mutating access that makes a missing check materially dangerous. */
const MUTATION_EVIDENCE =
  /\.(?:insert|update|delete|upsert|create|createMany|updateMany|deleteMany|destroy|save|remove|set|add)\s*\(|\bINSERT\s+INTO\b|\bUPDATE\s+\w|\bDELETE\s+FROM\b/i;

export default defineRule({
  meta: {
    id: 'auth/unprotected-route-handler',
    category: 'auth',
    title: 'State-changing API route with no authorisation check',
    severity: 'high',
    confidence: 'medium',
    description:
      'A route handler that writes data exposes no evidence of an authentication or authorisation check. Route files in both Next.js routers are public by default - there is no implicit gate - so anyone who can reach the URL can invoke the write.',
    remediation:
      'Resolve the caller at the top of the handler and return 401 when there is none, then check that the caller is allowed to act on the specific record before writing. Shared helpers (requireUser, protectedProcedure, middleware matchers) make this consistent across routes.',
    references: [
      'https://owasp.org/Top10/A01_2021-Broken_Access_Control/',
      'https://nextjs.org/docs/app/building-your-application/routing/route-handlers',
    ],
    tags: ['authorization', 'owasp-a01'],
  },

  appliesTo(index) {
    if (index.routeFiles.length === 0) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason: 'No Next.js route handlers or API routes were found in this project.',
      };
    }
    return { applicable: true };
  },

  checkFile(file, ctx) {
    if (file.role !== 'next-app-route' && file.role !== 'next-pages-api') return;

    const routePath = toRoutePath(file.path);
    if (PUBLIC_BY_DESIGN.test(routePath)) return;
    if (MACHINE_AUTH.test(file.text)) return;
    // A check anywhere in the module (including a shared wrapper) counts.
    if (hasAuthSignal(file.text)) return;

    const handlers = routeHandlers(file);
    if (handlers.length === 0) return;

    let reported = 0;
    for (const handler of handlers) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      const isMutating =
        handler.method === 'POST' ||
        handler.method === 'PUT' ||
        handler.method === 'PATCH' ||
        handler.method === 'DELETE' ||
        (handler.method === 'default' && MUTATION_EVIDENCE.test(handler.body));
      if (!isMutating) continue;
      if (!MUTATION_EVIDENCE.test(handler.body)) continue;

      reported++;
      const label = handler.method === 'default' ? 'The handler' : `${handler.method}`;
      ctx.report({
        title: `${label} ${routePath} writes data with no authorisation check`,
        explanation: `${file.path} handles ${handler.method === 'default' ? 'requests' : handler.method} for ${routePath} and performs a write, but the module contains no recognisable authentication or authorisation check. Any unauthenticated caller can invoke it.`,
        evidence: [file.evidenceAt(handler.offset, { note: `${handler.method} ${routePath}` })],
      });
    }
  },
});
