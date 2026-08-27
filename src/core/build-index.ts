import path from 'node:path';
import fs from 'node:fs/promises';
import { walk, resolveScanRoot, type WalkSkip } from '../filesystem/walk.js';
import { readTextFile, looksGenerated } from '../filesystem/read.js';
import {
  ALWAYS_READ_FILENAMES,
  DEFAULT_LIMITS,
  SOURCE_EXTENSIONS,
  TEXT_EXTENSIONS,
  type ScanLimits,
} from '../filesystem/limits.js';
import { SourceFile } from '../analysis/source-file.js';
import { classifyFile } from '../detection/classify.js';
import { detectFrameworks } from '../detection/frameworks.js';
import { parsePackageJson, type PackageJson } from '../detection/package-json.js';
import { ProjectIndex } from './project-index.js';
import type { ProjectProfile } from '../types/core.js';
import { extname } from '../utils/paths.js';
import type { ShipcheckConfig } from '../config/schema.js';

export interface BuildIndexOptions {
  readonly root: string;
  readonly config: ShipcheckConfig;
  readonly limits?: Partial<ScanLimits>;
}

export interface BuildIndexResult {
  readonly index: ProjectIndex;
  readonly filesScanned: number;
  readonly filesSkipped: number;
  readonly bytesScanned: number;
  readonly warnings: readonly string[];
  readonly skipped: readonly WalkSkip[];
}

/** Decide whether a walked path is worth reading into memory. */
function shouldRead(relativePath: string): boolean {
  const base = relativePath.slice(relativePath.lastIndexOf('/') + 1).toLowerCase();
  if (ALWAYS_READ_FILENAMES.includes(base)) return true;
  if (base.startsWith('.env')) return true;
  const ext = extname(relativePath);
  if (SOURCE_EXTENSIONS.includes(ext)) return true;
  if (ext === '.json') {
    // Only manifests and framework configs; a 5 MB data fixture helps nobody.
    return (
      base === 'package.json' ||
      base === 'tsconfig.json' ||
      base === 'jsconfig.json' ||
      base === 'vercel.json' ||
      base === 'firebase.json' ||
      base === 'railway.json' ||
      base === 'shipcheck.config.json'
    );
  }
  if (ext === '.yml' || ext === '.yaml') {
    return relativePath.startsWith('.github/workflows/') || base.startsWith('.gitlab-ci');
  }
  if (TEXT_EXTENSIONS.includes(ext)) return true;
  return base === 'dockerfile' || base === 'procfile';
}

/**
 * Walk, read, classify and profile a repository, producing the immutable
 * {@link ProjectIndex} that the rule engine consumes.
 *
 * Nothing in the target repository is executed, imported or evaluated at any
 * point: files are read as bytes and analysed lexically.
 */
