import { defineRule } from '../../core/define-rule.js';
import {
  isNonProductionFile,
  looksLikeSecretEnvName,
  stripPublicPrefix,
  MAX_FINDINGS_PER_RULE,
} from '../helpers.js';

/**
 * Matches `process.env.NEXT_PUBLIC_X`, `import.meta.env.VITE_X` and the
 * bracket forms of both.
 */
const PUBLIC_ENV_ACCESS =
  /(?:process\.env|import\.meta\.env)\s*(?:\.\s*([A-Z][A-Z0-9_]*)|\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\])/g;

const PUBLIC_PREFIX =
  /^(?:NEXT_PUBLIC_|VITE_|PUBLIC_|REACT_APP_|GATSBY_|NUXT_PUBLIC_|EXPO_PUBLIC_)/;

export default defineRule({
  meta: {
    id: 'security/public-env-secret',
    category: 'security',
    title: 'Secret exposed through a browser-visible environment variable',
    severity: 'critical',
    confidence: 'high',
    blocker: true,
    description:
      'Environment variables prefixed NEXT_PUBLIC_, VITE_, REACT_APP_ and similar are inlined into the JavaScript bundle at build time. Anyone who opens devtools can read them. A name in that namespace that refers to a secret, private key or service-role credential is published to every visitor.',
    remediation:
      'Drop the public prefix and read the variable only in server code (a route handler, server action, or API route). If the browser genuinely needs the capability, proxy it through a server endpoint that holds the credential. Rotate the exposed value.',
    references: [
      'https://nextjs.org/docs/app/guides/environment-variables',
      'https://vite.dev/guide/env-and-mode',
    ],
    tags: ['secrets', 'client-exposure'],
  },

  checkFile(file, ctx) {
    if (isNonProductionFile(file)) return;
    let reported = 0;
    const seen = new Set<string>();
    for (const match of file.matchesText(PUBLIC_ENV_ACCESS)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      const name = match.groups[0] ?? match.groups[1];
      if (name === undefined) continue;
      if (!PUBLIC_PREFIX.test(name)) continue;
      if (seen.has(name)) continue;
      const bare = stripPublicPrefix(name);
      if (!looksLikeSecretEnvName(bare)) continue;
      seen.add(name);
      reported++;
      ctx.report({
        title: `${name} is bundled into client JavaScript`,
        explanation: `${name} carries a public build-time prefix, so its value is inlined into the browser bundle. The name indicates a credential (${bare}), which means the secret ships to every visitor.`,
        evidence: [file.evidenceAt(match.index, { length: match.text.length, note: name })],
      });
    }
  },
});
