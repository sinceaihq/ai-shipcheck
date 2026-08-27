import { defineRule } from '../../core/define-rule.js';
import { MAX_FINDINGS_PER_RULE } from '../helpers.js';

const WILDCARD_HEADER = /['"]Access-Control-Allow-Origin['"]\s*[,:]\s*['"]\*['"]/g;
const WILDCARD_HEADER_SET =
  /setHeader\s*\(\s*['"]Access-Control-Allow-Origin['"]\s*,\s*['"]\*['"]\s*\)/g;
const CORS_ORIGIN_TRUE = /(?<!['"`])\bcors\s*\(\s*\{[^}]{0,200}origin\s*:\s*(?:true|['"]\*['"])/g;
const CORS_REFLECT_ORIGIN =
  /['"]Access-Control-Allow-Origin['"]\s*[,:]\s*(?:req|request)\s*\.\s*headers\s*(?:\.\s*get\s*\(\s*['"]origin['"]\s*\)|\[?\s*['"]?origin)/g;

const CREDENTIALS =
  /Access-Control-Allow-Credentials['"]\s*[,:]\s*['"]?true|credentials\s*:\s*true/;

export default defineRule({
  meta: {
    id: 'security/permissive-cors',
    category: 'security',
    title: 'Permissive CORS configuration',
    severity: 'high',
    confidence: 'high',
    description:
      'The API accepts cross-origin requests from any origin. On its own that exposes every unauthenticated endpoint to any website; combined with credentialed requests it lets any site read authenticated responses on behalf of a logged-in visitor.',
    remediation:
      'Replace the wildcard with an explicit allowlist of origins you control, read from configuration. If credentials are needed, the origin must be a single concrete value - the CORS specification forbids "*" with credentials, and reflecting the request Origin header back is equivalent to allowing everything.',
    references: [
      'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS',
      'https://portswigger.net/web-security/cors',
    ],
    tags: ['cors', 'owasp-a05'],
  },

  checkFile(file, ctx) {
    if (file.role === 'test') return;
    let reported = 0;
    const hasCredentials = CREDENTIALS.test(file.text);

    const emit = (index: number, length: number, what: string): void => {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      reported++;
      ctx.report({
        title: hasCredentials
          ? `${what} combined with credentialed requests`
          : `${what} allows any origin`,
        severity: hasCredentials ? 'critical' : 'high',
        explanation: hasCredentials
          ? `${file.path} allows any origin *and* enables credentialed cross-origin requests. Any website a logged-in user visits can call this API as them and read the response.`
          : `${file.path} allows any origin to call this API. Every endpoint it covers is reachable from any page on the internet.`,
        evidence: [file.evidenceAt(index, { length })],
      });
    };

    for (const m of file.matchesText(WILDCARD_HEADER))
      emit(m.index, m.text.length, 'Access-Control-Allow-Origin: *');
    for (const m of file.matchesText(WILDCARD_HEADER_SET))
      emit(m.index, m.text.length, 'Access-Control-Allow-Origin: *');
    for (const m of file.matchesText(CORS_ORIGIN_TRUE))
      emit(m.index, Math.min(m.text.length, 80), 'cors({ origin: true })');
    for (const m of file.matchesText(CORS_REFLECT_ORIGIN)) {
      emit(m.index, Math.min(m.text.length, 120), 'Reflecting the request Origin header');
    }
  },
});
