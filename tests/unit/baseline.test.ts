import { describe, expect, it } from 'vitest';
import { createBaseline, parseBaseline, suppressBaseline } from '../../src/baseline/baseline.js';
import type { CheckResult, Finding } from '../../src/types/core.js';
import { UsageError } from '../../src/utils/errors.js';

const finding: Finding = {
  ruleId: 'security/eval-usage',
  category: 'security',
  title: 'Dynamic code execution',
  severity: 'high',
  confidence: 'high',
  explanation: 'Evaluates untrusted input.',
  remediation: 'Use a parser.',
  evidence: [{ file: 'src/legacy.ts', line: 3, column: 1, snippet: 'eval(input);' }],
};
const check: CheckResult = {
  ruleId: finding.ruleId,
  category: 'security',
  status: 'fail',
  findingCount: 1,
};

describe('baseline matching', () => {
  it('matches an identical finding after a JSON round-trip', () => {
    const baseline = parseBaseline(JSON.stringify(createBaseline([finding])));
    const result = suppressBaseline([finding], [check], baseline);
    expect(result.findings).toEqual([]);
    expect(result.suppressedFindingCount).toBe(1);
    expect(result.checks).toEqual([
      {
        ...check,
        status: 'pass',
        findingCount: 0,
        reason: 'All findings accepted by the baseline.',
      },
    ]);
    expect(check.status).toBe('fail');
  });

  it.each([{ file: 'src/other.ts' }, { snippet: 'eval(otherInput);' }])(
    'does not match the same rule at a different file or snippet: %j',
    (change) => {
      const changed = { ...finding, evidence: [{ ...finding.evidence[0]!, ...change }] };
      expect(suppressBaseline([changed], [check], createBaseline([finding])).findings).toEqual([
        changed,
      ]);
    },
  );

  it('matches after lines and columns move, including range endpoints', () => {
    const moved = {
      ...finding,
      evidence: [{ ...finding.evidence[0]!, line: 90, column: 12, endLine: 91, endColumn: 20 }],
    };
    expect(
      suppressBaseline([moved], [check], createBaseline([finding])).suppressedFindingCount,
    ).toBe(1);
  });

  it('does not match another rule with the same evidence', () => {
    const other = { ...finding, ruleId: 'security/other-rule' };
    expect(suppressBaseline([other], [], createBaseline([finding])).findings).toEqual([other]);
  });

  it('retains fail status and reconciles counts when only some findings match', () => {
    const other = { ...finding, evidence: [{ ...finding.evidence[0]!, file: 'src/new.ts' }] };
    const result = suppressBaseline(
      [finding, other],
      [{ ...check, findingCount: 2 }],
      createBaseline([finding]),
    );
    expect(result.findings).toEqual([other]);
    expect(result.checks).toEqual([check]);
    expect(result.suppressedFindingCount).toBe(1);
  });

  it('preserves unassessed, disabled, not-applicable and passing checks', () => {
    const checks: CheckResult[] = ['unassessed', 'disabled', 'not-applicable', 'pass'].map(
      (status) => ({
        ...check,
        status: status as CheckResult['status'],
        findingCount: 0,
        reason: 'Original reason.',
      }),
    );
    expect(suppressBaseline([], checks, createBaseline([finding])).checks).toEqual(checks);
  });

  it('counts matching findings rather than unique or stale baseline entries', () => {
    const stale = { ...finding, ruleId: 'security/stale' };
    const moved = { ...finding, evidence: [{ ...finding.evidence[0]!, line: 40 }] };
    const baseline = createBaseline([finding, stale, finding]);
    expect(baseline.fingerprints).toHaveLength(2);
    expect(baseline.fingerprints).toEqual([...baseline.fingerprints].sort());
    expect(suppressBaseline([finding, moved], [], baseline).suppressedFindingCount).toBe(2);
    expect(suppressBaseline([], [], baseline).suppressedFindingCount).toBe(0);
    expect(JSON.stringify(baseline)).not.toContain('eval(input)');
  });

  it('inherits SARIF identity for findings without evidence', () => {
    const noEvidence = { ...finding, evidence: [] };
    expect(
      suppressBaseline(
        [{ ...noEvidence, title: 'Another title' }],
        [],
        createBaseline([noEvidence]),
      ).findings,
    ).toEqual([]);
  });

  it('accepts an empty baseline without suppressing anything', () => {
    expect(suppressBaseline([finding], [check], createBaseline([]))).toEqual({
      findings: [finding],
      checks: [check],
      suppressedFindingCount: 0,
    });
  });
});

describe('baseline parsing', () => {
  it.each([
    '{',
    'null',
    '[]',
    '42',
    '{}',
    '{"schemaVersion":"2.0","fingerprints":[]}',
    '{"schemaVersion":1,"fingerprints":[]}',
    '{"schemaVersion":"1.0"}',
    '{"schemaVersion":"1.0","fingerprints":"abcdef01"}',
    '{"schemaVersion":"1.0","fingerprints":[null]}',
    '{"schemaVersion":"1.0","fingerprints":[12345678]}',
    '{"schemaVersion":"1.0","fingerprints":["../path"]}',
    '{"schemaVersion":"1.0","fingerprints":["ABCDEFGH"]}',
  ])('rejects malformed or unsupported data: %s', (text) => {
    expect(() => parseBaseline(text)).toThrow(UsageError);
  });

  it('accepts and deduplicates valid fingerprints', () => {
    expect(parseBaseline('{"schemaVersion":"1.0","fingerprints":["abcdef01","abcdef01"]}')).toEqual(
      {
        schemaVersion: '1.0',
        fingerprints: ['abcdef01'],
      },
    );
  });
});
