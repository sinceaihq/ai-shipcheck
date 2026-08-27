import { defineRule } from '../../core/define-rule.js';
import { MAX_FINDINGS_PER_RULE } from '../helpers.js';

/** Outbound request sinks whose URL is built by interpolation. */
const FETCH_INTERPOLATED =
  /\b(?:fetch|axios(?:\s*\.\s*(?:get|post|put|patch|delete))?|got|ky|request)\s*\(\s*`([^`]{0,300})`/g;

/** Interpolations that place request data at the start of a URL. */
const HOST_POSITION = /^\s*(?:https?:)?\/\/\$\{|^\s*\$\{/;

const REQUEST_DATA =
  /(?:req\.query|request\.query|req\.body|request\.body|searchParams|params\.|query\.|userInput|body\.)/;

export default defineRule({
  meta: {
    id: 'security/unsafe-url-construction',
    category: 'security',
    title: 'Outbound request URL host built from request data',
    severity: 'high',
    confidence: 'medium',
    description:
      'The host portion of an outbound request URL is interpolated from a value that originates in the incoming request. This is server-side request forgery: an attacker chooses which host your server connects to, and can reach cloud metadata endpoints, internal admin panels and services behind your firewall.',
    remediation:
      'Never let request data determine the host. Keep the base URL in configuration and interpolate only the path, then validate that path. If arbitrary destinations are a product requirement, resolve the URL, check the resulting hostname against an allowlist, and block private and link-local address ranges.',
    references: [
      'https://owasp.org/Top10/A10_2021-Server-Side_Request_Forgery_%28SSRF%29/',
      'https://cwe.mitre.org/data/definitions/918.html',
    ],
    tags: ['ssrf', 'owasp-a10'],
  },

  checkFile(file, ctx) {
    if (!file.isServer && file.role !== 'other') return;
    if (file.role === 'test') return;
    let reported = 0;

    for (const match of file.matches(FETCH_INTERPOLATED)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      const template = match.groups[0];
      if (template === undefined) continue;
      if (!HOST_POSITION.test(template)) continue;

      // The interpolated expression must plausibly carry request data, either
      // directly (`${req.query.host}`) or through a local binding assigned
      // from it a few lines earlier.
      const expression = /\$\{([^}]{0,120})\}/.exec(template)?.[1] ?? '';
      const directlyTainted =
        REQUEST_DATA.test(expression) || REQUEST_DATA.test(file.lineText(file.lineAt(match.index)));
      if (!directlyTainted && !bindingComesFromRequest(file.content, expression)) continue;

      reported++;
      ctx.report({
        explanation: `${file.path} builds an outbound request URL whose host comes from request data (\`${expression.trim()}\`). An attacker controls which server your backend connects to.`,
        evidence: [file.evidenceAt(match.index, { length: Math.min(match.text.length, 160) })],
      });
    }
  },
});

/**
 * True when `expression`'s root identifier is assigned from request data
 * somewhere in the module.
 *
 * This is a deliberately shallow, single-hop taint check: it catches the
 * overwhelmingly common shape (read the value into a const, interpolate it a
 * few lines later) without pretending to do real dataflow analysis.
 */
function bindingComesFromRequest(content: string, expression: string): boolean {
  const root = /^[A-Za-z_$][\w$]*/.exec(expression.trim())?.[0];
  if (root === undefined) return false;
  const assignment = new RegExp(`(?:const|let|var)\\s+${root}\\s*=\\s*[^;\\n]{0,200}`, 'g');
  let m: RegExpExecArray | null;
  while ((m = assignment.exec(content)) !== null) {
    if (REQUEST_DATA.test(m[0])) return true;
  }
  return false;
}
