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
import { findingFingerprint } from '../../src/utils/fingerprint.js';
import { FIXTURES, makeProject, removeProject, scanDirectory } from '../helpers/project.js';

describe('baseline scan pipeline', () => {
  it('matches moved findings, preserves duplicate occurrences, and reports new findings', async () => {
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

      // Move concrete source findings and prepend a comment to the root layout.
      const target = path.join(root, 'lib', 'http.ts');
      await fs.writeFile(
        target,
        `// unrelated comment\n\n${await fs.readFile(target, 'utf8')}`,
        'utf8',
      );
      const layout = path.join(root, 'app', 'layout.tsx');
      await fs.writeFile(
        layout,
        `// unrelated comment\n${await fs.readFile(layout, 'utf8')}`,
        'utf8',
      );
      const moved = await scanDirectory(root);
      const before = original.findings.find((f) => f.evidence[0]?.file === 'lib/http.ts')!;
      const after = moved.findings.find(
        (f) => f.ruleId === before.ruleId && f.evidence[0]?.snippet === before.evidence[0]?.snippet,
      )!;
      expect(after.evidence[0]!.line).toBe(before.evidence[0]!.line + 2);
      const boundaryBefore = original.findings.find(
        (f) => f.ruleId === 'observability/missing-error-boundary',
      )!;
      const boundaryAfter = moved.findings.find(
        (f) => f.ruleId === 'observability/missing-error-boundary',
      )!;
      expect(boundaryAfter.evidence[0]!.line).toBe(boundaryBefore.evidence[0]!.line + 1);
      expect(boundaryAfter.evidence[0]!.snippet).toBe(boundaryBefore.evidence[0]!.snippet);

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

      const route = path.join(root, 'app', 'api', 'token', 'route.ts');
      const routeSource = await fs.readFile(route, 'utf8');
      await fs.writeFile(
        route,
        routeSource.replace(
          '    legacy: eval(body.expression),',
          '    legacy: eval(body.expression),\n    legacy: eval(body.expression),',
        ),
        'utf8',
      );
      await fs.writeFile(path.join(root, 'lib', 'new-problem.ts'), 'eval(newInput);\n', 'utf8');
      const result = await scan();
      expect(result.findings).toHaveLength(2);
      const newSameFingerprint = result.findings.filter(
        (f) => f.evidence[0]?.file === 'app/api/token/route.ts',
      );
      expect(newSameFingerprint).toHaveLength(1);
      expect(newSameFingerprint[0]).toMatchObject({
        ruleId: 'security/eval-usage',
        evidence: [{ file: 'app/api/token/route.ts', snippet: 'legacy: eval(body.expression),' }],
      });
      expect(
        result.findings.find((f) => f.evidence[0]?.file === 'lib/new-problem.ts'),
      ).toMatchObject({
        ruleId: 'security/eval-usage',
        evidence: [{ file: 'lib/new-problem.ts', line: 1, snippet: 'eval(newInput);' }],
      });
      expect(result.suppressedFindingCount).toBe(original.findings.length);
      expect(result.checks.find((c) => c.ruleId === 'security/eval-usage')).toMatchObject({
        status: 'fail',
        findingCount: 2,
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
      expect(sarif.runs[0].results).toHaveLength(2);
      expect(
        (sarif.runs[0].results as { ruleId: string }[]).every(
          (entry) => entry.ruleId === 'security/eval-usage',
        ),
      ).toBe(true);
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
      [...log.runs[0]!.results.map((r) => r.partialFingerprints.shipcheckRuleLocation)].sort(),
    );
    expect(result.findings.flatMap((f) => f.evidence).every((ev) => !ev.file.includes('\\'))).toBe(
      true,
    );
    expect(result.suppressedFindingCount).toBe(0);
  });

  it('anchors the root layout to JSX when a preceding string contains <html>', async () => {
    const dir = await makeProject({});
    try {
      const root = path.join(dir, 'project');
      await fs.cp(path.join(FIXTURES, 'vulnerable-nextjs'), root, { recursive: true });
      const original = await scanDirectory(root);
      const baseline = createBaseline(original.findings);
      const before = original.findings.find(
        (f) => f.ruleId === 'observability/missing-error-boundary',
      )!;
      const layout = path.join(root, 'app', 'layout.tsx');
      await fs.writeFile(
        layout,
        (await fs.readFile(layout, 'utf8')).replace(
          'export default function RootLayout',
          'const sample = "<html>";\nexport default function RootLayout',
        ),
        'utf8',
      );

      const changed = await scanDirectory(root);
      const after = changed.findings.find(
        (f) => f.ruleId === 'observability/missing-error-boundary',
      )!;
      expect(after.evidence[0]!.line).toBe(before.evidence[0]!.line + 1);
      expect(after.evidence[0]!.snippet).toBe(before.evidence[0]!.snippet);
      expect(findingFingerprint(after)).toBe(findingFingerprint(before));
      const accepted = await runScan({
        root,
        config: DEFAULT_CONFIG,
        registry: createDefaultRegistry(),
        baseline,
      });
      expect(accepted.findings.some((f) => f.ruleId === before.ruleId)).toBe(false);
    } finally {
      await removeProject(dir);
    }
  });

  it('anchors a layout without an html element to its default export', async () => {
    const dir = await makeProject({});
    try {
      const root = path.join(dir, 'project');
      await fs.cp(path.join(FIXTURES, 'vulnerable-nextjs'), root, { recursive: true });
      const layout = path.join(root, 'app', 'layout.tsx');
      const source = (await fs.readFile(layout, 'utf8'))
        .replace('<html>', '<>')
        .replace('</html>', '</>');
      await fs.writeFile(layout, source, 'utf8');
      const original = await scanDirectory(root);
      const before = original.findings.find(
        (f) => f.ruleId === 'observability/missing-error-boundary',
      )!;
      expect(before.evidence[0]!.snippet).toContain('export default function RootLayout');

      await fs.writeFile(
        layout,
        `// unrelated comment\nconst sample = "<html>";\n${source}`,
        'utf8',
      );
      const changed = await scanDirectory(root);
      const after = changed.findings.find(
        (f) => f.ruleId === 'observability/missing-error-boundary',
      )!;
      expect(after.evidence[0]!.snippet).toBe(before.evidence[0]!.snippet);
      expect(findingFingerprint(after)).toBe(findingFingerprint(before));
    } finally {
      await removeProject(dir);
    }
  });
});
