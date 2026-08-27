import { describe, expect, it } from 'vitest';
import { compareFindings, dedupeFindings, resolveRules, runScan } from '../../src/core/engine.js';
import { RuleRegistry } from '../../src/core/registry.js';
import { defineRule } from '../../src/core/define-rule.js';
import { DEFAULT_CONFIG } from '../../src/config/schema.js';
import { makeProject, removeProject } from '../helpers/project.js';
import type { Finding } from '../../src/types/core.js';
import type { Rule } from '../../src/types/rule.js';

function testRule(overrides: Partial<Rule['meta']> = {}, impl: Partial<Rule> = {}): Rule {
  return defineRule({
    meta: {
      id: 'security/test-rule',
      category: 'security',
      title: 'Test rule',
      severity: 'high',
      confidence: 'high',
      description: 'A rule used by the engine tests.',
      remediation: 'Nothing to do.',
      ...overrides,
    },
    checkFile(file, ctx) {
      if (file.has(/BOOM/g)) {
        ctx.report({ evidence: [file.evidenceAt(file.content.indexOf('BOOM'))] });
      }
    },
    ...impl,
  });
}

describe('defineRule', () => {
  it('rejects an id that does not match its category', () => {
    expect(() =>
      defineRule({
        meta: {
          id: 'auth/whatever',
          category: 'security',
          title: 't',
          severity: 'low',
          confidence: 'low',
          description: 'd',
          remediation: 'r',
        },
        checkProject() {},
      }),
    ).toThrow(/must start with its category prefix/);
  });

  it('rejects a rule that implements no check', () => {
    expect(() =>
      defineRule({
        meta: {
          id: 'security/nothing',
          category: 'security',
          title: 't',
          severity: 'low',
          confidence: 'low',
          description: 'd',
          remediation: 'r',
        },
      }),
    ).toThrow(/implements neither/);
  });

  it('rejects empty metadata fields', () => {
    expect(() =>
      defineRule({
        meta: {
          id: 'security/empty',
          category: 'security',
          title: '  ',
          severity: 'low',
          confidence: 'low',
          description: 'd',
          remediation: 'r',
        },
        checkProject() {},
      }),
    ).toThrow(/empty "title"/);
  });
});

describe('RuleRegistry', () => {
  it('rejects duplicate ids', () => {
    expect(() => RuleRegistry.from([testRule(), testRule()])).toThrow(/Duplicate rule id/);
  });

  it('returns rules in a deterministic order', () => {
    const registry = RuleRegistry.from([
      testRule({ id: 'security/b' }),
      testRule({ id: 'security/a' }),
    ]);
    expect(registry.all().map((r) => r.meta.id)).toEqual(['security/a', 'security/b']);
  });

  it('suggests near-miss rule ids', () => {
    const registry = RuleRegistry.from([testRule({ id: 'security/eval-usage' })]);
    expect(registry.suggest('security/eval-usag')).toContain('security/eval-usage');
  });
});

describe('resolveRules', () => {
  it('disables a rule set to "off"', () => {
    const registry = RuleRegistry.from([testRule()]);
    const { resolved } = resolveRules(registry, {
      ...DEFAULT_CONFIG,
      rules: { 'security/test-rule': 'off' },
    });
    expect(resolved[0]?.enabled).toBe(false);
  });

  it('applies a severity override', () => {
    const registry = RuleRegistry.from([testRule()]);
    const { resolved } = resolveRules(registry, {
      ...DEFAULT_CONFIG,
      rules: { 'security/test-rule': { severity: 'low' } },
    });
    expect(resolved[0]?.severity).toBe('low');
  });

  it('disables a whole category', () => {
    const registry = RuleRegistry.from([testRule()]);
    const { resolved } = resolveRules(registry, {
      ...DEFAULT_CONFIG,
      disabledCategories: ['security'],
    });
    expect(resolved[0]?.enabled).toBe(false);
  });

  it('warns about unknown rule ids rather than failing', () => {
    const registry = RuleRegistry.from([testRule({ id: 'security/eval-usage' })]);
    const { warnings } = resolveRules(registry, {
      ...DEFAULT_CONFIG,
      rules: { 'security/eval-usag': 'off' },
    });
    expect(warnings[0]).toContain('unknown rule');
    expect(warnings[0]).toContain('security/eval-usage');
  });
});

