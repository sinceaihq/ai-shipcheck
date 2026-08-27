import { defineRule } from '../../core/define-rule.js';
import { isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';

const WEAK_HASH = /createHash\s*\(\s*['"](md5|sha1)['"]\s*\)/g;
const WEAK_CIPHER = /createCipheriv?\s*\(\s*['"](des|des-ede3|rc4|aes-128-ecb|aes-256-ecb)['"]/gi;
const PASSWORD_CONTEXT = /\b(?:password|passwd|pwd|credential|secret)\b/i;

export default defineRule({
  meta: {
    id: 'security/weak-crypto',
    category: 'security',
    title: 'Broken or unsuitable cryptographic primitive',
    severity: 'high',
    confidence: 'high',
    description:
      'MD5 and SHA-1 are broken for any security purpose, and ECB-mode ciphers leak structure from the plaintext. Fast general-purpose hashes are also the wrong tool for passwords: they are designed to be quick, which is exactly what an offline cracking rig wants.',
    remediation:
      'Use SHA-256 or better for integrity, AES-256-GCM for encryption, and a dedicated password hash - argon2, scrypt or bcrypt - for credentials. Node ships scrypt in the crypto module.',
    references: [
      'https://owasp.org/Top10/A02_2021-Cryptographic_Failures/',
      'https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html',
    ],
    tags: ['crypto', 'owasp-a02'],
  },

  checkFile(file, ctx) {
    if (isNonProductionFile(file)) return;
    let reported = 0;

    for (const match of file.matchesText(WEAK_HASH)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      const algorithm = match.groups[0] ?? 'md5';
      const line = file.lineAt(match.index);
      const context = [file.lineText(line - 2), file.lineText(line - 1), file.lineText(line)].join(
        '\n',
      );
      const forPasswords = PASSWORD_CONTEXT.test(context);

      // Non-security uses (cache keys, ETags, content addressing) are common
      // and legitimate; only report when there is no such marker.
      if (
        !forPasswords &&
        /\b(?:etag|cache|checksum|fingerprint|dedupe|gravatar|content[_-]?hash)\b/i.test(context)
      ) {
        continue;
      }

      reported++;
      ctx.report({
        title: forPasswords
          ? `${algorithm.toUpperCase()} used to hash credentials`
          : `${algorithm.toUpperCase()} used for hashing`,
        severity: forPasswords ? 'critical' : 'high',
        explanation: forPasswords
          ? `${file.path} hashes credentials with ${algorithm.toUpperCase()}. It is fast by design, so a stolen database can be cracked at billions of guesses per second, and it has known collision attacks.`
          : `${file.path} uses ${algorithm.toUpperCase()}, which is cryptographically broken. If this hash is relied on for integrity or identity, it does not provide it.`,
        remediation: forPasswords
          ? 'Hash passwords with argon2, scrypt or bcrypt and a per-user salt. Node exposes crypto.scrypt without any dependency.'
          : 'Switch to SHA-256 (crypto.createHash("sha256")) or better.',
        evidence: [file.evidenceAt(match.index, { length: match.text.length })],
      });
    }

    for (const match of file.matchesText(WEAK_CIPHER)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      reported++;
      ctx.report({
        title: `Weak cipher ${match.groups[0] ?? ''} in use`,
        explanation: `${file.path} encrypts with ${match.groups[0] ?? 'a legacy cipher'}, which does not provide meaningful confidentiality against a modern attacker.`,
        remediation: 'Use AES-256-GCM, which also authenticates the ciphertext against tampering.',
        evidence: [file.evidenceAt(match.index, { length: match.text.length })],
      });
    }
  },
});