export async function buildIndex(options: BuildIndexOptions): Promise<BuildIndexResult> {
  const root = await resolveScanRoot(options.root);
  const limits: ScanLimits = { ...DEFAULT_LIMITS, ...options.config.limits, ...options.limits };

  const walked = await walk({
    root,
    limits,
    exclude: options.config.exclude,
    respectGitignore: options.config.respectGitignore,
    accept: (rel) => shouldRead(rel),
  });

  const warnings: string[] = [...walked.warnings];
  const skipped: WalkSkip[] = [...walked.skipped];
  const files: SourceFile[] = [];
  let bytesScanned = 0;

  // Read files with bounded concurrency so a large repository does not open
  // thousands of descriptors at once.
  const CONCURRENCY = 24;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, walked.files.length) }, async () => {
    for (;;) {
      const i = cursor++;
      const entry = walked.files[i];
      if (entry === undefined) return;
      const outcome = await readTextFile(entry.absolutePath, limits.maxLines);
      if (!outcome.ok) {
        skipped.push({
          path: entry.path,
          reason: outcome.reason === 'too-many-lines' ? 'too-large' : outcome.reason,
        });
        if (outcome.reason === 'unreadable') {
          warnings.push(`Could not read ${entry.path} (${outcome.detail ?? 'unknown error'}).`);
        }
        continue;
      }
      if (looksGenerated(outcome.content) && SOURCE_EXTENSIONS.includes(extname(entry.path))) {
        skipped.push({ path: entry.path, reason: 'too-large' });
        continue;
      }
      bytesScanned += entry.size;
      files.push(
        new SourceFile({
          path: entry.path,
          absolutePath: entry.absolutePath,
          content: outcome.content,
          size: entry.size,
          classification: classifyFile({ path: entry.path, content: outcome.content }),
        }),
      );
    }
  });
  await Promise.all(workers);

  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const pkgFile = files.find((f) => f.path === 'package.json');
  let packageJson: PackageJson | null = null;
  if (pkgFile !== undefined) {
    const parsed = parsePackageJson(pkgFile.content, 'package.json');
    packageJson = parsed.data;
    if (parsed.warning !== null) warnings.push(parsed.warning);
  }

  const allPaths = [...walked.files.map((f) => f.path), ...skipped.map((s) => s.path)].sort();
  const profile = await buildProfile({ root, packageJson, files, allPaths });

  if (packageJson === null && files.every((f) => !SOURCE_EXTENSIONS.includes(f.ext))) {
    warnings.push(
      `No package.json and no JavaScript or TypeScript source files were found under ${root}. ` +
        'Shipcheck v1 analyses JS/TS projects; point it at the directory that contains package.json.',
    );
  }

  const index = new ProjectIndex({ root, profile, files, allPaths, packageJson, warnings });

  return {
    index,
    filesScanned: files.length,
    filesSkipped: skipped.length,
    bytesScanned,
    warnings,
    skipped,
  };
}

async function detectPackageManager(root: string): Promise<ProjectProfile['packageManager']> {
  const candidates: readonly [string, NonNullable<ProjectProfile['packageManager']>][] = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['bun.lockb', 'bun'],
    ['bun.lock', 'bun'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
  ];
  for (const [file, manager] of candidates) {
    try {
      await fs.access(path.join(root, file));
      return manager;
    } catch {
      continue;
    }
  }
  return null;
}

async function buildProfile(input: {
  root: string;
  packageJson: PackageJson | null;
  files: readonly SourceFile[];
  allPaths: readonly string[];
}): Promise<ProjectProfile> {
  const { root, packageJson, files, allPaths } = input;
  const frameworks = detectFrameworks({ pkg: packageJson, paths: allPaths });

  const languages: ('typescript' | 'javascript')[] = [];
  if (files.some((f) => f.isTypeScript) || allPaths.includes('tsconfig.json'))
    languages.push('typescript');
  if (
    files.some((f) => f.ext === '.js' || f.ext === '.jsx' || f.ext === '.mjs' || f.ext === '.cjs')
  ) {
    languages.push('javascript');
  }

  const hasTests =
    files.some((f) => f.role === 'test') ||
    frameworks.some(
      (f) => f.id === 'vitest' || f.id === 'jest' || f.id === 'playwright' || f.id === 'cypress',
    );

  const hasCi = allPaths.some(
    (p) =>
      p.startsWith('.github/workflows/') || p === '.gitlab-ci.yml' || p === 'azure-pipelines.yml',
  );

  const workspaces = packageJson?.workspaces;
  const isMonorepo =
    workspaces !== undefined ||
    allPaths.includes('pnpm-workspace.yaml') ||
    allPaths.includes('lerna.json') ||
    allPaths.includes('turbo.json');

  return {
    root,
    name: packageJson?.name ?? null,
    packageManager: await detectPackageManager(root),
    frameworks,
    languages,
    hasServerCode: files.some((f) => f.isServer),
    hasClientCode: files.some((f) => f.isClient),
    hasTests,
    hasCi,
    isMonorepo,
    dependencies: packageJson?.dependencies ?? {},
    devDependencies: packageJson?.devDependencies ?? {},
    scripts: packageJson?.scripts ?? {},
  };
}
