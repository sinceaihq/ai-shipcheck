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

/**
 * The literal is the example text of a form field: `placeholder="sk-..."` in
 * JSX, or `placeholder: '...'` in a field definition. It is rendered to every
 * visitor by design, and it is there to show what a key looks like.
 */
const PLACEHOLDER_ATTRIBUTE = /\bplaceholder\s*[:=]\s*\{?\s*$/;

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
      if (PLACEHOLDER_ATTRIBUTE.test(before)) continue;
      const assignment = SECRET_ASSIGNMENT.exec(before);
      const assignedTo = assignment?.[1] ?? null;

      const verdict = classify(value, assignedTo, { inSource: true });
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
 *
 * @param options.inSource - The value is a string literal in program source,
 *   where a literal on a credential-named binding is very often a *name* - an
 *   error code, a storage key, a label. In an environment file the right-hand
 *   side is always a configured value, so that reading does not apply there.
 */
function classify(
  value: string,
  assignedTo: string | null,
  options: { inSource?: boolean } = {},
): Verdict | null {
  if (isPlaceholderValue(value)) return null;

  const signature = matchSignature(value);
  if (signature !== null) {
    return { label: signature.name, confidence: 'high' };
  }

  if (assignedTo === null || !SECRET_NAME.test(assignedTo)) return null;
  if (value.length < MIN_ENTROPY_LENGTH) return null;

  // `TOKEN_EXPIRED = 'TOKEN_EXPIRED'`: an enum member, an error code, or the
  // name of an environment variable held in a constant. A value that spells
  // its own binding carries no information the name did not already give away.
  if (sameName(value, assignedTo)) return null;

  // An opaque credential is base62/base64url: ASCII letters, digits and a few
  // separators. Requiring that shape before measuring entropy is what stops
  // this rule firing on translated user-facing text - Shannon entropy is
  // measured per character, and CJK or Thai prose scores higher than a real
  // API key does. A localisation file is not a credential leak.
  if (!/^[A-Za-z0-9_\-+/=.:]+$/.test(value)) return null;

  // Reject anything that is plainly not an opaque token.
  if (/\s/.test(value)) return null;
  if (value.startsWith('http://') || value.startsWith('https://')) return null;
  if (value.startsWith('./') || value.startsWith('../') || value.startsWith('/')) return null;
  if (/^[a-z]+(?:[-_.][a-z0-9]+)+$/.test(value)) return null; // kebab/snake identifier
  if (options.inSource === true && isBuiltFromWords(value)) return null;
  // Opaque credentials are base62/base64url. Anything containing regular
  // expression or glob metacharacters is a pattern, not a secret - which is
  // exactly what a file full of detection patterns looks like.
  if (/[|\\()[\]{}*+^$?<>!]/.test(value)) return null;
  if (shannonEntropy(value) < ENTROPY_THRESHOLD) return null;

  return { label: 'Credential', confidence: 'medium' };
}

/** True when two names differ only in case and separators. */
function sameName(a: string, b: string): boolean {
  const normalise = (s: string): string => s.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  return normalise(a) === normalise(b);
}

/**
 * True when a value is written the way names are written rather than the way
 * tokens are generated: letters only, in two or more words, following one of
 * the identifier conventions - `SCREAMING_SNAKE`, `camelCase`, `PascalCase`,
 * `Capitalised-kebab`, `colon:separated:` - or a mixture of them.
 *
 * The entropy threshold cannot make this distinction. It is measured per
 * character, and the letter distribution of an ordinary multi-word identifier
 * sits above it: `nextAuthVerificationRequestByToken` scores 4.11 bits, which
 * is more than a hexadecimal token can ever reach (4.0). What separates the two
 * is structure, so that is what is tested.
 *
 * What it costs is small and bounded. A generated token passes only if it has
 * no digit at all and never puts two capitals side by side - for a 24-character
 * base62 token, fewer than one in ten thousand. A passphrase made of
 * dictionary words does pass, exactly as `correct-horse-battery-staple` already
 * did under the kebab-case check above: this path detects opaque tokens, and a
 * string of words is not one.
 */
function isBuiltFromWords(value: string): boolean {
  const segments = value.split(/[-_.:]/);
  // One trailing separator is the shape of a key prefix: `session:by-id:`.
  if (segments.at(-1) === '') segments.pop();

  let words = 0;
  for (const segment of segments) {
    if (!/^[A-Za-z]+$/.test(segment)) return false;
    if (/^[A-Z]+$/.test(segment)) {
      words += 1;
      continue;
    }
    // In camelCase and PascalCase every capital starts a word, so it is always
    // followed by a lowercase letter. `aBCd` and `abC` are not names.
    if (/[A-Z](?![a-z])/.test(segment)) return false;
    words += 1 + (segment.slice(1).match(/[A-Z]/g)?.length ?? 0);
  }
  return words >= 2;
}