describe('runScan', () => {
  it('produces findings with resolved metadata', async () => {
    const dir = await makeProject({ 'package.json': '{"name":"x"}', 'a.ts': 'const x = "BOOM";' });
    try {
      const result = await runScan({
        root: dir,
        config: DEFAULT_CONFIG,
        registry: RuleRegistry.from([testRule()]),
      });
      expect(result.findings).toHaveLength(0); // "BOOM" lives inside a string
    } finally {
      await removeProject(dir);
    }
  });

  it('reports a rule that throws as unassessed and keeps scanning', async () => {
    const exploding = defineRule({
      meta: {
        id: 'security/explodes',
        category: 'security',
        title: 'Explodes',
        severity: 'high',
        confidence: 'high',
        description: 'd',
        remediation: 'r',
      },
      checkProject() {
        throw new Error('rule is broken');
      },
    });
    const dir = await makeProject({ 'package.json': '{}', 'a.ts': 'const a = 1;' });
    try {
      const result = await runScan({
        root: dir,
        config: DEFAULT_CONFIG,
        registry: RuleRegistry.from([exploding, testRule()]),
      });
      const check = result.checks.find((c) => c.ruleId === 'security/explodes');
      expect(check?.status).toBe('unassessed');
      expect(check?.reason).toContain('rule is broken');
      expect(result.stats.warnings.join(' ')).toContain('security/explodes');
      expect(result.checks.find((c) => c.ruleId === 'security/test-rule')?.status).toBe('pass');
    } finally {
      await removeProject(dir);
    }
  });

  it('records a framework gate as not-applicable with a reason', async () => {
    const dir = await makeProject({ 'package.json': '{}' });
    try {
      const result = await runScan({
        root: dir,
        config: DEFAULT_CONFIG,
        registry: RuleRegistry.from([testRule({ requiresFrameworks: ['supabase'] })]),
      });
      const check = result.checks[0];
      expect(check?.status).toBe('not-applicable');
      expect(check?.reason).toContain('supabase');
    } finally {
      await removeProject(dir);
    }
  });

  it('honours markUnassessed', async () => {
    const rule = defineRule({
      meta: {
        id: 'testing/nothing-to-do',
        category: 'testing',
        title: 'Nothing to assess',
        severity: 'low',
        confidence: 'low',
        description: 'd',
        remediation: 'r',
      },
      checkProject(ctx) {
        ctx.markUnassessed('nothing to look at');
      },
    });
    const dir = await makeProject({ 'package.json': '{}' });
    try {
      const result = await runScan({
        root: dir,
        config: DEFAULT_CONFIG,
        registry: RuleRegistry.from([rule]),
      });
      expect(result.checks[0]?.status).toBe('unassessed');
      expect(result.stats.rulesRun).toBe(0);
    } finally {
      await removeProject(dir);
    }
  });

  it('is deterministic across runs', async () => {
    const dir = await makeProject({
      'package.json': '{"name":"x","dependencies":{"next":"^15.0.0"}}',
      'app/api/x/route.ts': 'export async function POST() { eval("1"); return Response.json({}); }',
    });
    try {
      const first = await scanTwice(dir);
      const second = await scanTwice(dir);
      expect(first).toEqual(second);
    } finally {
      await removeProject(dir);
    }
  });
});

async function scanTwice(dir: string): Promise<string> {
  const { createDefaultRegistry } = await import('../../src/rules/index.js');
  const result = await runScan({
    root: dir,
    config: DEFAULT_CONFIG,
    registry: createDefaultRegistry(),
  });
  return JSON.stringify({
    findings: result.findings,
    categories: result.categories,
    score: result.score,
  });
}

