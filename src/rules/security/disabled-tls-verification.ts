import { defineRule } from '../../core/define-rule.js';
import { isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';

/**
 * `NODE_TLS_REJECT_UNAUTHORIZED = 0`, in the forms it actually appears:
 * a property assignment, a bracket assignment, a shell export, or a bare line
 * in an env file. Requiring one of those prefixes keeps the rule from firing
 * on the variable name quoted as text.
 */
const TLS_ENV =
  /(?:process\s*\.\s*env\s*\.|env\s*\.|process\s*\.\s*env\s*\[\s*['"]|export\s+|^[ \t]*)NODE_TLS_REJECT_UNAUTHORIZED(?:['"]\s*\])?\s*[:=]\s*['"]?0['"]?/gm;
const REJECT_UNAUTHORIZED = /rejectUnauthorized\s*:\s*false/g;
const INSECURE_AGENT =
  /strictSSL\s*:\s*false|insecureHTTPParser\s*:\s*true|checkServerIdentity\s*:\s*\(\s*\)\s*=>/g;

/**
 * An explicit, user-facing opt-in to insecure transport.
 *
 * An HTTP client that offers an `--insecure` flag, the way curl does, is not
 * the same thing as a server that silently trusts any certificate. When the
 * disabling is visibly gated on such an option the trade-off was made
 * deliberately, and reporting it as a deployment blocker is wrong.
 */
const OPT_IN_INSECURE =
  /\b(?:options|opts|args|argv|flags|config|settings)\s*(?:\?\.)?\.\s*(?:insecure|allowInsecure|skipTlsVerify|ignoreSsl|selfSigned|noStrictSsl)\b|--insecure|\bif\s*\(\s*[\w$.]*insecure/i;

export default defineRule({
  meta: {
    id: 'security/disabled-tls-verification',
    category: 'security',
    title: 'TLS certificate verification disabled',
    severity: 'critical',
    confidence: 'high',
    blocker: true,
    description:
      'Turning off certificate verification makes every outbound HTTPS request accept any certificate, including one presented by an attacker on the network path. The connection is still encrypted, but to whoever is in the middle - which is strictly worse than plain HTTP, because it looks secure.',
    remediation:
      'Remove the override. If you need to trust a private certificate authority, add its certificate with NODE_EXTRA_CA_CERTS or pass a ca option, rather than disabling verification for every host.',
    references: [
      'https://nodejs.org/api/cli.html#node_tls_reject_unauthorizedvalue',
      'https://cwe.mitre.org/data/definitions/295.html',
    ],
    tags: ['tls', 'owasp-a02'],
  },

  fileExtensions: [
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.ts',
    '.tsx',
    '.mts',
    '.cts',
    '.env',
    '.yml',
    '.yaml',
  ],

  checkFile(file, ctx) {
    if (isNonProductionFile(file)) return;
    let reported = 0;
    const emit = (index: number, length: number, what: string): void => {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      const line = file.lineAt(index);
      const context = [line - 3, line - 2, line - 1, line]
        .filter((n) => n >= 1)
        .map((n) => file.lineText(n))
        .join('\n');
      if (OPT_IN_INSECURE.test(context)) return;
      reported++;
      ctx.report({
        title: `${what} disables TLS certificate verification`,
        explanation: `${file.path} sets ${what}, so outbound TLS connections accept any certificate. Anyone able to intercept traffic can read and modify it undetected.`,
        evidence: [file.evidenceAt(index, { length })],
      });
    };

    for (const m of file.matchesText(TLS_ENV))
      emit(m.index, m.text.length, 'NODE_TLS_REJECT_UNAUTHORIZED=0');
    for (const m of file.matches(REJECT_UNAUTHORIZED))
      emit(m.index, m.text.length, 'rejectUnauthorized: false');
    for (const m of file.matches(INSECURE_AGENT)) emit(m.index, m.text.length, m.text.trim());
  },
});
