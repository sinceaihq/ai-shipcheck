import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getReporter } from '../../src/reporters/index.js';
import { escapeMd } from '../../src/reporters/markdown.js';
import { stripAnsi } from '../../src/utils/color.js';
import { createDefaultRegistry } from '../../src/rules/index.js';
import { FIXTURES, scanDirectory } from '../helpers/project.js';
import type { ScanResult } from '../../src/types/core.js';

let vulnerable: ScanResult | undefined;
let secure: ScanResult | undefined;

async function vulnerableResult(): Promise<ScanResult> {
  vulnerable ??= await scanDirectory(path.join(FIXTURES, 'vulnerable-nextjs'));
  return vulnerable;
}

async function secureResult(): Promise<ScanResult> {
  secure ??= await scanDirectory(path.join(FIXTURES, 'secure-nextjs'));
  return secure;
}

const options = { color: false, quiet: false, root: '/project' };

describe('json reporter', () => {
  it('emits parseable, versioned output', async () => {
    const text = getReporter('json')(await vulnerableResult(), options);
    const parsed = JSON.parse(text) as ScanResult;
    expect(parsed.schemaVersion).toBe('1.0');
    expect(parsed.tool.name).toBe('ai-shipcheck');
    expect(parsed.findings.length).toBeGreaterThan(0);
    expect(parsed.categories).toHaveLength(9);
  });

  it('round-trips without losing information', async () => {
    const result = await vulnerableResult();
    const parsed = JSON.parse(getReporter('json')(result, options)) as ScanResult;
    expect(parsed).toEqual(JSON.parse(JSON.stringify(result)));
  });
});

describe('markdown reporter', () => {
  it('renders a verdict, a summary table and findings', async () => {
    const text = getReporter('markdown')(await vulnerableResult(), options);
    expect(text).toContain('# AI Shipcheck report');
    expect(text).toContain('NOT READY');
    expect(text).toContain('| Category | Score | Findings |');
    expect(text).toContain('**Fix:**');
    expect(text).toContain('not a security certification');
  });

  it('says so plainly when there is nothing to report', async () => {
    const text = getReporter('markdown')(await secureResult(), options);
    expect(text).toContain('No findings were reported.');
    expect(text).toContain('READY');
  });

  it('escapes markdown control characters', () => {
    expect(escapeMd('a|b')).toBe('a\\|b');
    expect(escapeMd('<script>')).toBe('\\<script\\>');
    expect(escapeMd('a\nb')).toBe('a b');
    expect(escapeMd('`code`')).toBe('\\`code\\`');
  });

  it('never emits a raw pipe inside a table cell', async () => {
    const text = getReporter('markdown')(await vulnerableResult(), options);
    for (const line of text.split('\n')) {
      if (!line.startsWith('| ')) continue;
      const cells = line.slice(2, -2).split(' | ');
      for (const cell of cells) expect(cell).not.toContain('|');
    }
  });
});

describe('pretty reporter', () => {
  it('renders without colour when colour is disabled', async () => {
    const text = getReporter('pretty')(await vulnerableResult(), options);
    expect(stripAnsi(text)).toBe(text);
  });

  it('shows the verdict, the score and every category', async () => {
    const text = getReporter('pretty')(await vulnerableResult(), options);
    expect(text).toContain('NOT READY');
    expect(text).toContain('Security');
    expect(text).toContain('AI Cost & Abuse Controls');
    expect(text).toContain('Verdict');
    expect(text).toContain('not a security certification');
  });

  it('suppresses the coverage section when quiet', async () => {
    const result = await vulnerableResult();
    const loud = getReporter('pretty')(result, options);
    const quiet = getReporter('pretty')(result, { ...options, quiet: true });
    expect(loud).toContain('Not assessed');
    expect(quiet).not.toContain('Not assessed');
    expect(quiet.length).toBeLessThan(loud.length);
  });

  it('emits ANSI codes when colour is enabled', async () => {
    const text = getReporter('pretty')(await vulnerableResult(), { ...options, color: true });
    expect(stripAnsi(text).length).toBeLessThan(text.length);
  });
});