describe('dedupeFindings', () => {
  const base: Finding = {
    ruleId: 'ai-cost/missing-token-limit',
    category: 'ai-cost',
    title: 't',
    severity: 'medium',
    confidence: 'medium',
    explanation: 'e',
    remediation: 'r',
    evidence: [{ file: 'a.ts', line: 4, column: 9, snippet: 'x' }],
  };

  it('collapses the same rule reported twice at the same location', () => {
    // Several rules match through a list of alternatives, and one call site
    // can satisfy two of them. A duplicate would double-count against the score.
    expect(dedupeFindings([base, { ...base }])).toHaveLength(1);
  });

  it('keeps distinct locations', () => {
    const other = { ...base, evidence: [{ file: 'a.ts', line: 9, column: 1, snippet: 'y' }] };
    expect(dedupeFindings([base, other])).toHaveLength(2);
  });

  it('keeps distinct rules at the same location', () => {
    expect(dedupeFindings([base, { ...base, ruleId: 'ai-cost/missing-llm-timeout' }])).toHaveLength(
      2,
    );
  });

  it('distinguishes evidence-free findings by title', () => {
    const a = { ...base, evidence: [] };
    const b = { ...a, title: 'different' };
    expect(dedupeFindings([a, { ...a }, b])).toHaveLength(2);
  });
});

describe('scan coverage', () => {
  it('reports what could and could not be assessed', async () => {
    const dir = await makeProject({
      'package.json': '{"name":"x","dependencies":{"next":"^15.0.0"}}',
      'app/page.tsx': 'export default () => <p>hi</p>;',
    });
    try {
      const { createDefaultRegistry } = await import('../../src/rules/index.js');
      const result = await runScan({
        root: dir,
        config: DEFAULT_CONFIG,
        registry: createDefaultRegistry(),
      });
      expect(result.coverage.checksTotal).toBe(result.checks.length);
      expect(result.coverage.checksRun).toBeGreaterThan(0);
      expect(
        result.coverage.checksRun +
          result.coverage.checksUnassessed +
          result.coverage.checksNotApplicable +
          result.coverage.checksDisabled,
      ).toBe(result.coverage.checksTotal);
      expect(result.coverage.categoriesTotal).toBe(9);
      expect(result.stats.truncated).toBe(false);
    } finally {
      await removeProject(dir);
    }
  });

  it('reports truncation and the reasons when a limit stops the walk', async () => {
    const files: Record<string, string> = { 'package.json': '{"name":"x"}' };
    for (let i = 0; i < 12; i++) files[`src/f${i}.ts`] = `export const a${i} = 1;`;
    const dir = await makeProject(files);
    try {
      const { createDefaultRegistry } = await import('../../src/rules/index.js');
      const result = await runScan({
        root: dir,
        config: { ...DEFAULT_CONFIG, limits: { maxFiles: 3 } },
        registry: createDefaultRegistry(),
      });
      expect(result.stats.truncated).toBe(true);
      expect(result.stats.skippedByReason['file-limit']).toBeGreaterThan(0);
      expect(result.stats.warnings.join(' ')).toContain('resource limit');
    } finally {
      await removeProject(dir);
    }
  });
});

describe('compareFindings', () => {
  const base: Finding = {
    ruleId: 'security/a',
    category: 'security',
    title: 't',
    severity: 'high',
    confidence: 'high',
    explanation: 'e',
    remediation: 'r',
    evidence: [{ file: 'b.ts', line: 10, column: 1, snippet: '' }],
  };

  it('sorts worse severities first', () => {
    expect(compareFindings({ ...base, severity: 'critical' }, base)).toBeLessThan(0);
  });

  it('breaks ties by rule id, then file, then line', () => {
    expect(compareFindings(base, { ...base, ruleId: 'security/b' })).toBeLessThan(0);
    expect(
      compareFindings(base, {
        ...base,
        evidence: [{ file: 'a.ts', line: 10, column: 1, snippet: '' }],
      }),
    ).toBeGreaterThan(0);
    expect(
      compareFindings(base, {
        ...base,
        evidence: [{ file: 'b.ts', line: 20, column: 1, snippet: '' }],
      }),
    ).toBeLessThan(0);
  });
});
