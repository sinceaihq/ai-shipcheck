import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBaseline } from '../../src/baseline/baseline.js';
import { loadBaseline, writeBaseline } from '../../src/baseline/file.js';
import { evaluateThresholds } from '../../src/cli/commands/scan.js';
import { DEFAULT_CONFIG } from '../../src/config/schema.js';
import { runScan } from '../../src/core/engine.js';
import { getReporter } from '../../src/reporters/index.js';
import { createDefaultRegistry } from '../../src/rules/index.js';
import { computeScore } from '../../src/scoring/score.js';
import type { ScanResult } from '../../src/types/core.js';
import { FIXTURES, makeProject, removeProject, scanDirectory } from '../helpers/project.js';

describe('baseline scan pipeline', () => {
  it('records a fixture, matches moved findings, and reports only one newly introduced problem', async () => {
    const dir = await makeProject({});
    try {
      const root = path.join(dir, 'project');
      await fs.cp(path.join(FIXTURES, 'vulnerable-nextjs'), root, { recursive: true });
      const original = await scanDirectory(root);
      expect(original.findings.some((f) => f.blocker)).toBe(true);
      const baselineFile = path.join(dir, 'baselines', 'accepted.json');
      await writeBaseline(baselineFile, createBaseline(original.findings));
      const baseline = await loadBaseline(baselineFile);
      const scan = () =>
        runScan({ root, config: DEFAULT_CONFIG, registry: createDefaultRegistry(), baseline });

      // Move concrete source findings. Project-level rules anchored to line 1
      // can change snippets when a comment is prepended (an existing SARIF limitation).
      const target = path.join(root, 'lib', 'http.ts');
      await fs.writeFile(
        target,
        `// unrelated comment\n\n${await fs.readFile(target, 'utf8')}`,
        'utf8',
      );
      const moved = await scanDirectory(root);
      const before = original.findings.find((f) => f.evidence[0]?.file === 'lib/http.ts')!;
      const after = moved.findings.find(
        (f) => f.ruleId === before.ruleId && f.evidence[0]?.snippet === before.evidence[0]?.snippet,
      )!;
      expect(after.evidence[0]!.line).toBe(before.evidence[0]!.line + 2);

      const accepted = await scan();
      expect(accepted.findings).toEqual([]);
      expect(accepted.suppressedFindingCount).toBe(original.findings.length);
      expect(accepted.score).toBe(100);
      expect(accepted.verdict).toBe('READY');
      expect(accepted.verdictReasons.join(' ')).not.toContain('blocking');
      expect(accepted.coverage).toEqual(original.coverage);
      expect(accepted.checks.every((c) => c.findingCount === 0 && c.status !== 'fail')).toBe(true);
      expect(accepted.categories.every((c) => c.findingCount === 0 && c.penalty === 0)).toBe(true);
      expect(evaluateThresholds(accepted, 'info', 100).exitCode).toBe(0);

      await fs.writeFile(path.join(root, 'lib', 'new-problem.ts'), 'eval(newInput);\n', 'utf8');
      const result = await scan();
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({
        ruleId: 'security/eval-usage',
        evidence: [{ file: 'lib/new-problem.ts', line: 1, snippet: 'eval(newInput);' }],
      });
      expect(result.suppressedFindingCount).toBe(original.findings.length);
      expect(result.checks.find((c) => c.ruleId === 'security/eval-usage')).toMatchObject({
        status: 'fail',
        findingCount: 1,
      });
      expect(result).toMatchObject(
        computeScore({ findings: result.findings, checks: result.checks }),
      );
      expect(evaluateThresholds(result, 'high', null).exitCode).toBe(1);
      expect(evaluateThresholds(result, null, 100).exitCode).toBe(1);

      const options = { root, quiet: true, color: false };
      const json = JSON.parse(getReporter('json')(result, options)) as ScanResult;
      expect(json.findings).toEqual(result.findings);
      expect(json.suppressedFindingCount).toBe(original.findings.length);
      for (const format of ['pretty', 'markdown'] as const) {
        const text = getReporter(format)(result, options);
        expect(text).toContain(`${original.findings.length} findings suppressed by baseline.`);
        expect(text).toContain('lib/new-problem.ts');
        expect(text).not.toContain('BLOCKER');
        const clean = getReporter(format)(accepted, options);
        expect(clean).toContain(`${original.findings.length} findings suppressed by baseline.`);
        expect(clean).not.toContain('Every applicable check passed.');
      }
      const sarif = JSON.parse(getReporter('sarif')(result, options));
      expect(sarif.runs[0].results).toHaveLength(1);
      expect(sarif.runs[0].results[0].ruleId).toBe('security/eval-usage');
      expect(sarif.runs[0].properties.suppressedFindingCount).toBe(original.findings.length);
      expect(sarif.runs[0].automationDetails.description.text).toContain(
        `${original.findings.length} findings suppressed by baseline.`,
      );
    } finally {
      await removeProject(dir);
    }
  });

  it('records exactly the existing SARIF identities, including POSIX paths', async () => {
    const result = await scanDirectory(path.join(FIXTURES, 'vulnerable-nextjs'));
    const log = JSON.parse(
      getReporter('sarif')(result, { color: false, quiet: false, root: '/' }),
    ) as {
      runs: { results: { partialFingerprints: { shipcheckRuleLocation: string } }[] }[];
    };
    expect(createBaseline(result.findings).fingerprints).toEqual(
      [
        ...new Set(log.runs[0]!.results.map((r) => r.partialFingerprints.shipcheckRuleLocation)),
      ].sort(),
    );
    expect(result.findings.flatMap((f) => f.evidence).every((ev) => !ev.file.includes('\\'))).toBe(
      true,
    );
    expect(result.suppressedFindingCount).toBe(0);
  });
});
