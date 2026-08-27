import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { walk } from '../../src/filesystem/walk.js';
import { readTextFile, looksGenerated } from '../../src/filesystem/read.js';
import { IgnoreStack } from '../../src/filesystem/ignore.js';

const created: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shipcheck-fs-'));
  created.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

const acceptAll = (): boolean => true;

/**
 * Whether this platform lets an unprivileged process create symlinks.
 *
 * Windows requires either Developer Mode or an elevated process. The symlink
 * containment tests are gated on this rather than left to fail, so a Windows
 * run reports "skipped because the platform refused" instead of a red build
 * that nobody can act on. The behaviour under test is platform-independent;
 * only the ability to set up the fixture is not.
 */
async function canCreateSymlinks(): Promise<boolean> {
  const dir = await tempDir();
  try {
    await fs.writeFile(path.join(dir, 'target.txt'), 'x');
    await fs.symlink(path.join(dir, 'target.txt'), path.join(dir, 'link.txt'), 'file');
    return true;
  } catch {
    return false;
  }
}

const symlinksSupported = await canCreateSymlinks();
const itWithSymlinks = symlinksSupported ? it : it.skip;

/**
 * The walker is the part of Shipcheck that touches untrusted input first.
 * Every property tested here is a containment guarantee, not a nicety.
 */
