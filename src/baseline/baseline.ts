import type { CheckResult, Finding } from '../types/core.js';
import { UsageError } from '../utils/errors.js';
import { findingFingerprint } from '../utils/fingerprint.js';

/** Versioned independently of the scan report schema. */
export const BASELINE_SCHEMA_VERSION = '1.0' as const;

export interface Baseline {
  readonly schemaVersion: typeof BASELINE_SCHEMA_VERSION;
  readonly fingerprints: readonly string[];
}

/** Record identities only, never source snippets or credentials. */
export function createBaseline(findings: readonly Finding[]): Baseline {
  return {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    fingerprints: [...new Set(findings.map(findingFingerprint))].sort(),
  };
}

/** Parse untrusted JSON, rejecting malformed or unsupported baselines explicitly. */
export function parseBaseline(text: string): Baseline {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new UsageError('Invalid baseline: expected valid JSON.');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new UsageError('Invalid baseline: expected an object.');
  }
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== BASELINE_SCHEMA_VERSION) {
    throw new UsageError(
      `Unsupported baseline schemaVersion: expected "${BASELINE_SCHEMA_VERSION}".`,
    );
  }
  if (
    !Array.isArray(data.fingerprints) ||
    !data.fingerprints.every(
      (entry: unknown) => typeof entry === 'string' && /^[0-9a-f]{8}$/.test(entry),
    )
  ) {
    throw new UsageError(
      'Invalid baseline: fingerprints must be an array of eight-character lowercase hexadecimal strings.',
    );
  }
  return {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    fingerprints: [...new Set<string>(data.fingerprints)],
  };
}

/** Filter once before scoring; preserve assessment coverage and reconcile per-rule counts. */
export function suppressBaseline(
  findings: readonly Finding[],
  checks: readonly CheckResult[],
  baseline: Baseline,
): { findings: Finding[]; checks: CheckResult[]; suppressedFindingCount: number } {
  const accepted = new Set(baseline.fingerprints);
  const remaining = findings.filter((finding) => !accepted.has(findingFingerprint(finding)));
  const counts = new Map<string, number>();
  for (const finding of remaining) {
    counts.set(finding.ruleId, (counts.get(finding.ruleId) ?? 0) + 1);
  }
  return {
    findings: remaining,
    checks: checks.map((check) => {
      const findingCount = counts.get(check.ruleId) ?? 0;
      if (check.status === 'fail' && findingCount === 0) {
        return {
          ...check,
          status: 'pass',
          findingCount,
          reason: 'All findings accepted by the baseline.',
        };
      }
      return { ...check, findingCount };
    }),
    suppressedFindingCount: findings.length - remaining.length,
  };
}
