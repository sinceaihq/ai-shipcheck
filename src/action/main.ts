/**
 * GitHub Action entry point.
 *
 * The action is a thin wrapper over exactly the same scan the CLI runs. It
 * bundles the scanner into a single committed file so a workflow never
 * installs anything at run time - no npm registry call, no lockfile drift, no
 * postinstall script on a runner with a checked-out repository.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { applyOverrides, loadConfig } from '../config/load.js';
import { runScan } from '../core/engine.js';
import { createDefaultRegistry } from '../rules/index.js';
import { getReporter } from '../reporters/index.js';
import { countAtLeast } from '../scoring/score.js';
import { SEVERITIES, type Finding, type ScanResult, type Severity } from '../types/core.js';
import { describeError, ShipcheckError } from '../utils/errors.js';
import { VERSION } from '../version.js';
import {
  annotate,
  appendSummary,
  fail,
  getBooleanInput,
  getInput,
  group,
  setOutput,
} from './github.js';

/** Findings annotated inline. Beyond this GitHub stops rendering them anyway. */
const MAX_ANNOTATIONS = 40;

function severityToAnnotationLevel(severity: Severity): 'error' | 'warning' | 'notice' {
  if (severity === 'critical' || severity === 'high') return 'error';
  if (severity === 'medium') return 'warning';
  return 'notice';
}

function parseSeverityInput(name: string, value: string): Severity | 'none' | undefined {
  if (value === '') return undefined;
  const allowed: readonly string[] = [...SEVERITIES, 'none'];
  if (!allowed.includes(value)) {
    throw new ShipcheckError(
      `Input "${name}" must be one of ${allowed.join(', ')}, got "${value}".`,
    );
  }
  return value as Severity | 'none';
}

function parseScoreInput(name: string, value: string): number | undefined {
  if (value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new ShipcheckError(`Input "${name}" must be a number between 0 and 100, got "${value}".`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const workspace = process.env['GITHUB_WORKSPACE'] ?? process.cwd();
  const target = path.resolve(workspace, getInput('path') || '.');

  let stat;
  try {
    stat = await fs.stat(target);
  } catch {
    throw new ShipcheckError(
      `The path input points at ${target}, which does not exist. ` +
        'Make sure actions/checkout runs before this step and that "path" is relative to the repository root.',
    );
  }
  if (!stat.isDirectory()) {
    throw new ShipcheckError(`The path input must be a directory; ${target} is a file.`);
  }

  const failOn = parseSeverityInput('fail-on', getInput('fail-on'));
  const minScore = parseScoreInput('min-score', getInput('min-score'));
  const configInput = getInput('config');
  const sarifFile = getInput('sarif-file') || 'shipcheck.sarif';
  const wantSummary = getBooleanInput('summary', true);
  const wantAnnotations = getBooleanInput('annotations', true);

  const loaded = await loadConfig({
    root: target,
    explicitPath: configInput === '' ? undefined : path.resolve(workspace, configInput),
  });
  const config = applyOverrides(loaded, { minScore, failOn });

  const result = await runScan({ root: target, config, registry: createDefaultRegistry() });

  await writeSarif(result, path.resolve(workspace, sarifFile));

  if (wantAnnotations) emitAnnotations(result.findings);
  if (wantSummary)
    appendSummary(getReporter('markdown')(result, { color: false, quiet: false, root: target }));

  group(
    `AI Shipcheck v${VERSION}: ${result.verdict} (${result.score}/100)`,
    getReporter('pretty')(result, { color: false, quiet: true, root: target }),
  );

  const counts = {
    critical: result.findings.filter((f) => f.severity === 'critical').length,
    high: result.findings.filter((f) => f.severity === 'high').length,
    medium: result.findings.filter((f) => f.severity === 'medium').length,
    low: result.findings.filter((f) => f.severity === 'low').length,
  };

  setOutput('score', String(result.score));
  setOutput('verdict', result.verdict);
  setOutput('critical-count', String(counts.critical));
  setOutput('high-count', String(counts.high));
  setOutput('medium-count', String(counts.medium));
  setOutput('low-count', String(counts.low));
  setOutput('findings-count', String(result.findings.length));
  setOutput('sarif-file', sarifFile);

  const reasons: string[] = [];
  if (config.failOn !== null && config.failOn !== 'none') {
    const failing = countAtLeast(result.findings, config.failOn);
    if (failing > 0) {
      reasons.push(`${failing} finding(s) at severity "${config.failOn}" or worse.`);
    }
  }
  if (config.minScore !== null && result.score < config.minScore) {
    reasons.push(`Score ${result.score} is below the required minimum of ${config.minScore}.`);
  }

  if (reasons.length > 0) {
    fail(`AI Shipcheck failed this run: ${reasons.join(' ')}`);
  }
}

async function writeSarif(result: ScanResult, target: string): Promise<void> {
  const sarif = getReporter('sarif')(result, { color: false, quiet: true, root: '.' });
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, sarif, 'utf8');
}

function emitAnnotations(findings: readonly Finding[]): void {
  for (const finding of findings.slice(0, MAX_ANNOTATIONS)) {
    const evidence = finding.evidence[0];
    annotate({
      level: severityToAnnotationLevel(finding.severity),
      title: `${finding.severity.toUpperCase()}: ${finding.title}`,
      message: `${finding.explanation}\n\nFix: ${finding.remediation}\n\nRule: ${finding.ruleId} (confidence: ${finding.confidence})`,
      ...(evidence === undefined
        ? {}
        : {
            file: evidence.file,
            line: evidence.line,
            column: evidence.column,
            ...(evidence.endLine === undefined ? {} : { endLine: evidence.endLine }),
          }),
    });
  }
  if (findings.length > MAX_ANNOTATIONS) {
    annotate({
      level: 'notice',
      message: `${findings.length - MAX_ANNOTATIONS} further findings were not annotated inline. See the job summary or the uploaded SARIF report.`,
    });
  }
}

try {
  await main();
} catch (error) {
  fail(
    error instanceof ShipcheckError
      ? `${error.message}${error.hint === undefined ? '' : ` ${error.hint}`}`
      : `AI Shipcheck failed unexpectedly: ${describeError(error)}`,
  );
}
