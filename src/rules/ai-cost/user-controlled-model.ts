import { defineRule } from '../../core/define-rule.js';
import { callArgumentObject, findLlmCalls, MAX_FINDINGS_PER_RULE } from '../helpers.js';

/** A `model:` option whose value comes from the request. */
const MODEL_FROM_REQUEST =
  /\bmodel\s*:\s*(?:[\w$]*\breq(?:uest)?\b|[\w$]*\bbody\b|[\w$]*\bparams\b|[\w$]*\bquery\b|[\w$]*\bsearchParams\b|[\w$]*\binput\b\.)/;

/** Validation that constrains the value to a known set. */
const VALIDATED =
  /(?:ALLOWED_MODELS|allowedModels|MODEL_MAP|modelMap|z\.enum|includes\s*\(|\bin\s+MODELS|switch\s*\(|\?\?\s*['"])/;

export default defineRule({
  meta: {
    id: 'ai-cost/user-controlled-model',
    category: 'ai-cost',
    title: 'Model identifier taken from the request',
    severity: 'high',
    confidence: 'medium',
    description:
      'The model name is read from the request body or query without being checked against an allowlist. Model pricing varies by more than an order of magnitude, so a caller who changes one string in a JSON body can multiply the cost of every request they make - and can also opt into models you have not evaluated for safety or data handling.',
    remediation:
      'Map a small set of product-level choices ("fast", "quality") onto concrete model ids server-side, or validate the incoming value against an explicit allowlist and reject anything else. Never pass a request-supplied string straight through as the model id.',
    references: ['https://owasp.org/www-project-top-10-for-large-language-model-applications/'],
    tags: ['cost', 'abuse', 'llm'],
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
    if (VALIDATED.test(file.code)) return;
    let reported = 0;

    for (const call of findLlmCalls(file)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      const args = callArgumentObject(file, call.index);
      if (args === null) continue;
      if (!MODEL_FROM_REQUEST.test(args)) continue;

      reported++;
      ctx.report({
        explanation: `${file.path} passes a model identifier that originates in the request. A caller can select the most expensive model available on your account, on every request.`,
        evidence: [file.evidenceAt(call.index, { length: call.text.length })],
      });
    }
  },
});
