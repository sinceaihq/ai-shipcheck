import fs from 'node:fs/promises';
import os from 'node:os';
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

/**
 * A Windows checkout with git's default settings has CRLF line endings, and a
 * project scanned there must get the report it would get anywhere else: the
 * same findings, on the same lines, quoting the same text.
 *
 * The repository is checked out with LF everywhere (see .gitattributes), so
 * nothing else in the suite exercises CRLF. This does, on every platform.
 */
describe('line endings', () => {
  async function copyWithLineEnding(from: string, to: string, eol: string): Promise<void> {
    await fs.mkdir(to, { recursive: true });
    for (const entry of await fs.readdir(from, { withFileTypes: true })) {
      const source = path.join(from, entry.name);
      const target = path.join(to, entry.name);
      if (entry.isDirectory()) {
        await copyWithLineEnding(source, target, eol);
      } else {
        const text = await fs.readFile(source, 'utf8');
        await fs.writeFile(target, text.replace(/\r\n/g, '\n').replace(/\n/g, eol));
      }
    }
  }

  function describeFindings(result: ScanResult): string[] {
    return result.findings
      .map((f) => {
        const at = f.evidence[0];
        return `${f.ruleId} ${f.severity} ${at?.file}:${at?.line}:${at?.column} ${at?.snippet}`;
      })
      .sort();
  }

  it.each([...VULNERABLE_FIXTURES, ...SECURE_FIXTURES])(
    'reports %s identically with LF and CRLF',
    async (name) => {
      const results: ScanResult[] = [];
      for (const eol of ['\n', '\r\n']) {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shipcheck-eol-'));
        try {
          await copyWithLineEnding(path.join(FIXTURES, name), dir, eol);
          results.push(await scanDirectory(dir));
        } finally {
          await fs.rm(dir, { recursive: true, force: true });
        }
      }
      const [lf, crlf] = results as [ScanResult, ScanResult];
      expect(describeFindings(crlf)).toEqual(describeFindings(lf));
      expect(crlf.score).toBe(lf.score);
      expect(crlf.verdict).toBe(lf.verdict);
      // The comparison is only worth something if the scan found the files.
      expect(lf.stats.filesScanned).toBeGreaterThan(0);
      expect(crlf.stats.filesScanned).toBe(lf.stats.filesScanned);
    },
  );
});

describe('rule catalogue integrity', () => {
  const rules = createDefaultRegistry().all();

  it('has a documentation page for every rule', async () => {
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
