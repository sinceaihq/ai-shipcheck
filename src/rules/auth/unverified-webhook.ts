import { defineRule } from '../../core/define-rule.js';
import { routeHandlers } from '../helpers.js';
import { toRoutePath } from '../security/exposed-debug-route.js';

const WEBHOOK_PATH = /(?:^|\/)(?:webhooks?|hooks?)(?:\/|$)/;

/** Signature verification across the common providers. */
const VERIFICATION =
  /(?:constructEvent|constructEventAsync|verifySignature|verifyWebhook|verifyHeader|createHmac|timingSafeEqual|Webhook\s*\(|svix|verify\s*\(\s*(?:payload|body|rawBody)|X-Hub-Signature|stripe-signature|x-signature)/i;

export default defineRule({
  meta: {
    id: 'auth/unverified-webhook',
    category: 'auth',
    title: 'Webhook endpoint does not verify its signature',
    severity: 'high',
    confidence: 'medium',
    description:
      'A webhook receiver processes the request body without verifying the provider signature. Webhook URLs are not secrets - they appear in provider dashboards, logs and error reports - so an unauthenticated endpoint that trusts its payload lets anyone forge events such as "payment succeeded" or "subscription upgraded".',
    remediation:
      'Verify the signature header against the raw request body before parsing it, using the provider SDK (stripe.webhooks.constructEvent, svix Webhook.verify) or an HMAC comparison with crypto.timingSafeEqual. Reject the request when verification fails.',
    references: [
      'https://docs.stripe.com/webhooks#verify-events',
      'https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries',
    ],
    tags: ['webhooks', 'authorization'],
  },

  appliesTo(index) {
    const webhookRoutes = index.routeFiles.filter((f) => WEBHOOK_PATH.test(toRoutePath(f.path)));
    if (webhookRoutes.length === 0) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason: 'No webhook route handlers were found in this project.',
      };
    }
    return { applicable: true };
  },

  checkFile(file, ctx) {
    if (file.role !== 'next-app-route' && file.role !== 'next-pages-api') return;
    const routePath = toRoutePath(file.path);
    if (!WEBHOOK_PATH.test(routePath)) return;
    if (VERIFICATION.test(file.text)) return;

    const handlers = routeHandlers(file).filter(
      (h) => h.method === 'POST' || h.method === 'default',
    );
    if (handlers.length === 0) return;

    ctx.report({
      title: `Webhook ${routePath} trusts unverified request bodies`,
      explanation: `${file.path} handles webhook deliveries at ${routePath} but performs no signature verification. Anyone who learns the URL can post a forged event and have it processed as genuine.`,
      evidence: [file.evidenceAt(handlers[0]!.offset, { note: routePath })],
    });
  },
});
