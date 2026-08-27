import { defineRule } from '../../core/define-rule.js';
import { isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';

const JWT_DECODE = /\bjwt(?:wt)?\s*\.\s*decode\s*\(|\bjwtDecode\s*\(|\bdecodeJwt\s*\(/g;
const ALGORITHM_NONE = /algorithms?\s*:\s*\[?\s*['"]none['"]/gi;
const IGNORE_EXPIRATION = /ignoreExpiration\s*:\s*true/g;

/** Evidence that the decoded token is verified somewhere in the same module. */
const VERIFY_PRESENT =
  /\bjwt(?:wt)?\s*\.\s*verify\s*\(|\bjwtVerify\s*\(|\bverifyIdToken\s*\(|\bjoseVerify\b|\bverifySessionCookie\s*\(/;

/**
 * The decoded payload being used as an identity or authorisation decision, as
 * opposed to reading an expiry or an issuer, which is ordinary and safe.
 */
const TRUSTED_CLAIM_USE =
  /\.\s*(?:sub|role|roles|isAdmin|is_admin|permissions|scope|scopes|userId|user_id|uid|email|tenantId|org|orgId)\b|\[\s*['"](?:sub|role|roles|permissions|scope|userId|uid|email)['"]\s*\]/;

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
    if (isNonProductionFile(file)) return;
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

    // Decoding a token to read a non-security claim - an expiry, an issuer -
    // is ordinary and safe. What matters is decoding it and then *trusting*
    // the result to decide who the caller is. Without that second half the two
    // cases cannot be told apart, so nothing is reported and this is certainly
    // not treated as a deployment blocker.
    if (!VERIFY_PRESENT.test(file.text)) {
      for (const match of file.matches(JWT_DECODE)) {
        if (reported >= MAX_FINDINGS_PER_RULE) return;
        const line = file.lineAt(match.index);
        const following = [line, line + 1, line + 2, line + 3, line + 4, line + 5]
          .map((n) => file.lineText(n))
          .join('\n');
        if (!TRUSTED_CLAIM_USE.test(following)) continue;

        reported++;
        ctx.report({
          title: 'JWT decoded without verification, then trusted',
          severity: 'high',
          confidence: 'low',
          blocker: false,
          explanation: `${file.path} decodes a JWT with no verification call in the same module and then reads an identity or role claim from it. Decoding does not check the signature, so a caller can set those claims to anything.`,
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
