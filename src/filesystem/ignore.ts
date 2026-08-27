import fs from 'node:fs/promises';
import path from 'node:path';
import ignoreFactory, { type Ignore } from 'ignore';
import { toPosix } from '../utils/paths.js';

/**
 * Directories that are never worth scanning. These are matched by name at any
 * depth, before any `.gitignore` handling, because they dominate walk time in
 * a typical JavaScript repository.
 */
export const ALWAYS_IGNORED_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.astro',
  '.turbo',
  '.vercel',
  '.netlify',
  '.wrangler',
  '.output',
  '.cache',
  '.parcel-cache',
  '.yarn',
  '.pnpm-store',
  '.venv',
  'venv',
  '__pycache__',
  'dist',
  'build',
  'out',
  'coverage',
  '.nyc_output',
  'storybook-static',
  'vendor',
  'bower_components',
  'Pods',
  'DerivedData',
  '.gradle',
  '.idea',
  '.vscode-test',
  '.terraform',
]);

/**
 * File globs ignored by default. Generated bundles and lockfiles produce noise
 * with essentially no signal.
 */
export const DEFAULT_IGNORE_PATTERNS: readonly string[] = [
  '*.min.js',
  '*.min.css',
  '*.bundle.js',
  '*.map',
  '*.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'bun.lock',
  '*.snap',
  '*.wasm',
  '*.d.ts',
  '**/generated/**',
  '**/__generated__/**',
  '**/*.generated.*',
];

/**
 * A stack of `.gitignore`-style matchers, each scoped to the directory it was
 * loaded from — mirroring how git itself resolves nested ignore files.
 */
export class IgnoreStack {
  /** Entries are ordered outermost-first. */
  readonly #layers: { dir: string; matcher: Ignore }[] = [];

  private constructor(layers: { dir: string; matcher: Ignore }[]) {
    this.#layers = layers;
  }

  /**
   * Create a stack seeded with Shipcheck's built-in patterns plus any
   * user-supplied excludes.
   */
  static create(root: string, extraPatterns: readonly string[] = []): IgnoreStack {
    const matcher = ignoreFactory().add([...DEFAULT_IGNORE_PATTERNS, ...extraPatterns]);
    return new IgnoreStack([{ dir: root, matcher }]);
  }

  /**
   * Return a new stack with the ignore file in `dir` layered on top, if one
   * exists. The original stack is not mutated, so sibling directories do not
   * see each other's rules.
   */
  async withIgnoreFilesIn(dir: string): Promise<IgnoreStack> {
    const patterns: string[] = [];
    for (const name of ['.gitignore', '.shipcheckignore']) {
      try {
        const text = await fs.readFile(path.join(dir, name), 'utf8');
        patterns.push(text);
      } catch {
        // Absent or unreadable ignore files are simply not layered.
      }
    }
    if (patterns.length === 0) return this;
    const matcher = ignoreFactory().add(patterns.join('\n'));
    return new IgnoreStack([...this.#layers, { dir, matcher }]);
  }

  /**
   * Test an absolute path against every layer.
   *
   * @param absolutePath - Path to test.
   * @param isDirectory - Directories are tested with a trailing slash so that
   *   `build/` style patterns behave the way git defines them.
   */
  ignores(absolutePath: string, isDirectory: boolean): boolean {
    for (const layer of this.#layers) {
      const rel = path.relative(layer.dir, absolutePath);
      if (rel === '' || rel.startsWith('..')) continue;
      const posix = toPosix(rel) + (isDirectory ? '/' : '');
      if (layer.matcher.ignores(posix)) return true;
    }
    return false;
  }
}