describe('sarif reporter', () => {
  it('produces a valid SARIF 2.1.0 log', async () => {
    const log = JSON.parse(getReporter('sarif')(await vulnerableResult(), options)) as {
      $schema: string;
      version: string;
      runs: {
        tool: {
          driver: { name: string; rules: { id: string; properties: Record<string, unknown> }[] };
        };
        results: {
          ruleId: string;
          ruleIndex: number;
          level: string;
          message: { text: string };
          locations?: {
            physicalLocation: { artifactLocation: { uri: string; uriBaseId: string } };
          }[];
          partialFingerprints: Record<string, string>;
        }[];
      }[];
    };

    expect(log.version).toBe('2.1.0');
    expect(log.$schema).toContain('sarif-2.1');
    expect(log.runs).toHaveLength(1);

    const run = log.runs[0]!;
    expect(run.tool.driver.name).toBe('AI Shipcheck');
    expect(run.results.length).toBeGreaterThan(0);

    const ruleIds = run.tool.driver.rules.map((r) => r.id);
    for (const [index, result] of run.results.entries()) {
      expect(ruleIds, `result ${index} references an undeclared rule`).toContain(result.ruleId);
      expect(ruleIds[result.ruleIndex]).toBe(result.ruleId);
      expect(['error', 'warning', 'note', 'none']).toContain(result.level);
      expect(result.message.text.length).toBeGreaterThan(0);
      expect(Object.keys(result.partialFingerprints).length).toBeGreaterThan(0);
      for (const location of result.locations ?? []) {
        const artifact = location.physicalLocation.artifactLocation;
        expect(artifact.uriBaseId).toBe('%SRCROOT%');
        expect(artifact.uri.startsWith('/')).toBe(false);
        expect(artifact.uri).not.toContain('\\');
      }
    }
  });

  it('carries a numeric security-severity GitHub can sort on', async () => {
    const log = JSON.parse(getReporter('sarif')(await vulnerableResult(), options)) as {
      runs: { tool: { driver: { rules: { properties: Record<string, string> }[] } } }[];
    };
    for (const rule of log.runs[0]!.tool.driver.rules) {
      const severity = Number(rule.properties['security-severity']);
      expect(severity).toBeGreaterThanOrEqual(0);
      expect(severity).toBeLessThanOrEqual(10);
      expect(rule.properties['precision']).toBeTruthy();
    }
  });

  it('declares no rules and no results for a clean project', async () => {
    const log = JSON.parse(getReporter('sarif')(await secureResult(), options)) as {
      runs: { results: unknown[]; tool: { driver: { rules: unknown[] } } }[];
    };
    expect(log.runs[0]!.results).toEqual([]);
    expect(log.runs[0]!.tool.driver.rules).toEqual([]);
  });

  it('keeps fingerprints stable across runs', async () => {
    const result = await vulnerableResult();
    const first = getReporter('sarif')(result, options);
    const second = getReporter('sarif')(result, options);
    expect(first).toBe(second);
  });

  it('describes every rule it declares', async () => {
    const registry = createDefaultRegistry();
    const log = JSON.parse(getReporter('sarif')(await vulnerableResult(), options)) as {
      runs: { tool: { driver: { rules: { id: string; help: { text: string } }[] } } }[];
    };
    for (const rule of log.runs[0]!.tool.driver.rules) {
      expect(registry.get(rule.id), rule.id).toBeDefined();
      expect(rule.help.text.length).toBeGreaterThan(50);
    }
  });

  it('masks credentials in snippets', async () => {
    const text = getReporter('sarif')(await vulnerableResult(), options);
    expect(text).not.toContain('SHIPCHECKFIXTUREKEY000000000000');
  });
});
