import { defineRule } from '../../core/define-rule.js';
import {
  hasAuthSignal,
  hasLlmCall,
  hasRateLimitSignal,
  isNonProductionFile,
  projectHasRateLimiter,
  routeHandlers,
} from '../helpers.js';
import { toRoutePath } from '../security/exposed-debug-route.js';

export default defineRule({
  meta: {
    id: 'ai-cost/llm-route-without-rate-limit',
    category: 'ai-cost',
    title: 'LLM endpoint with neither authentication nor rate limiting',
    severity: 'critical',
    confidence: 'medium',
    blocker: true,
    description:
      'A route that calls a language model is reachable without authentication and without any rate limit. Every request spends real money on your account. A single script pointed at this endpoint can run up a five-figure bill overnight, and the first signal is usually the invoice.',
    remediation:
      'Require authentication on the endpoint, then apply a per-user rate limit and a spending cap before the model call. @upstash/ratelimit works well on serverless; express-rate-limit or @fastify/rate-limit for a long-running server. Set a hard budget alert with your model provider as a backstop.',
    references: [
      'https://platform.openai.com/docs/guides/rate-limits',
      'https://owasp.org/www-project-top-10-for-large-language-model-applications/',
    ],
    tags: ['cost', 'abuse', 'llm'],
  },

  appliesTo(index) {
    const llmRoutes = index.routeFiles.filter((f) => hasLlmCall(f.code));
    if (llmRoutes.length === 0) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason: 'No route handlers that call a language model were found in this project.',
      };
    }
    return { applicable: true };
  },

  checkFile(file, ctx) {
    if (isNonProductionFile(file)) return;
    if (file.role !== 'next-app-route' && file.role !== 'next-pages-api') return;
    if (!hasLlmCall(file.code)) return;

    const authenticated = hasAuthSignal(file.text);
    const throttled = hasRateLimitSignal(file.text);
    if (authenticated && throttled) return;

    const middlewareGuards = ctx.index
      .withRole('next-middleware')
      .some((m) => hasAuthSignal(m.text) || hasRateLimitSignal(m.text));

    const routePath = toRoutePath(file.path);
    const handlers = routeHandlers(file);
    const offset = handlers[0]?.offset ?? 0;

    if (!authenticated && !throttled && !middlewareGuards) {
      ctx.report({
        title: `${routePath} calls a language model with no authentication and no rate limit`,
        severity: 'critical',
        blocker: true,
        explanation: `${file.path} invokes a language model from a publicly reachable endpoint. There is no session check, no API key check and no rate limiting anywhere in the module or in middleware. Anyone who finds this URL can spend your model budget in a loop.`,
        evidence: [file.evidenceAt(offset, { note: routePath })],
      });
      return;
    }

    if (!throttled && !projectHasRateLimiter(ctx.index) && !middlewareGuards) {
      ctx.report({
        title: `${routePath} calls a language model with no rate limit`,
        severity: 'high',
        confidence: 'medium',
        blocker: false,
        explanation: `${file.path} requires authentication but applies no rate limit before calling the model. One authenticated account - or one runaway client retry loop - can still generate unbounded spend.`,
        remediation:
          'Add a per-user rate limit and a usage quota before the model call, and return 429 when either is exceeded.',
        evidence: [file.evidenceAt(offset, { note: routePath })],
      });
    }
  },
});
