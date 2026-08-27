import { defineRule } from '../../core/define-rule.js';
import { findLlmCalls, MAX_FINDINGS_PER_RULE } from '../helpers.js';

const TIMEOUT_SIGNAL =
  /(?:timeout\s*:|maxRetries\s*:|signal\s*:|AbortSignal\.timeout|AbortController|withTimeout|requestTimeout|httpAgent)/;

export default defineRule({
  meta: {
    id: 'ai-cost/missing-llm-timeout',
    category: 'ai-cost',
    title: 'Model call with no timeout',
    severity: 'medium',
    confidence: 'medium',
    description:
      'A model call has no timeout configured. Generation latency is highly variable and provider incidents routinely manifest as requests that hang rather than fail. Each hung call holds a server connection open, and on a serverless platform it bills until the function times out.',
    remediation:
      'Set an explicit timeout on the client (new OpenAI({ timeout: 30_000 }) or an AbortSignal on the request) and bound retries. Stream responses where the UI allows it, so a slow generation shows progress instead of blocking.',
    references: ['https://platform.openai.com/docs/guides/production-best-practices'],
    tags: ['cost', 'timeouts', 'llm'],
  },

  appliesTo(index) {
    if (!index.hasFramework('openai', 'anthropic', 'vercel-ai-sdk', 'langchain')) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason: 'No language model SDK was detected in this project.',
      };
    }
    return { applicable: true };
  },

  checkFile(file, ctx) {
    if (file.role === 'test') return;
    if (!file.isServer) return;
    if (TIMEOUT_SIGNAL.test(file.code)) return;

    // A timeout on the shared client module covers every call site.
    const clientModules = ctx.index.findFiles((f) =>
      /(?:^|\/)(?:lib|utils|server|services|ai)\/.*(?:openai|anthropic|ai|llm|model)/i.test(f.path),
    );
    if (clientModules.some((f) => TIMEOUT_SIGNAL.test(f.code))) return;

    let reported = 0;
    for (const call of findLlmCalls(file)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      reported++;
      ctx.report({
        explanation: `${file.path} calls the model with no timeout or abort signal configured anywhere in the module. A stalled provider request holds this connection open indefinitely.`,
        evidence: [file.evidenceAt(call.index, { length: call.text.length })],
      });
    }
  },
});
