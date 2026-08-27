/**
 * Credential shapes with well-known, unambiguous formats.
 *
 * Every pattern here is precise enough that a match is essentially proof — a
 * string starting `sk-ant-` with 90 characters of base62 after it is an
 * Anthropic key, not a coincidence. Fuzzy, entropy-based detection is handled
 * separately and reported at lower confidence.
 *
 * All patterns are anchored and linear-time; none contain nested quantifiers.
 */
export interface SecretSignature {
  readonly id: string;
  readonly name: string;
  readonly pattern: RegExp;
}

export const SECRET_SIGNATURES: readonly SecretSignature[] = [
  { id: 'anthropic', name: 'Anthropic API key', pattern: /^sk-ant-[A-Za-z0-9_-]{24,}$/ },
  { id: 'openai-project', name: 'OpenAI project API key', pattern: /^sk-proj-[A-Za-z0-9_-]{24,}$/ },
  { id: 'openai', name: 'OpenAI API key', pattern: /^sk-[A-Za-z0-9]{32,}$/ },
  {
    id: 'stripe-secret',
    name: 'Stripe secret key',
    pattern: /^sk_(?:live|test)_[A-Za-z0-9]{16,}$/,
  },
  {
    id: 'stripe-restricted',
    name: 'Stripe restricted key',
    pattern: /^rk_(?:live|test)_[A-Za-z0-9]{16,}$/,
  },
  { id: 'stripe-webhook', name: 'Stripe webhook secret', pattern: /^whsec_[A-Za-z0-9]{16,}$/ },
  { id: 'github-token', name: 'GitHub token', pattern: /^gh[pousr]_[A-Za-z0-9]{36}$/ },
  {
    id: 'github-pat',
    name: 'GitHub fine-grained token',
    pattern: /^github_pat_[A-Za-z0-9_]{40,}$/,
  },
  { id: 'slack-token', name: 'Slack token', pattern: /^xox[baprs]-[A-Za-z0-9-]{10,}$/ },
  { id: 'aws-access-key', name: 'AWS access key id', pattern: /^AKIA[0-9A-Z]{16}$/ },
  { id: 'google-api-key', name: 'Google API key', pattern: /^AIza[0-9A-Za-z_-]{35}$/ },
  {
    id: 'sendgrid',
    name: 'SendGrid API key',
    pattern: /^SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}$/,
  },
  { id: 'npm-token', name: 'npm access token', pattern: /^npm_[A-Za-z0-9]{36}$/ },
  { id: 'twilio', name: 'Twilio account SID', pattern: /^AC[0-9a-fA-F]{32}$/ },
  { id: 'mailgun', name: 'Mailgun API key', pattern: /^key-[0-9a-zA-Z]{32}$/ },
  {
    id: 'private-key-block',
    name: 'PEM private key',
    pattern: /^-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
  },
  {
    id: 'supabase-service-jwt',
    name: 'Supabase service-role JWT',
    pattern: /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}$/,
  },
];

/**
 * Placeholder markers. Sample values are the single largest source of
 * false positives in secret scanning, so this list is applied before any
 * signature or entropy check.
 */
const PLACEHOLDER_MARKERS: readonly string[] = [
  'your',
  'example',
  'placeholder',
  'changeme',
  'change-me',
  'change_me',
  'dummy',
  'sample',
  'redacted',
  'fake',
  'insert',
  'replace',
  'todo',
  'xxxx',
  'aaaa',
  '1234567890',
  'abcdef',
  'foobar',
  'test-key',
  'testkey',
  'my-key',
  'mykey',
  'notreal',
  'donotuse',
  'localhost',
  'masked',
];

/** True when a literal is obviously a template value rather than a real secret. */
export function isPlaceholderValue(value: string): boolean {
  const lower = value.toLowerCase();
  if (lower.includes('<') || lower.includes('>')) return true;
  if (lower.includes('${') || lower.includes('{{')) return true;
  if (PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker))) return true;
  // A value made of a single repeated character carries no information.
  if (/^(.)\1*$/.test(value)) return true;
  return false;
}

/**
 * Shannon entropy in bits per character.
 *
 * Real credentials sit above ~3.5 bits/char; English words and kebab-case
 * identifiers sit well below it.
 */
export function shannonEntropy(value: string): number {
  if (value.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/** Identify a literal against the known signature list. */
export function matchSignature(value: string): SecretSignature | null {
  for (const sig of SECRET_SIGNATURES) {
    if (sig.pattern.test(value)) return sig;
  }
  return null;
}