describe('walk', () => {
  it('finds files and reports repository-relative POSIX paths', async () => {
    const dir = await tempDir();
    await fs.mkdir(path.join(dir, 'src', 'api'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'api', 'route.ts'), 'export const x = 1;');
    await fs.writeFile(path.join(dir, 'package.json'), '{}');

    const result = await walk({ root: dir, accept: acceptAll });
    expect(result.files.map((f) => f.path)).toEqual(['package.json', 'src/api/route.ts']);
    expect(result.truncated).toBe(false);
  });

  it('never descends into node_modules or .git', async () => {
    const dir = await tempDir();
    for (const name of ['node_modules', '.git', 'dist', 'coverage']) {
      await fs.mkdir(path.join(dir, name), { recursive: true });
      await fs.writeFile(path.join(dir, name, 'file.js'), 'x');
    }
    await fs.writeFile(path.join(dir, 'index.js'), 'x');

    const result = await walk({ root: dir, accept: acceptAll });
    expect(result.files.map((f) => f.path)).toEqual(['index.js']);
  });

  it('honours .gitignore, including nested ones', async () => {
    const dir = await tempDir();
    await fs.writeFile(path.join(dir, '.gitignore'), 'secret.txt\n');
    await fs.writeFile(path.join(dir, 'secret.txt'), 'x');
    await fs.writeFile(path.join(dir, 'keep.txt'), 'x');
    await fs.mkdir(path.join(dir, 'nested'), { recursive: true });
    await fs.writeFile(path.join(dir, 'nested', '.gitignore'), 'local.txt\n');
    await fs.writeFile(path.join(dir, 'nested', 'local.txt'), 'x');
    await fs.writeFile(path.join(dir, 'nested', 'shared.txt'), 'x');

    const result = await walk({ root: dir, accept: acceptAll });
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain('keep.txt');
    expect(paths).toContain('nested/shared.txt');
    expect(paths).not.toContain('secret.txt');
    expect(paths).not.toContain('nested/local.txt');
  });

  it('does not apply a nested .gitignore to sibling directories', async () => {
    const dir = await tempDir();
    await fs.mkdir(path.join(dir, 'a'), { recursive: true });
    await fs.mkdir(path.join(dir, 'b'), { recursive: true });
    await fs.writeFile(path.join(dir, 'a', '.gitignore'), 'data.txt\n');
    await fs.writeFile(path.join(dir, 'a', 'data.txt'), 'x');
    await fs.writeFile(path.join(dir, 'b', 'data.txt'), 'x');

    const result = await walk({ root: dir, accept: acceptAll });
    const paths = result.files.map((f) => f.path);
    expect(paths).toEqual(['a/.gitignore', 'b/data.txt']);
  });

  it('can be told to ignore .gitignore entirely', async () => {
    const dir = await tempDir();
    await fs.writeFile(path.join(dir, '.gitignore'), 'secret.txt\n');
    await fs.writeFile(path.join(dir, 'secret.txt'), 'x');

    const result = await walk({ root: dir, accept: acceptAll, respectGitignore: false });
    expect(result.files.map((f) => f.path)).toContain('secret.txt');
  });

  it('applies configuration excludes', async () => {
    const dir = await tempDir();
    await fs.mkdir(path.join(dir, 'legacy'), { recursive: true });
    await fs.writeFile(path.join(dir, 'legacy', 'old.ts'), 'x');
    await fs.writeFile(path.join(dir, 'new.ts'), 'x');

    const result = await walk({ root: dir, accept: acceptAll, exclude: ['legacy/**'] });
    expect(result.files.map((f) => f.path)).toEqual(['new.ts']);
  });

  itWithSymlinks('refuses to follow a symlink pointing outside the scan root', async () => {
    const outside = await tempDir();
    await fs.writeFile(path.join(outside, 'secret.txt'), 'do not read me');
    const dir = await tempDir();
    await fs.symlink(outside, path.join(dir, 'escape'), 'dir');
    await fs.writeFile(path.join(dir, 'inside.txt'), 'x');

    const result = await walk({ root: dir, accept: acceptAll });
    expect(result.files.map((f) => f.path)).toEqual(['inside.txt']);
    expect(result.skipped.some((s) => s.reason === 'symlink-outside-root')).toBe(true);
  });

  itWithSymlinks('refuses to follow a symlink to a file outside the scan root', async () => {
    const outside = await tempDir();
    const target = path.join(outside, 'secret.txt');
    await fs.writeFile(target, 'do not read me');
    const dir = await tempDir();
    await fs.symlink(target, path.join(dir, 'link.txt'), 'file');

    const result = await walk({ root: dir, accept: acceptAll });
    expect(result.files).toHaveLength(0);
    expect(result.skipped.some((s) => s.reason === 'symlink-outside-root')).toBe(true);
  });

  itWithSymlinks('terminates on a self-referential symlink loop', async () => {
    const dir = await tempDir();
    await fs.mkdir(path.join(dir, 'a'), { recursive: true });
    await fs.writeFile(path.join(dir, 'a', 'file.ts'), 'x');
    await fs.symlink(dir, path.join(dir, 'a', 'loop'), 'dir');

    const result = await walk({ root: dir, accept: acceptAll });
    expect(result.files.map((f) => f.path)).toEqual(['a/file.ts']);
    expect(result.skipped.some((s) => s.reason === 'symlink-loop')).toBe(true);
  });

  it('skips files larger than the configured limit', async () => {
    const dir = await tempDir();
    await fs.writeFile(path.join(dir, 'big.ts'), 'x'.repeat(2048));
    await fs.writeFile(path.join(dir, 'small.ts'), 'x');

    const result = await walk({ root: dir, accept: acceptAll, limits: { maxFileSizeBytes: 1024 } });
    expect(result.files.map((f) => f.path)).toEqual(['small.ts']);
    expect(result.skipped.some((s) => s.path === 'big.ts' && s.reason === 'too-large')).toBe(true);
  });

  it('stops at the file-count limit and reports truncation', async () => {
    const dir = await tempDir();
    for (let i = 0; i < 10; i++) {
      await fs.writeFile(path.join(dir, `f${i}.ts`), 'x');
    }

    const result = await walk({ root: dir, accept: acceptAll, limits: { maxFiles: 4 } });
    expect(result.files).toHaveLength(4);
    expect(result.truncated).toBe(true);
  });

  it('stops at the total-bytes limit', async () => {
    const dir = await tempDir();
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(path.join(dir, `f${i}.ts`), 'x'.repeat(100));
    }

    const result = await walk({ root: dir, accept: acceptAll, limits: { maxTotalBytes: 250 } });
    expect(result.files.length).toBeLessThanOrEqual(3);
    expect(result.truncated).toBe(true);
  });

  it('stops at the depth limit', async () => {
    const dir = await tempDir();
    const deep = path.join(dir, 'a', 'b', 'c', 'd', 'e');
    await fs.mkdir(deep, { recursive: true });
    await fs.writeFile(path.join(deep, 'deep.ts'), 'x');
    await fs.writeFile(path.join(dir, 'top.ts'), 'x');

    const result = await walk({ root: dir, accept: acceptAll, limits: { maxDepth: 2 } });
    expect(result.files.map((f) => f.path)).toEqual(['top.ts']);
    expect(result.truncated).toBe(true);
  });

  it('produces a stable, sorted file order', async () => {
    const dir = await tempDir();
    for (const name of ['c.ts', 'a.ts', 'b.ts']) {
      await fs.writeFile(path.join(dir, name), 'x');
    }
    const first = await walk({ root: dir, accept: acceptAll });
    const second = await walk({ root: dir, accept: acceptAll });
    expect(first.files.map((f) => f.path)).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(first.files).toEqual(second.files);
  });

  it('respects the accept predicate', async () => {
    const dir = await tempDir();
    await fs.writeFile(path.join(dir, 'keep.ts'), 'x');
    await fs.writeFile(path.join(dir, 'drop.png'), 'x');

    const result = await walk({ root: dir, accept: (p) => p.endsWith('.ts') });
    expect(result.files.map((f) => f.path)).toEqual(['keep.ts']);
  });
});

