import { defineRule } from '../../core/define-rule.js';
import { isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';

/** Log calls across console and the common structured loggers. */
const LOG_CALL =
  /\b(?:console\s*\.\s*(?:log|info|warn|error|debug|trace)|logger\s*\.\s*(?:log|info|warn|error|debug|trace|fatal)|log\s*\.\s*(?:info|warn|error|debug))\s*\(/g;

/** Identifiers whose values must never reach a log sink. */
const SENSITIVE_IDENTIFIER =
  /\b(?:password|passwd|pwd|secret|token|accessToken|refreshToken|idToken|apiKey|api_key|privateKey|private_key|clientSecret|client_secret|authorization|auth_?header|creditCard|credit_card|cardNumber|card_number|cvv|ssn|sessionId|session_id|cookie|jwt|bearer)\b/i;

/** Whole-object logs that will include credentials by construction. */
const SENSITIVE_OBJECT =
  /\b(?:req|request)\s*\.\s*(?:headers|body|cookies)\b|\bprocess\s*\.\s*env\b(?!\s*\.)/;

export default defineRule({
  meta: {
    id: 'security/sensitive-data-logging',
    category: 'security',
    title: 'Credential or personal data written to logs',
    severity: 'high',
    confidence: 'medium',
    description:
      'Logging a password, token, request header set or the whole environment copies secrets into a place they were never meant to be: log aggregators, third-party monitoring vendors, terminal scrollback and support tickets. Log retention typically outlives credential rotation.',
    remediation:
      'Log an identifier instead of the value - a user id rather than a session token, a request id rather than the header block. If a structured logger is in use, configure a redaction list for these fields.',
    references: ['https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/'],
    tags: ['logging', 'secrets', 'owasp-a09'],
  },

  checkFile(file, ctx) {
    if (isNonProductionFile(file)) return;
    let reported = 0;

    for (const match of file.matches(LOG_CALL)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      const args = argumentText(file.code, match.index);
      if (args === null) continue;

      const sensitive = SENSITIVE_IDENTIFIER.exec(args);
      const wholeObject = SENSITIVE_OBJECT.exec(args);
      const hit = sensitive ?? wholeObject;
      if (hit === null) continue;

      // A log line that is itself about masking is not a leak.
      if (/mask|redact|\*\*\*/i.test(args)) continue;

      reported++;
      ctx.report({
        title: `Log call includes ${hit[0]}`,
        explanation: `${file.path} passes ${hit[0]} to a log call. Whatever that value holds is written to every log sink this process is attached to.`,
        evidence: [file.evidenceAt(match.index, { note: `logs ${hit[0]}` })],
      });
    }
  },
});

/** Text of the argument list for the call whose `(` follows `offset`. */
function argumentText(code: string, offset: number): string | null {
  const open = code.indexOf('(', offset);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < code.length && i < open + 500; i++) {
    const ch = code[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return code.slice(open + 1, i);
    }
  }
  return null;
}
