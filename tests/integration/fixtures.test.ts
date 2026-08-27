import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../src/rules/index.js';
import { FIXTURES, firedRules, scanDirectory } from '../helpers/project.js';
import type { ScanResult } from '../../src/types/core.js';

const VULNERABLE_FIXTURES = [
  'vulnerable-nextjs',
  'vulnerable-supabase',
  'vulnerable-ai-api',
] as const;
const SECURE_FIXTURES = ['secure-nextjs', 'secure-api'] as const;

const scanned = new Map<string, ScanResult>();

async function scanFixture(name: string): Promise<ScanResult> {
  const cached = scanned.get(name);
  if (cached !== undefined) return cached;
  const result = await scanDirectory(path.join(FIXTURES, name));
  scanned.set(name, result);
  return result;
}

/**
 * Fixture coverage is the contract that keeps the rule set honest:
 *
 * - Every rule must fire on at least one intentionally broken project. A rule
 *   that can never produce a finding is dead code.
 * - No rule may fire on a correct project. This is the false-positive budget,
 *   and it is zero.
 */
describe('fixture coverage', () => {
  it('gives every rule a positive fixture', async () => {
    const fired = new Set<string>();
    for (const name of VULNERABLE_FIXTURES) {
      for (const id of firedRules(await scanFixture(name))) fired.add(id);
    }

    const missing = createDefaultRegistry()
      .all()
      .map((rule) => rule.meta.id)
      .filter((id) => !fired.has(id));

    expect(
      missing,
      `These rules never fire on any vulnerable fixture. Add a positive fixture, or remove the rule:\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  for (const name of SECURE_FIXTURES) {
    it(`reports nothing on ${name}`, async () => {
      const result = await scanFixture(name);
      const described = result.findings.map(
        (f) => `${f.ruleId} at ${f.evidence[0]?.file}:${f.evidence[0]?.line} - ${f.title}`,
      );
      expect(described, `${name} should be clean`).toEqual([]);
      expect(result.verdict).toBe('READY');
      expect(result.score).toBe(100);
    });
  }
});

describe('vulnerable fixtures', () => {
  it('marks vulnerable-nextjs NOT READY with blockers', async () => {
    const result = await scanFixture('vulnerable-nextjs');
    expect(result.verdict).toBe('NOT READY');
    expect(result.findings.some((f) => f.blocker === true)).toBe(true);
    expect(result.verdictReasons[0]).toContain('blocking');
  });

  it('detects the Supabase data-safety issues', async () => {
    const fired = firedRules(await scanFixture('vulnerable-supabase'));
    expect(fired).toContain('database/supabase-missing-rls');
    expect(fired).toContain('database/permissive-rls-policy');
    expect(fired).toContain('auth/supabase-service-role-exposure');
  });

  it('detects the AI cost and abuse issues', async () => {
    const fired = firedRules(await scanFixture('vulnerable-ai-api'));
    expect(fired).toContain('ai-cost/llm-route-without-rate-limit');
    expect(fired).toContain('ai-cost/user-controlled-model');
    expect(fired).toContain('ai-cost/ai-key-exposed-to-client');
    expect(fired).toContain('ai-cost/missing-token-limit');
  });

  it('never prints a fixture credential in full', async () => {
    for (const name of VULNERABLE_FIXTURES) {
      const serialised = JSON.stringify(await scanFixture(name));
      expect(serialised).not.toContain('SHIPCHECKFIXTUREKEY000000000000');
      expect(serialised).not.toContain('Hx9Kd2NbTgH5sYcJf8Ae');
      expect(serialised).not.toContain('Qm4pLv9WxKd2NbTgH5sYcJf8AeUiO3Rz');
    }
  });

  it('produces evidence that points at a real line of a real file', async () => {
    const result = await scanFixture('vulnerable-nextjs');
    for (const finding of result.findings) {
      for (const evidence of finding.evidence) {
        expect(evidence.line, `${finding.ruleId} evidence line`).toBeGreaterThanOrEqual(1);
        expect(evidence.column, `${finding.ruleId} evidence column`).toBeGreaterThanOrEqual(1);
        expect(evidence.file, `${finding.ruleId} evidence path`).not.toMatch(/^([A-Za-z]:)?[\\/]/);
        expect(evidence.file).not.toContain('\\');
      }
    }
  });

  it('gives every finding a non-empty explanation and remediation', async () => {
    for (const name of VULNERABLE_FIXTURES) {
      for (const finding of (await scanFixture(name)).findings) {
        expect(finding.explanation.length, finding.ruleId).toBeGreaterThan(30);
        expect(finding.remediation.length, finding.ruleId).toBeGreaterThan(30);
        expect(finding.title.length, finding.ruleId).toBeGreaterThan(5);
      }
    }
  });
});

describe('rule catalogue integrity', () => {
  const rules = createDefaultRegistry().all();

  it('has a documentation page for every rule', async () => {
    const fs = await import('node:fs/promises');
    const docs = await fs.readdir(path.join(FIXTURES, '..', 'docs', 'rules'));
    for (const rule of rules) {
      expect(docs, rule.meta.id).toContain(`${rule.meta.id.replace('/', '__')}.md`);
    }
  });

  it('gives every rule prose long enough to be useful', () => {
    for (const rule of rules) {
      expect(rule.meta.description.length, rule.meta.id).toBeGreaterThan(80);
      expect(rule.meta.remediation.length, rule.meta.id).toBeGreaterThan(60);
    }
  });

  it('only marks high-confidence, high-severity rules as blockers', () => {
    for (const rule of rules) {
      if (rule.meta.blocker !== true) continue;
      expect(['critical', 'high'], rule.meta.id).toContain(rule.meta.severity);
      expect(['high', 'medium'], rule.meta.id).toContain(rule.meta.confidence);
    }
  });

  it('uses only kebab-case ids namespaced by category', () => {
    for (const rule of rules) {
      expect(rule.meta.id).toMatch(/^[a-z-]+\/[a-z0-9-]+$/);
      expect(rule.meta.id.startsWith(`${rule.meta.category}/`)).toBe(true);
    }
  });
});
