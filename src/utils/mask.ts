/**
 * Secret masking.
 *
 * Shipcheck must never print a discovered credential in full — not to the
 * terminal, not into JSON, not into SARIF. Every value that reaches a report
 * passes through this module.
 */

/** Reveal at most this many leading characters of a masked value. */
const PREFIX_KEEP = 4;
/** Values shorter than this are masked entirely (too little entropy to hint at). */
const MIN_HINT_LENGTH = 12;

/**
 * Mask a single credential-like value.
 *
 * `sk-proj-abcdefghijklmnop` becomes `sk-p…[masked:24]`. The length is kept
 * because it is often the fastest way for a developer to recognise which key
 * was found without exposing it.
 */
export function maskValue(value: string): string {
  if (value.length === 0) return '';
  if (value.length < MIN_HINT_LENGTH) return `…[masked:${value.length}]`;
  return `${value.slice(0, PREFIX_KEEP)}…[masked:${value.length}]`;
}

/**
 * Patterns for text that must never be echoed verbatim. Each has exactly one
 * capture group wrapping the sensitive portion.
 *
 * All patterns are linear-time: no nested quantifiers, no alternation inside
 * a repetition, and every character class is bounded.
 */
const SENSITIVE_PATTERNS: readonly RegExp[] = [
  // Well-known provider key formats.
  /(sk-ant-[A-Za-z0-9_-]{16,})/g,
  /(sk-proj-[A-Za-z0-9_-]{16,})/g,
  /(sk-[A-Za-z0-9]{20,})/g,
  /(gh[pousr]_[A-Za-z0-9]{20,})/g,
  /(github_pat_[A-Za-z0-9_]{20,})/g,
  /(xox[baprs]-[A-Za-z0-9-]{10,})/g,
  /(AKIA[0-9A-Z]{16})/g,
  /(AIza[0-9A-Za-z_-]{35})/g,
  /(rk_live_[A-Za-z0-9]{16,})/g,
  /(sk_live_[A-Za-z0-9]{16,})/g,
  /(pk_live_[A-Za-z0-9]{16,})/g,
  /(whsec_[A-Za-z0-9]{16,})/g,
  /(SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,})/g,
  /(npm_[A-Za-z0-9]{30,})/g,
  /(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,})/g,
  // Connection strings: mask the password component only.
  /(?::\/\/[^:@\s/]{1,64}:)([^@\s]{1,256})(?=@)/g,
];

/** Names that make a value on the right-hand side credential-shaped. */
const SECRET_KEY_NAME =
  '(?:api[_-]?key|apikey|secret|token|password|passwd|pwd|private[_-]?key|access[_-]?key|auth[_-]?token|client[_-]?secret|service[_-]?role[_-]?key|session[_-]?secret|webhook[_-]?secret)';

/** Quoted assignments: `API_KEY = "…"`, `password: '…'`. */
const ASSIGNMENT_PATTERN = new RegExp(
  `((?:\\w*${SECRET_KEY_NAME})\\s*[:=]\\s*)(['"\`])([^'"\`\\n]{6,})\\2`,
  'gi',
);

/**
 * Unquoted assignments, as found in `.env` files: `SESSION_SECRET=abc123…`.
 *
 * Values that are plainly references rather than literals - `process.env.X`,
 * a shell expansion, a function call - are left alone so the snippet stays
 * readable.
 */
const ENV_ASSIGNMENT_PATTERN = new RegExp(
  `((?:\\w*${SECRET_KEY_NAME})\\s*=\\s*)([^\\s'"\`,;)]{8,})`,
  'gi',
);

const VALUE_IS_A_REFERENCE = /^(?:process\.env|import\.meta|\$|\{\{|<)|[()]/;

/**
 * Redact anything credential-shaped inside an arbitrary string, such as a
 * source-line snippet destined for a report.
 */
export function maskSecret(text: string): string {
  if (text.length === 0) return text;
  let out = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    out = out.replace(new RegExp(pattern.source, pattern.flags), (_match, captured: string) =>
      _match.replace(captured, maskValue(captured)),
    );
  }
  out = out.replace(
    new RegExp(ASSIGNMENT_PATTERN.source, ASSIGNMENT_PATTERN.flags),
    (_m, prefix: string, quote: string, value: string) =>
      `${prefix}${quote}${maskValue(value)}${quote}`,
  );
  out = out.replace(
    new RegExp(ENV_ASSIGNMENT_PATTERN.source, ENV_ASSIGNMENT_PATTERN.flags),
    (match: string, prefix: string, value: string) =>
      VALUE_IS_A_REFERENCE.test(value) ? match : `${prefix}${maskValue(value)}`,
  );
  return out;
}
