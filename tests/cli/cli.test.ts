import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../../src/cli/index.js';
import { parseCliArgs } from '../../src/cli/args.js';
import { EXIT } from '../../src/cli/exit-codes.js';
import { UsageError } from '../../src/utils/errors.js';
import { VERSION } from '../../src/version.js';
import { FIXTURES, makeProject, removeProject } from '../helpers/project.js';

interface Captured {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function cli(...argv: string[]): Promise<Captured> {
  let stdout = '';
  let stderr = '';
  const io: CliIo = {
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
    env: { NO_COLOR: '1' },
    isTty: false,
  };
  const code = await runCli(argv, io);
  return { code, stdout, stderr };
}

describe('parseCliArgs', () => {
  it('treats a bare path as a scan', () => {
    const args = parseCliArgs(['.']);
    expect(args.command).toBe('scan');
    expect(args.positionals).toEqual(['.']);
  });

  it('accepts the explicit scan command', () => {
    expect(parseCliArgs(['scan', 'apps/web']).positionals).toEqual(['apps/web']);
  });

  it('defaults the format to pretty', () => {
    expect(parseCliArgs([]).format).toBe('pretty');
  });

  it('rejects an unknown format with a helpful hint', () => {
    expect(() => parseCliArgs(['--format', 'yaml'])).toThrow(UsageError);
    try {
      parseCliArgs(['--format', 'yaml']);
    } catch (error) {
      expect((error as UsageError).hint).toContain('sarif');
    }
  });

  it('rejects an out-of-range min-score', () => {
    expect(() => parseCliArgs(['--min-score', '150'])).toThrow(/Invalid --min-score/);
    try {
      parseCliArgs(['--min-score', '150']);
    } catch (error) {
      expect((error as UsageError).hint).toContain('between 0 and 100');
    }
  });

  it('rejects an invalid fail-on value', () => {
    expect(() => parseCliArgs(['--fail-on', 'catastrophic'])).toThrow(/Invalid --fail-on/);
  });

  it('accepts fail-on none', () => {
    expect(parseCliArgs(['--fail-on', 'none']).failOn).toBe('none');
  });

  it('rejects an unknown flag by name', () => {
    expect(() => parseCliArgs(['--nope'])).toThrow(/--nope/);
  });

  it('requires a rule id for explain', () => {
    expect(() => parseCliArgs(['explain'])).toThrow(/needs a rule id/);
  });

  it('maps --no-color to colour off', () => {
    expect(parseCliArgs(['--no-color']).color).toBe(false);
    expect(parseCliArgs([]).color).toBeUndefined();
  });
});

describe('ai-shipcheck --help', () => {
  it('prints usage, options and exit codes', async () => {
    const { code, stdout } = await cli('--help');
    expect(code).toBe(EXIT.OK);
    expect(stdout).toContain('USAGE');
    expect(stdout).toContain('--format');
    expect(stdout).toContain('EXIT CODES');
    expect(stdout).toContain('No signup, no API key, no source-code upload.');
  });
});

describe('ai-shipcheck --version', () => {
  it('prints just the version', async () => {
    const { code, stdout } = await cli('--version');
    expect(code).toBe(EXIT.OK);
    expect(stdout.trim()).toBe(VERSION);
  });
});

describe('ai-shipcheck rules', () => {
  it('lists every rule grouped by category', async () => {
    const { code, stdout } = await cli('rules');
    expect(code).toBe(EXIT.OK);
    expect(stdout).toContain('Security');
    expect(stdout).toContain('security/eval-usage');
    expect(stdout).toMatch(/\d+ rules/);
  });

  it('filters by category', async () => {
    const { stdout } = await cli('rules', '--category', 'accessibility');
    expect(stdout).toContain('accessibility/img-missing-alt');
    expect(stdout).not.toContain('security/eval-usage');
  });

  it('rejects an unknown category', async () => {
    const { code, stderr } = await cli('rules', '--category', 'vibes');
    expect(code).toBe(EXIT.USAGE);
    expect(stderr).toContain('Unknown category');
  });

  it('emits machine-readable output with --json', async () => {
    const { stdout } = await cli('rules', '--json');
    const rules = JSON.parse(stdout) as { id: string; severity: string }[];
    expect(rules.length).toBeGreaterThan(40);
    expect(rules[0]).toHaveProperty('severity');
  });
});

describe('ai-shipcheck explain', () => {
  it('explains a known rule', async () => {
    const { code, stdout } = await cli('explain', 'database/supabase-missing-rls');
    expect(code).toBe(EXIT.OK);
    expect(stdout).toContain('database/supabase-missing-rls');
    expect(stdout).toContain('What this means');
    expect(stdout).toContain('How to fix it');
    expect(stdout).toContain('blocker');
  });

  it('suggests a near miss for an unknown rule', async () => {
    const { code, stderr } = await cli('explain', 'security/eval-usag');
    expect(code).toBe(EXIT.USAGE);
    expect(stderr).toContain('security/eval-usage');
  });

  it('emits JSON with --json', async () => {
    const { stdout } = await cli('explain', 'security/eval-usage', '--json');
    const rule = JSON.parse(stdout) as { id: string; references: string[] };
    expect(rule.id).toBe('security/eval-usage');
    expect(Array.isArray(rule.references)).toBe(true);
  });
});

describe('ai-shipcheck scan', () => {
  it('scans a clean project and exits 0', async () => {
    const { code, stdout } = await cli(path.join(FIXTURES, 'secure-nextjs'));
    expect(code).toBe(EXIT.OK);
    expect(stdout).toContain('READY');
  });

  it('scans a broken project and still exits 0 without thresholds', async () => {
    const { code, stdout } = await cli(path.join(FIXTURES, 'vulnerable-nextjs'));
    expect(code).toBe(EXIT.OK);
    expect(stdout).toContain('NOT READY');
  });

  it('exits 1 when --fail-on is not satisfied', async () => {
    const { code, stderr } = await cli(
      path.join(FIXTURES, 'vulnerable-nextjs'),
      '--fail-on',
      'high',
    );
    expect(code).toBe(EXIT.THRESHOLD_NOT_MET);
    expect(stderr).toContain('--fail-on high');
  });

  it('exits 0 when --fail-on is satisfied', async () => {
    const { code } = await cli(path.join(FIXTURES, 'secure-nextjs'), '--fail-on', 'low');
    expect(code).toBe(EXIT.OK);
  });

  it('exits 1 when --min-score is not met', async () => {
    const { code, stderr } = await cli(
      path.join(FIXTURES, 'vulnerable-nextjs'),
      '--min-score',
      '90',
    );
    expect(code).toBe(EXIT.THRESHOLD_NOT_MET);
    expect(stderr).toContain('below the required minimum');
  });

  it('never fails on findings when --fail-on none is passed', async () => {
    const { code } = await cli(path.join(FIXTURES, 'vulnerable-nextjs'), '--fail-on', 'none');
    expect(code).toBe(EXIT.OK);
  });

  it('emits JSON on request', async () => {
    const { stdout } = await cli(path.join(FIXTURES, 'secure-api'), '--format', 'json');
    const parsed = JSON.parse(stdout) as { verdict: string; schemaVersion: string };
    expect(parsed.verdict).toBe('READY');
    expect(parsed.schemaVersion).toBe('1.0');
  });

  it('writes to a file with --output and prints nothing to stdout', async () => {
    const dir = await makeProject({ 'package.json': '{"name":"x"}' });
    try {
      const target = path.join(dir, 'reports', 'shipcheck.sarif');
      const { code, stdout } = await cli(
        path.join(FIXTURES, 'vulnerable-supabase'),
        '--format',
        'sarif',
        '--output',
        target,
      );
      expect(code).toBe(EXIT.OK);
      expect(stdout).toBe('');
      const written = JSON.parse(await fs.readFile(target, 'utf8')) as { version: string };
      expect(written.version).toBe('2.1.0');
    } finally {
      await removeProject(dir);
    }
  });

  it('strips ANSI when writing pretty output to a file', async () => {
    const dir = await makeProject({ 'package.json': '{"name":"x"}' });
    try {
      const target = path.join(dir, 'report.txt');
      await cli(path.join(FIXTURES, 'secure-api'), '--output', target);
      const written = await fs.readFile(target, 'utf8');
      expect(written).not.toMatch(/\[/);
    } finally {
      await removeProject(dir);
    }
  });

  it('reports a missing directory readably', async () => {
    const { code, stderr } = await cli('./definitely-not-a-real-directory');
    expect(code).toBe(EXIT.USAGE);
    expect(stderr).toContain('No such directory');
    expect(stderr).toContain('ai-shipcheck .');
  });

  it('refuses a file target with an explanation', async () => {
    const { code, stderr } = await cli(path.join(FIXTURES, 'secure-api', 'package.json'));
    expect(code).toBe(EXIT.USAGE);
    expect(stderr).toContain('is a file, not a directory');
  });

  it('reports an invalid config file readably', async () => {
    const dir = await makeProject({ 'shipcheck.config.json': '{ "minScore": }' });
    try {
      const { code, stderr } = await cli(dir);
      expect(code).toBe(EXIT.USAGE);
      expect(stderr).toContain('Could not parse');
    } finally {
      await removeProject(dir);
    }
  });

  it('reports a missing --config path readably', async () => {
    const { code, stderr } = await cli(
      path.join(FIXTURES, 'secure-api'),
      '--config',
      'missing.json',
    );
    expect(code).toBe(EXIT.USAGE);
    expect(stderr).toContain('Configuration file not found');
  });

  it('applies configuration from --config', async () => {
    const dir = await makeProject({ 'sc.json': '{ "minScore": 100 }' });
    try {
      const { code } = await cli(
        path.join(FIXTURES, 'vulnerable-ai-api'),
        '--config',
        path.join(dir, 'sc.json'),
      );
      expect(code).toBe(EXIT.THRESHOLD_NOT_MET);
    } finally {
      await removeProject(dir);
    }
  });

  it('produces no ANSI when NO_COLOR is set', async () => {
    const { stdout } = await cli(path.join(FIXTURES, 'secure-api'));
    expect(stdout).not.toMatch(/\[/);
  });
});
