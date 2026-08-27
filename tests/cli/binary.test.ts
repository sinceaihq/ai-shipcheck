import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { FIXTURES, REPO_ROOT } from '../helpers/project.js';
import { VERSION } from '../../src/version.js';

const run = promisify(execFile);
const CLI = path.join(REPO_ROOT, 'dist', 'cli', 'index.js');

interface Ran {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * These spawn the built binary rather than importing it. The shebang, the
 * executable bit, ESM resolution from the published layout and the process
 * exit code only exist in the artefact users actually run.
 */
async function shipcheck(...args: string[]): Promise<Ran> {
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args], {
      env: { ...process.env, NO_COLOR: '1' },
      maxBuffer: 32 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

describe('the built binary', () => {
  it('prints its version', async () => {
    const result = await shipcheck('--version');
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(VERSION);
  });

  it('scans a fixture and exits 0', async () => {
    const result = await shipcheck(path.join(FIXTURES, 'secure-api'));
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('READY');
  });

  it('exits 1 when a threshold is not met', async () => {
    const result = await shipcheck(
      path.join(FIXTURES, 'vulnerable-nextjs'),
      '--fail-on',
      'critical',
    );
    expect(result.code).toBe(1);
  });

  it('exits 2 on a usage error', async () => {
    const result = await shipcheck('--format', 'toml');
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Unknown output format');
  });

  it('emits SARIF that parses', async () => {
    const result = await shipcheck(path.join(FIXTURES, 'vulnerable-supabase'), '--format', 'sarif');
    const log = JSON.parse(result.stdout) as { version: string };
    expect(log.version).toBe('2.1.0');
  });

  it('runs when invoked through a symlink, the way npm installs it', async () => {
    // npm links the binary into node_modules/.bin as a symlink. An entry-point
    // check that compares raw paths never matches there, and the CLI exits
    // silently having done nothing - which is exactly the bug this pins.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shipcheck-bin-'));
    try {
      const link = path.join(dir, 'ai-shipcheck');
      try {
        await fs.symlink(CLI, link, 'file');
      } catch {
        // Windows without Developer Mode refuses symlink creation. The
        // behaviour under test is platform-independent; only the fixture is.
        return;
      }
      const { stdout } = await run(process.execPath, [link, '--version'], {
        env: { ...process.env, NO_COLOR: '1' },
      });
      expect(stdout.trim()).toBe(VERSION);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('does not crash when the reader closes the pipe', async () => {
    // `ai-shipcheck . --format json | head` closes stdout mid-write. An
    // unhandled EPIPE prints a Node stack trace over the user's terminal and
    // makes a working scan look like a crash.
    const { execFile: rawExecFile } = await import('node:child_process');
    const result = await new Promise<{ code: number; stderr: string }>((resolve) => {
      const child = rawExecFile(
        process.execPath,
        [CLI, path.join(FIXTURES, 'vulnerable-nextjs'), '--format', 'json'],
        { env: { ...process.env, NO_COLOR: '1' }, maxBuffer: 32 * 1024 * 1024 },
        () => undefined,
      );
      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      // Read one chunk, then destroy the pipe the way `head` does.
      child.stdout?.once('data', () => child.stdout?.destroy());
      child.on('close', (code) => resolve({ code: code ?? 0, stderr }));
    });

    expect(result.stderr).not.toContain('EPIPE');
    expect(result.stderr).not.toContain('Unhandled');
    expect(result.code).toBeLessThanOrEqual(1);
  });

  it('scans the current directory by default', async () => {
    const { stdout, code } = await shipcheck();
    expect(code).toBeLessThanOrEqual(1);
    expect(stdout).toMatch(/assessed check|nothing assessed/);
  });
});
