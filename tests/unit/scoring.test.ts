import { describe, expect, it } from 'vitest';
import {
  computeScore,
  countAtLeast,
  countBySeverity,
  decideVerdict,
  rulePenalty,
} from '../../src/scoring/score.js';
import {
  CATEGORY_WEIGHTS,
  CONFIDENCE_MULTIPLIERS,
  NOT_READY_SCORE_THRESHOLD,
  READY_SCORE_THRESHOLD,
  REPEAT_CAP_MULTIPLIER,
  REPEAT_FACTOR,
  SEVERITY_WEIGHTS,
  meetsSeverity,
  severityRank,
} from '../../src/scoring/weights.js';
import type { CheckResult, Finding, Severity } from '../../src/types/core.js';

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: 'security/eval-usage',
    category: 'security',
    title: 'test finding',
    severity: 'high',
    confidence: 'high',
    explanation: 'x',
    remediation: 'y',
    evidence: [{ file: 'a.ts', line: 1, column: 1, snippet: 'eval(x)' }],
    ...overrides,
  };
}

function check(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    ruleId: 'security/eval-usage',
    category: 'security',
    status: 'fail',
    findingCount: 1,
    ...overrides,
  };
}

/**
 * The score is the number people will quote in pull requests, so its
 * definition is pinned here value by value. Changing any of these constants
 * must be a deliberate act with a CHANGELOG entry.
 */
describe('weights', () => {
  it('pins the severity weights', () => {
    expect(SEVERITY_WEIGHTS).toEqual({ critical: 40, high: 20, medium: 8, low: 3, info: 0 });
  });

  it('pins the confidence multipliers', () => {
    expect(CONFIDENCE_MULTIPLIERS).toEqual({ high: 1, medium: 0.7, low: 0.4 });
  });

  it('pins the repeat model', () => {
    expect(REPEAT_FACTOR).toBe(0.25);
    expect(REPEAT_CAP_MULTIPLIER).toBe(3);
  });

  it('pins the verdict thresholds', () => {
    expect(READY_SCORE_THRESHOLD).toBe(85);
    expect(NOT_READY_SCORE_THRESHOLD).toBe(60);
  });

  it('weights security above accessibility', () => {
    expect(CATEGORY_WEIGHTS.security).toBeGreaterThan(CATEGORY_WEIGHTS.accessibility);
  });

  it('orders severities worst first', () => {
    expect(severityRank('critical')).toBeLessThan(severityRank('low'));
    expect(meetsSeverity('critical', 'high')).toBe(true);
    expect(meetsSeverity('low', 'high')).toBe(false);
  });
});

describe('rulePenalty', () => {
  it('charges the full weight for the first finding', () => {
    expect(rulePenalty('high', 'high', 1)).toBe(20);
  });

  it('charges a quarter for each repeat', () => {
    expect(rulePenalty('high', 'high', 2)).toBe(25);
    expect(rulePenalty('high', 'high', 3)).toBe(30);
  });

  it('caps a single rule at three times its base weight', () => {
    expect(rulePenalty('high', 'high', 100)).toBe(60);
  });

  it('scales by confidence without changing severity', () => {
    expect(rulePenalty('critical', 'low', 1)).toBeCloseTo(16);
    expect(rulePenalty('critical', 'medium', 1)).toBeCloseTo(28);
  });

  it('never charges for informational findings', () => {
    expect(rulePenalty('info', 'high', 50)).toBe(0);
  });

  it('is zero for no findings', () => {
    expect(rulePenalty('critical', 'high', 0)).toBe(0);
  });
});

