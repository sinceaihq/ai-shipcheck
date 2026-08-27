import { defineRule } from '../../core/define-rule.js';
import { maskValue } from '../../utils/mask.js';
import { isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';
import { isPlaceholderValue, matchSignature, shannonEntropy } from './secret-patterns.js';

/** Minimum length before entropy analysis is worth running. */
const MIN_ENTROPY_LENGTH = 24;
/** Bits per character above which a string is credential-shaped. */
const ENTROPY_THRESHOLD = 3.6;

/** Assignment targets that make a high-entropy literal credible as a secret. */
const SECRET_ASSIGNMENT =
  /(?:const|let|var|readonly|public|private)?\s*([A-Za-z_$][\w$]*)\s*[:=]\s*$/;

const SECRET_NAME =
  /(?:secret|token|password|passwd|pwd|apikey|api_key|accesskey|access_key|privatekey|private_key|credential|auth|clientsecret|client_secret|dsn|connectionstring|connection_string)/i;

export default defineRule({
  meta: {
    id: 'security/hardcoded-secret',
    category: 'security',
    title: 'Hardcoded credential in source',
    severity: 'critical',
    confidence: 'high',
    blocker: true,
    description:
      'A credential appears to be written directly into source code. Anything committed to a repository must be treated as public: it is in the git history forever, it is copied into every clone, and it is readable by every CI job and every contributor.',
    remediation:
      'Move the value into an environment variable, read it with process.env at runtime, and rotate the exposed credential immediately - removing the line is not enough once it has been committed.',
    references: [
      'https://owasp.org/Top10/A05_2021-Security_Misconfiguration/',
      'https://docs.github.com/en/code-security/secret-scanning',
    ],
    tags: ['secrets', 'owasp-a05'],
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
    // Example and template env files exist precisely to hold placeholders.
    if (/\.env\.(?:example|sample|template)$/.test(file.path)) return;

    let reported = 0;

    if (file.role === 'env') {
      // Environment files are not JavaScript: `//` inside a connection string
      // is not a comment, so the lexer's views must not be used here.
      const assignment = /^[ \t]*(?:export[ \t]+)?([A-Z0-9_]{3,})[ \t]*=[ \t]*(.+)$/gm;
      let m: RegExpExecArray | null;
      while ((m = assignment.exec(file.content)) !== null) {
        if (reported >= MAX_FINDINGS_PER_RULE) return;
        const match = { index: m.index, groups: [m[1], m[2]] as const };
        const name = match.groups[0];
        const rawValue = match.groups[1];
        if (name === undefined || rawValue === undefined) continue;
        const value = rawValue.trim().replace(/^["']|["']$/g, '');
        const verdict = classify(value, name);
        if (verdict === null) continue;
        reported++;
        ctx.report({
          title: `${verdict.label} in committed environment file`,
          confidence: verdict.confidence,
          explanation: `${file.path} defines ${name} with what looks like a real ${verdict.label.toLowerCase()} (${maskValue(value)}). This file is not excluded by .gitignore, so the value is part of the repository.`,
          remediation:
            'Remove the value from the committed file, add the file to .gitignore, keep a .env.example with placeholders, and rotate the credential.',
          evidence: [file.evidenceAt(match.index, { note: `${name} = ${maskValue(value)}` })],
        });
      }
      return;
    }

    if (isNonProductionFile(file)) return;

    const content = file.content;
    for (const literal of file.strings) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      if (literal.interpolated) continue;
      const value = literal.value;
      if (value.length < 12 || value.length > 512) continue;

      const before = content.slice(Math.max(0, literal.start - 80), literal.start);
      const assignment = SECRET_ASSIGNMENT.exec(before);
      const assignedTo = assignment?.[1] ?? null;

      const verdict = classify(value, assignedTo);
      if (verdict === null) continue;

      reported++;
      ctx.report({
        title: `${verdict.label} hardcoded in source`,
        confidence: verdict.confidence,
        explanation:
          verdict.confidence === 'high'
            ? `A literal matching the format of ${verdict.label.toLowerCase()} (${maskValue(value)}) is written directly into ${file.path}.`
            : `${file.path} assigns a high-entropy literal (${maskValue(value)}) to ${assignedTo ?? 'a credential-named binding'}, which is the shape of a hardcoded credential rather than configuration.`,
        evidence: [file.evidenceAt(literal.start, { note: maskValue(value) })],
      });
    }
  },
});

interface Verdict {
  readonly label: string;
  readonly confidence: 'high' | 'medium';
}

/**
 * Decide whether a literal is a credential.
 *
 * Order matters: placeholders are rejected first, then exact provider formats
 * are accepted at high confidence, and only then is entropy considered - and
 * entropy alone is never enough without a credential-shaped binding name.
 */
function classify(value: string, assignedTo: string | null): Verdict | null {
  if (isPlaceholderValue(value)) return null;

  const signature = matchSignature(value);
  if (signature !== null) {
    return { label: signature.name, confidence: 'high' };
  }

  if (assignedTo === null || !SECRET_NAME.test(assignedTo)) return null;
  if (value.length < MIN_ENTROPY_LENGTH) return null;
  // Reject anything that is plainly not an opaque token.
  if (/\s/.test(value)) return null;
  if (value.startsWith('http://') || value.startsWith('https://')) return null;
  if (value.startsWith('./') || value.startsWith('../') || value.startsWith('/')) return null;
  if (/^[a-z]+(?:[-_.][a-z0-9]+)+$/.test(value)) return null; // kebab/snake identifier
  // Opaque credentials are base62/base64url. Anything containing regular
  // expression or glob metacharacters is a pattern, not a secret - which is
  // exactly what a file full of detection patterns looks like.
  if (/[|\\()[\]{}*+^$?<>!]/.test(value)) return null;
  if (shannonEntropy(value) < ENTROPY_THRESHOLD) return null;

  return { label: 'Credential', confidence: 'medium' };
}
