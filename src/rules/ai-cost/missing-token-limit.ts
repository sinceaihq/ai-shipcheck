import { defineRule } from '../../core/define-rule.js';
import { callArgumentObject, findLlmCalls, MAX_FINDINGS_PER_RULE } from '../helpers.js';

/** Output-bounding options across the major SDKs. */
const TOKEN_LIMIT =
  /\b(?:max_tokens|maxTokens|maxOutputTokens|max_output_tokens|max_completion_tokens|maxCompletionTokens|stopSequences|stop_sequences|maxSteps)\b/;

export default defineRule({
  meta: {
    id: 'ai-cost/missing-token-limit',
    category: 'ai-cost',
    title: 'Model call with no output token limit',
    severity: 'medium',
    confidence: 'medium',
    description:
      'A model call does not cap its output length. Output tokens are the expensive half of most pricing, and without a cap a single request can run to the model full context window - which is both the largest possible bill for that request and the slowest possible response.',
    remediation:
      'Set max_tokens (maxTokens in the Vercel AI SDK, max_output_tokens for Gemini) to the largest response your UI can actually display. Pick the number from the product requirement, not from the model maximum.',
    references: [
      'https://platform.openai.com/docs/api-reference/chat/create#chat-create-max_completion_tokens',
      'https://docs.claude.com/en/api/messages',
    ],
    tags: ['cost', 'llm'],
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
    let reported = 0;

    for (const call of findLlmCalls(file)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      // Embeddings have no generated output to bound.
      if (call.text.includes('embeddings')) continue;
      const args = callArgumentObject(file, call.index);
      if (args === null) continue;
      if (TOKEN_LIMIT.test(args)) continue;
      // Options built elsewhere in the module still count.
      if (TOKEN_LIMIT.test(file.code)) continue;

      reported++;
      ctx.report({
        explanation: `${file.path} calls the model without max_tokens or an equivalent limit. Each request can generate output up to the model maximum, at full output-token price.`,
        evidence: [file.evidenceAt(call.index, { length: call.text.length })],
      });
    }
  },
});
