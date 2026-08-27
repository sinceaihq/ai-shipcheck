import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extname, isInside, relativePosix, toPosix } from '../../src/utils/paths.js';

describe('path helpers', () => {
  it('produces POSIX separators regardless of platform', () => {
    const joined = path.join('app', 'api', 'route.ts');
    expect(toPosix(joined)).toBe('app/api/route.ts');
  });

  it('computes repository-relative POSIX paths', () => {
    const root = path.resolve('/tmp/project');
    const file = path.join(root, 'src', 'index.ts');
    expect(relativePosix(root, file)).toBe('src/index.ts');
  });

  it('rejects paths that escape the root', () => {
    const root = path.resolve('/tmp/project');
    expect(isInside(root, path.join(root, 'a', 'b'))).toBe(true);
    expect(isInside(root, root)).toBe(true);
    expect(isInside(root, path.resolve(root, '..', 'other'))).toBe(false);
    expect(isInside(root, path.resolve('/etc/passwd'))).toBe(false);
  });

  it('does not confuse a sibling directory with a prefix match', () => {
    const root = path.resolve('/tmp/project');
    expect(isInside(root, path.resolve('/tmp/project-other/file.ts'))).toBe(false);
  });

  it('every test fixture filename is creatable on Windows', async () => {
    // Windows forbids | * ? " < > : in filenames. A test that creates one
    // passes on Linux and macOS and fails the whole Windows matrix, which is
    // an expensive way to find out.
    const fs = await import('node:fs/promises');
    const url = await import('node:url');
    const testsDir = path.resolve(url.fileURLToPath(import.meta.url), '..', '..');
    const illegal = /[|*?"<>]|:(?!\\\\)/;
    const offenders: string[] = [];

    async function walk(dir: string): Promise<void> {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
          continue;
        }
        if (!full.endsWith('.ts')) continue;
        const content = await fs.readFile(full, 'utf8');
        // Filenames appear as object keys in makeProject({ ... }) calls.
        for (const match of content.matchAll(/'([\w./ -]*[^'\n]*\.tsx?)':/g)) {
          if (illegal.test(match[1] ?? '')) {
            offenders.push(`${path.relative(testsDir, full)}: ${match[1]}`);
          }
        }
      }
    }
    await walk(testsDir);

    expect(offenders, 'filenames that cannot be created on Windows').toEqual([]);
  });

  it('lowercases extensions', () => {
    expect(extname('App.TSX')).toBe('.tsx');
    expect(extname('Dockerfile')).toBe('');
  });
});