describe('readTextFile', () => {
  it('reads UTF-8 text and strips a BOM', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'a.ts');
    await fs.writeFile(file, `\uFEFFconst a = 1;`);
    const outcome = await readTextFile(file, 1000);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.content.startsWith('const')).toBe(true);
  });

  it('refuses binary files', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'a.bin');
    await fs.writeFile(file, Buffer.from([0x89, 0x50, 0x00, 0x01, 0x02]));
    const outcome = await readTextFile(file, 1000);
    expect(outcome).toMatchObject({ ok: false, reason: 'binary' });
  });

  it('refuses files with too many lines', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'a.ts');
    await fs.writeFile(file, 'x\n'.repeat(50));
    const outcome = await readTextFile(file, 10);
    expect(outcome).toMatchObject({ ok: false, reason: 'too-many-lines' });
  });

  it('reports unreadable files without throwing', async () => {
    const outcome = await readTextFile(path.join(os.tmpdir(), 'definitely-missing-file.ts'), 100);
    expect(outcome).toMatchObject({ ok: false, reason: 'unreadable' });
  });
});

describe('looksGenerated', () => {
  it('flags minified bundles', () => {
    expect(looksGenerated(`${'a'.repeat(6000)}\n`)).toBe(true);
  });

  it('leaves normal source alone', () => {
    expect(looksGenerated('const a = 1;\n'.repeat(600))).toBe(false);
  });
});

describe('IgnoreStack', () => {
  it('matches directories with a trailing slash', () => {
    const root = path.resolve('/tmp/project');
    const stack = IgnoreStack.create(root, ['build/']);
    expect(stack.ignores(path.join(root, 'build'), true)).toBe(true);
    expect(stack.ignores(path.join(root, 'build'), false)).toBe(false);
  });

  it('ignores minified files by default', () => {
    const root = path.resolve('/tmp/project');
    const stack = IgnoreStack.create(root);
    expect(stack.ignores(path.join(root, 'app.min.js'), false)).toBe(true);
    expect(stack.ignores(path.join(root, 'app.js'), false)).toBe(false);
  });
});
