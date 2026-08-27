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

  it('lowercases extensions', () => {
    expect(extname('App.TSX')).toBe('.tsx');
    expect(extname('Dockerfile')).toBe('');
  });
});
