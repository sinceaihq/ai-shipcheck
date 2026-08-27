import { defineRule } from '../../core/define-rule.js';
import { MAX_FINDINGS_PER_RULE } from '../helpers.js';

const JWT_DECODE = /\bjwt(?:wt)?\s*\.\s*decode\s*\(|\bjwtDecode\s*\(|\bdecodeJwt\s*\(/g;
const ALGORITHM_NONE = /algorithms?\s*:\s*\[?\s*['"]none['"]/gi;
const IGNORE_EXPIRATION = /ignoreExpiration\s*:\s*true/g;

/** Evidence that the decoded token is verified somewhere in the same module. */
const VERIFY_PRESENT =
  /\bjwt(?:wt)?\s*\.\s*verify\s*\(|\bjwtVerify\s*\(|\bverifyIdToken\s*\(|\bjoseVerify\b/;

export default defineRule({
  meta: {
    id: 'auth/jwt-verification-bypass',
    category: 'auth',
    title: 'JWT accepted without verifying its signature',
    severity: 'critical',
    confidence: 'high',
    blocker: true,
    description:
      'Decoding a JWT only parses base64; it does not check the signature. A token whose payload is read with decode() can be forged by anyone - change the "sub" or "role" claim, re-encode, and the server accepts it. Allowing the "none" algorithm or ignoring expiry has the same effect.',
    remediation:
      'Verify with the signing key and an explicit algorithm allowlist - jwt.verify(token, key, { algorithms: ["RS256"] }) or jose.jwtVerify - and let expiry checks run. Use decode() only for values you have already verified.',
    references: [
      'https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html',
      'https://cwe.mitre.org/data/definitions/347.html',
    ],
    tags: ['jwt', 'authorization', 'owasp-a07'],
  },

  checkFile(file, ctx) {
    if (file.role === 'test') return;
    let reported = 0;

    for (const match of file.matchesText(ALGORITHM_NONE)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      reported++;
      ctx.report({
        title: 'JWT verification permits the "none" algorithm',
        explanation: `${file.path} accepts tokens signed with the "none" algorithm, which means unsigned tokens are treated as valid. Any payload can be forged.`,
        evidence: [file.evidenceAt(match.index, { length: match.text.length })],
      });
    }

    if (!VERIFY_PRESENT.test(file.text)) {
      for (const match of file.matches(JWT_DECODE)) {
        if (reported >= MAX_FINDINGS_PER_RULE) return;
        reported++;
        ctx.report({
          title: 'JWT decoded but never verified',
          confidence: 'medium',
          explanation: `${file.path} decodes a JWT without any verification call in the same module. Decoding does not check the signature, so claims such as the user id or role can be set to anything by the caller.`,
          evidence: [file.evidenceAt(match.index, { length: match.text.length })],
        });
      }
    }

    for (const match of file.matches(IGNORE_EXPIRATION)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      reported++;
      ctx.report({
        title: 'JWT expiry checks disabled',
        severity: 'high',
        explanation: `${file.path} sets ignoreExpiration: true, so revoked or long-expired tokens continue to authenticate indefinitely.`,
        remediation:
          'Remove ignoreExpiration and handle expired tokens by refreshing or re-authenticating.',
        evidence: [file.evidenceAt(match.index, { length: match.text.length })],
      });
    }
  },
});