describe('computeScore', () => {
  it('gives a clean project 100 and READY', () => {
    const result = computeScore({
      findings: [],
      checks: [check({ status: 'pass', findingCount: 0 })],
    });
    expect(result.score).toBe(100);
    expect(result.verdict).toBe('READY');
  });

  it('excludes unassessed categories from the score rather than awarding 100', () => {
    const result = computeScore({
      findings: [],
      checks: [
        check({ status: 'pass', findingCount: 0 }),
        check({ ruleId: 'testing/x', category: 'testing', status: 'unassessed', findingCount: 0 }),
      ],
    });
    const testing = result.categories.find((c) => c.category === 'testing');
    expect(testing?.status).toBe('unassessed');
    expect(testing?.score).toBeNull();
    expect(result.verdictReasons.join(' ')).toContain('could not be assessed');
  });

  it('marks a category not-applicable when every rule was skipped', () => {
    const result = computeScore({
      findings: [],
      checks: [
        check({ status: 'pass', findingCount: 0 }),
        check({
          ruleId: 'database/x',
          category: 'database',
          status: 'not-applicable',
          findingCount: 0,
        }),
      ],
    });
    expect(result.categories.find((c) => c.category === 'database')?.status).toBe('not-applicable');
  });

  it('deducts from the right category only', () => {
    const result = computeScore({
      findings: [finding()],
      checks: [
        check(),
        check({ ruleId: 'testing/x', category: 'testing', status: 'pass', findingCount: 0 }),
      ],
    });
    expect(result.categories.find((c) => c.category === 'security')?.score).toBe(80);
    expect(result.categories.find((c) => c.category === 'testing')?.score).toBe(100);
  });

  it('explains every deduction', () => {
    const result = computeScore({
      findings: [finding(), finding()],
      checks: [check({ findingCount: 2 })],
    });
    const security = result.categories.find((c) => c.category === 'security');
    expect(security?.contributions).toHaveLength(1);
    expect(security?.contributions[0]).toMatchObject({
      ruleId: 'security/eval-usage',
      severity: 'high',
      count: 2,
      penalty: 25,
    });
  });

  it('lets a blocker force NOT READY at a high score', () => {
    const result = computeScore({
      findings: [finding({ severity: 'low', confidence: 'low', blocker: true })],
      checks: [check()],
    });
    expect(result.score).toBeGreaterThan(READY_SCORE_THRESHOLD);
    expect(result.verdict).toBe('NOT READY');
    expect(result.verdictReasons[0]).toContain('blocking');
  });

  it('reports NOT READY for any critical finding', () => {
    const result = computeScore({
      findings: [finding({ severity: 'critical', confidence: 'low' })],
      checks: [check()],
    });
    expect(result.verdict).toBe('NOT READY');
  });

  it('reports NEEDS ATTENTION for a high-severity finding on an otherwise good score', () => {
    const checks: CheckResult[] = [
      check(),
      check({ ruleId: 'testing/a', category: 'testing', status: 'pass', findingCount: 0 }),
      check({ ruleId: 'performance/a', category: 'performance', status: 'pass', findingCount: 0 }),
      check({
        ruleId: 'accessibility/a',
        category: 'accessibility',
        status: 'pass',
        findingCount: 0,
      }),
      check({ ruleId: 'reliability/a', category: 'reliability', status: 'pass', findingCount: 0 }),
    ];
    const result = computeScore({ findings: [finding({ confidence: 'low' })], checks });
    expect(result.verdict).toBe('NEEDS ATTENTION');
    expect(result.score).toBeGreaterThanOrEqual(READY_SCORE_THRESHOLD);
  });

  it('reports NEEDS ATTENTION, not a fabricated score, when nothing is assessable', () => {
    const result = computeScore({
      findings: [],
      checks: [check({ status: 'unassessed', findingCount: 0 })],
    });
    expect(result.score).toBe(0);
    expect(result.verdict).toBe('NEEDS ATTENTION');
    expect(result.verdictReasons[0]).toContain('No production-readiness checks');
  });

  it('clamps a catastrophic category at zero', () => {
    const findings = Array.from({ length: 30 }, (_, i) =>
      finding({ ruleId: `security/rule-${i}`, severity: 'critical' }),
    );
    const result = computeScore({ findings, checks: [check()] });
    expect(result.categories.find((c) => c.category === 'security')?.score).toBe(0);
    expect(result.score).toBe(0);
  });

  it('produces the same result for the same input', () => {
    const input = { findings: [finding(), finding({ severity: 'medium' })], checks: [check()] };
    expect(computeScore(input)).toEqual(computeScore(input));
  });
});

describe('decideVerdict', () => {
  it('names the blocking rules', () => {
    const { verdict, reasons } = decideVerdict({
      score: 95,
      findings: [finding({ ruleId: 'security/hardcoded-secret', blocker: true })],
      assessedCount: 3,
      categories: [],
    });
    expect(verdict).toBe('NOT READY');
    expect(reasons[0]).toContain('security/hardcoded-secret');
  });

  it('reports a low score as NOT READY even without findings', () => {
    const { verdict, reasons } = decideVerdict({
      score: 40,
      findings: [],
      assessedCount: 5,
      categories: [],
    });
    expect(verdict).toBe('NOT READY');
    expect(reasons[0]).toContain('below the 60-point');
  });
});

describe('counting helpers', () => {
  it('counts by severity', () => {
    const counts = countBySeverity([finding(), finding({ severity: 'low' })]);
    expect(counts).toEqual({ critical: 0, high: 1, medium: 0, low: 1, info: 0 });
  });

  it('counts at or above a threshold', () => {
    const findings = (['critical', 'high', 'medium', 'low'] as Severity[]).map((severity) =>
      finding({ severity }),
    );
    expect(countAtLeast(findings, 'high')).toBe(2);
    expect(countAtLeast(findings, 'low')).toBe(4);
    expect(countAtLeast(findings, 'critical')).toBe(1);
  });
});
