import { defineRule } from '../../core/define-rule.js';
import { isClientReachable, MAX_FINDINGS_PER_RULE } from '../helpers.js';

const BROWSER_ESCAPE_HATCH = /dangerouslyAllowBrowser\s*:\s*true/g;
const PUBLIC_MODEL_KEY =
  /(?:NEXT_PUBLIC_|VITE_|PUBLIC_|REACT_APP_|EXPO_PUBLIC_)(?:OPENAI|ANTHROPIC|CLAUDE|GEMINI|GOOGLE_AI|MISTRAL|GROQ|COHERE|REPLICATE|TOGETHER|OPENROUTER|HUGGINGFACE|DEEPSEEK)[A-Z0-9_]*(?:KEY|TOKEN|SECRET)/g;

export default defineRule({
  meta: {
    id: 'ai-cost/ai-key-exposed-to-client',
    category: 'ai-cost',
    title: 'Model provider API key reachable from the browser',
    severity: 'critical',
    confidence: 'high',
    blocker: true,
    description:
      'A model provider key is exposed to client-side code, either through a public environment prefix or by constructing the SDK client with dangerouslyAllowBrowser. Provider keys are account-level credentials with no per-key spending limit by default: anyone who reads it from the bundle can spend your entire budget and access every model on the account.',
    remediation:
      'Keep the key on the server and call the provider from a route handler that the browser talks to instead. Remove dangerouslyAllowBrowser, drop the public prefix from the variable name, and rotate the key - assume it is compromised the moment it reaches a bundle.',
    references: [
      'https://platform.openai.com/docs/guides/production-best-practices',
      'https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety',
    ],
    tags: ['cost', 'secrets', 'llm'],
  },

  checkFile(file, ctx) {
    let reported = 0;

    for (const match of file.matches(BROWSER_ESCAPE_HATCH)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      reported++;
      ctx.report({
        title: 'SDK client constructed with dangerouslyAllowBrowser: true',
        explanation: `${file.path} disables the SDK guard that prevents it from running in a browser. That guard exists because doing so puts your provider API key in code the user can read.`,
        evidence: [file.evidenceAt(match.index, { length: match.text.length })],
      });
    }

    for (const match of file.matches(PUBLIC_MODEL_KEY)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      reported++;
      ctx.report({
        title: `${match.text} is inlined into the client bundle`,
        explanation: `${file.path} reads a model provider key from ${match.text}. The public prefix means the value is compiled into the JavaScript every visitor downloads.`,
        evidence: [file.evidenceAt(match.index, { length: match.text.length })],
      });
    }

    // A key read without a public prefix but inside client-reachable code.
    if (!isClientReachable(file)) return;
    const provider =
      /process\.env\.(?:OPENAI|ANTHROPIC|GEMINI|MISTRAL|GROQ|COHERE)[A-Z0-9_]*(?:KEY|TOKEN|SECRET)/g;
    for (const match of file.matches(provider)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      reported++;
      ctx.report({
        title: `Model provider key referenced in client-reachable module ${file.path}`,
        confidence: 'medium',
        explanation: `${file.path} is client-reachable${file.isClientComponent ? ' (it is marked "use client")' : ''} and reads ${match.text}. Server-only environment variables are undefined in the browser, so this either fails at runtime or the value is being inlined.`,
        evidence: [file.evidenceAt(match.index, { length: match.text.length })],
      });
    }
  },
});
