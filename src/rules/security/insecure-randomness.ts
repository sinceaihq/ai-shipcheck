import { defineRule } from '../../core/define-rule.js';
import { isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';

const MATH_RANDOM = /Math\s*\.\s*random\s*\(\s*\)/g;

/**
 * Only fire when the value is used for something security-relevant. Math.random
 * for a loading-skeleton delay or a demo dataset is entirely fine.
 */
const SECURITY_CONTEXT =
  /\b(?:token|secret|password|passwd|otp|code|nonce|salt|session|apikey|api_key|key|uuid|guid|id|reset|verification|verify|invite|coupon|csrf)\b/i;

export default defineRule({
  meta: {
    id: 'security/insecure-randomness',
    category: 'security',
    title: 'Security value generated with Math.random()',
    severity: 'high',
    confidence: 'medium',
    description:
      'Math.random() is a fast, seeded pseudo-random generator with no cryptographic guarantees. Its output is predictable from previous values, so tokens, password-reset codes, session identifiers and nonces built from it can be guessed.',
    remediation:
      'Use crypto.randomUUID() for identifiers and crypto.randomBytes(32).toString("hex") for tokens - both are available in Node without a dependency, and crypto.getRandomValues() is the browser equivalent.',
    references: [
      'https://nodejs.org/api/crypto.html#cryptorandomuuidoptions',
      'https://cwe.mitre.org/data/definitions/338.html',
    ],
    tags: ['crypto', 'owasp-a02'],
  },

  checkFile(file, ctx) {
    if (isNonProductionFile(file)) return;
    let reported = 0;

    for (const match of file.matches(MATH_RANDOM)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      const line = file.lineAt(match.index);
      const context = [file.lineText(line - 1), file.lineText(line), file.lineText(line + 1)].join(
        '\n',
      );
      const hit = SECURITY_CONTEXT.exec(context);
      if (hit === null) continue;

      reported++;
      ctx.report({
        title: `Math.random() used to build a ${hit[0].toLowerCase()}`,
        explanation: `${file.path} derives a value named around "${hit[0]}" from Math.random(). Its output is predictable, so an attacker who observes a few values can generate the next ones.`,
        evidence: [file.evidenceAt(match.index, { length: match.text.length })],
      });
    }
  },
});
