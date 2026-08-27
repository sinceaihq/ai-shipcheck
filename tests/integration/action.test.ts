import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../helpers/project.js';

const run = promisify(execFile);
const ACTION = path.join(REPO_ROOT, 'action', 'dist', 'index.js');

interface ActionRun {
  readonly code: number;
  readonly stdout: string;
  readonly outputs: Record<string, string>;
  readonly summary: string;
  readonly workspace: string;
}

/** Parse the delimiter form of the GITHUB_OUTPUT file protocol. */
function parseOutputs(text: string): Record<string, string> {
  const outputs: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const header = /^([^<]+)<<(.+)$/.exec(lines[i] ?? '');
    if (header === null) continue;
    const [, name, delimiter] = header;
    const body: string[] = [];
    for (i++; i < lines.length && lines[i] !== delimiter; i++) body.push(lines[i] ?? '');
    outputs[name!.trim()] = body.join('\n');
  }
  return outputs;
}

async function runAction(inputs: Record<string, string>, fixture: string): Promise<ActionRun> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'shipcheck-action-'));
  await fs.cp(path.join(REPO_ROOT, 'fixtures', fixture), path.join(workspace, 'project'), {
    recursive: true,
  });
  const outputFile = path.join(workspace, 'outputs.txt');
  const summaryFile = path.join(workspace, 'summary.md');
  await fs.writeFile(outputFile, '');
  await fs.writeFile(summaryFile, '');

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GITHUB_WORKSPACE: workspace,
    GITHUB_OUTPUT: outputFile,
    GITHUB_STEP_SUMMARY: summaryFile,
    INPUT_PATH: 'project',
  };
  for (const [key, value] of Object.entries(inputs)) {
    env[`INPUT_${key.toUpperCase()}`] = value;
  }

  let stdout = '';
  let code = 0;
  try {
    ({ stdout } = await run(process.execPath, [ACTION], { env, maxBuffer: 32 * 1024 * 1024 }));
  } catch (error) {
    const failure = error as { code?: number; stdout?: string };
    stdout = failure.stdout ?? '';
    code = failure.code ?? 1;
  }

  return {
    code,
    stdout,
    outputs: parseOutputs(await fs.readFile(outputFile, 'utf8')),
    summary: await fs.readFile(summaryFile, 'utf8'),
    workspace,
  };
}

/**
 * The action is what most users will actually run. These tests exercise the
 * committed bundle, not the source, because that bundle is what a workflow
 * executes when it pins a tag.
 */
describe('the bundled GitHub Action', () => {
  beforeAll(async () => {
    try {
      await fs.access(ACTION);
    } catch {
      await run(process.execPath, [path.join(REPO_ROOT, 'scripts', 'build-action.mjs')], {
        cwd: REPO_ROOT,
      });
    }
  }, 60_000);

  it('reports a clean project and succeeds', async () => {
    const result = await runAction({}, 'secure-nextjs');
    expect(result.code).toBe(0);
    expect(result.outputs['verdict']).toBe('READY');
    expect(result.outputs['score']).toBe('100');
    expect(result.outputs['critical-count']).toBe('0');
    expect(result.outputs['high-count']).toBe('0');
    expect(result.outputs['findings-count']).toBe('0');
    expect(result.stdout).not.toContain('::error');
  });

  it('sets every documented output for a broken project', async () => {
    const result = await runAction({}, 'vulnerable-supabase');
    expect(result.code).toBe(0); // no thresholds configured
    expect(result.outputs['verdict']).toBe('NOT READY');
    expect(Number(result.outputs['score'])).toBeLessThan(100);
    expect(Number(result.outputs['critical-count'])).toBeGreaterThan(0);
    expect(Number(result.outputs['high-count'])).toBeGreaterThan(0);
    expect(result.outputs['sarif-file']).toBe('shipcheck.sarif');
  });

  it('fails the job when fail-on is not satisfied', async () => {
    const result = await runAction({ 'fail-on': 'critical' }, 'vulnerable-supabase');
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('::error::AI Shipcheck failed this run');
  });

  it('fails the job when min-score is not met', async () => {
    const result = await runAction({ 'min-score': '95' }, 'vulnerable-supabase');
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('below the required minimum');
  });

  it('emits inline annotations with escaped properties', async () => {
    const result = await runAction({}, 'vulnerable-supabase');
    const annotations = result.stdout.split('\n').filter((l) => l.startsWith('::error title='));
    expect(annotations.length).toBeGreaterThan(0);
    for (const annotation of annotations) {
      expect(annotation).toMatch(/file=[^,]+,line=\d+/);
      // Raw newlines and colons must be escaped inside the command.
      const [, properties] = /^::error (.*?)::/.exec(annotation) ?? [];
      expect(properties).not.toContain(': ');
    }
  });

  it('writes a SARIF file that parses', async () => {
    const result = await runAction({}, 'vulnerable-ai-api');
    const sarif = JSON.parse(
      await fs.readFile(path.join(result.workspace, 'shipcheck.sarif'), 'utf8'),
    ) as { version: string; runs: { results: unknown[] }[] };
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0]!.results.length).toBeGreaterThan(0);
  });

  it('writes a job summary', async () => {
    const result = await runAction({}, 'vulnerable-nextjs');
    expect(result.summary).toContain('# AI Shipcheck report');
    expect(result.summary).toContain('NOT READY');
  });

  it('can be told not to annotate or summarise', async () => {
    const result = await runAction({ annotations: 'false', summary: 'false' }, 'vulnerable-nextjs');
    expect(result.stdout).not.toContain('::error title=');
    expect(result.summary).toBe('');
  });

  it('reports a bad path input clearly instead of crashing', async () => {
    const result = await runAction({ path: 'does-not-exist' }, 'secure-api');
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('actions/checkout');
  });

  it('rejects an invalid fail-on value with a readable message', async () => {
    const result = await runAction({ 'fail-on': 'catastrophic' }, 'secure-api');
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('must be one of');
  });

  it('never prints a fixture credential', async () => {
    const result = await runAction({}, 'vulnerable-nextjs');
    expect(result.stdout).not.toContain('SHIPCHECKFIXTUREKEY000000000000');
    expect(result.summary).not.toContain('SHIPCHECKFIXTUREKEY000000000000');
  });
});
