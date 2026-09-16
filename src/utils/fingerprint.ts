import type { Finding } from '../types/core.js';

/** Shared SARIF/baseline identity. Evidence paths are already repository-relative POSIX paths. */
export function findingFingerprint(finding: Finding): string {
  const primary = finding.evidence[0];
  return fingerprint(`${finding.ruleId}|${primary?.file ?? ''}|${primary?.snippet ?? ''}`);
}

/**
 * A stable, content-derived fingerprint. FNV-1a is used because it is short,
 * dependency-free and only needs to be stable, not cryptographic.
 */
function fingerprint(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
