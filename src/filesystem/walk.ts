import fs from 'node:fs/promises';
import path from 'node:path';
import type { Dirent, Stats } from 'node:fs';
import { IgnoreStack, ALWAYS_IGNORED_DIRS } from './ignore.js';
import { DEFAULT_LIMITS, type ScanLimits } from './limits.js';
import { isInside, relativePosix } from '../utils/paths.js';

/** A file the walker decided to hand to the scanner. */
export interface WalkedFile {
  /** Repository-relative POSIX path. */
  readonly path: string;
  readonly absolutePath: string;
  readonly size: number;
}

/** Why a file or directory was not scanned. */
export type SkipReason =
  | 'ignored'
  | 'too-large'
  | 'binary'
  | 'symlink-outside-root'
  | 'symlink-loop'
  | 'unreadable'
  | 'depth-limit'
  | 'file-limit'
  | 'byte-limit';

export interface WalkSkip {
  readonly path: string;
  readonly reason: SkipReason;
}

export interface WalkResult {
  readonly files: readonly WalkedFile[];
  readonly skipped: readonly WalkSkip[];
  readonly warnings: readonly string[];
  /** True when a limit stopped the walk before the tree was exhausted. */
  readonly truncated: boolean;
}

export interface WalkOptions {
  readonly root: string;
  readonly limits?: Partial<ScanLimits>;
  /** Extra `.gitignore`-syntax exclusion patterns from configuration. */
  readonly exclude?: readonly string[];
  /** When false, `.gitignore` files are not consulted. Defaults to true. */
  readonly respectGitignore?: boolean;
  /** Predicate deciding whether a file is interesting enough to read. */
  readonly accept: (relativePath: string, size: number) => boolean;
}

/**
 * Walk a repository safely.
 *
 * Safety properties, all exercised by `tests/unit/filesystem.test.ts`:
 *
 * - **No escape.** Symlinked directories are resolved with `realpath` and
 *   skipped unless the target is inside the scan root.
 * - **No loops.** Every directory's real path is recorded; revisiting one ends
 *   that branch, so a self-referential symlink cannot spin.
 * - **Bounded.** File count, per-file size and total bytes are all capped; the
 *   walk stops cleanly and reports `truncated` rather than exhausting memory.
 * - **No execution.** The walker only ever calls `readdir`/`lstat`. Nothing in
 *   the target repository is executed, imported, or evaluated.
 */
export async function walk(options: WalkOptions): Promise<WalkResult> {
  const limits: ScanLimits = { ...DEFAULT_LIMITS, ...options.limits };
  // The root is resolved through realpath so containment checks compare like
  // with like. On macOS `/tmp` is a symlink to `/private/tmp`, and without
  // this every path inside a temporary directory looks as though it escapes.
  const root = await resolveScanRoot(options.root);
  const respectGitignore = options.respectGitignore ?? true;

  const files: WalkedFile[] = [];
  const skipped: WalkSkip[] = [];
  const warnings: string[] = [];
  const visitedRealDirs = new Set<string>();
  let totalBytes = 0;
  let truncated = false;

  const rootReal = await safeRealpath(root);
  if (rootReal !== null) visitedRealDirs.add(rootReal);

  const baseStack = IgnoreStack.create(root, options.exclude ?? []);

  const queue: { dir: string; depth: number; stack: IgnoreStack }[] = [
    { dir: root, depth: 0, stack: baseStack },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth > limits.maxDepth) {
      skipped.push({ path: relativePosix(root, current.dir), reason: 'depth-limit' });
      truncated = true;
      continue;
    }

    const stack = respectGitignore
      ? await current.stack.withIgnoreFilesIn(current.dir)
      : current.stack;

    let entries: Dirent[];
    try {
      entries = await fs.readdir(current.dir, { withFileTypes: true });
    } catch (error) {
      warnings.push(
        `Could not read directory ${relativePosix(root, current.dir) || '.'}: ${describeFsError(error)}`,
      );
      skipped.push({ path: relativePosix(root, current.dir), reason: 'unreadable' });
      continue;
    }

    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const entry of entries) {
      const abs = path.join(current.dir, entry.name);
      const rel = relativePosix(root, abs);

      if (entry.isDirectory() && ALWAYS_IGNORED_DIRS.has(entry.name)) {
        skipped.push({ path: rel, reason: 'ignored' });
        continue;
      }

      if (entry.isSymbolicLink()) {
        const target = await safeRealpath(abs);
        if (target === null) {
          skipped.push({ path: rel, reason: 'unreadable' });
          continue;
        }
        if (!isInside(root, target)) {
          skipped.push({ path: rel, reason: 'symlink-outside-root' });
          continue;
        }
        let targetStat: Stats;
        try {
          targetStat = await fs.stat(abs);
        } catch {
          skipped.push({ path: rel, reason: 'unreadable' });
          continue;
        }
        if (targetStat.isDirectory()) {
          if (visitedRealDirs.has(target)) {
            skipped.push({ path: rel, reason: 'symlink-loop' });
            continue;
          }
          if (stack.ignores(abs, true)) {
            skipped.push({ path: rel, reason: 'ignored' });
            continue;
          }
          visitedRealDirs.add(target);
          queue.push({ dir: abs, depth: current.depth + 1, stack });
          continue;
        }
        if (targetStat.isFile()) {
          const accepted = considerFile(rel, targetStat.size);
          if (accepted) continue;
        }
        continue;
      }

      if (entry.isDirectory()) {
        if (stack.ignores(abs, true)) {
          skipped.push({ path: rel, reason: 'ignored' });
          continue;
        }
        const real = await safeRealpath(abs);
        if (real !== null) {
          if (visitedRealDirs.has(real)) {
            skipped.push({ path: rel, reason: 'symlink-loop' });
            continue;
          }
          visitedRealDirs.add(real);
        }
        queue.push({ dir: abs, depth: current.depth + 1, stack });
        continue;
      }

      if (!entry.isFile()) continue; // sockets, FIFOs, devices

      if (stack.ignores(abs, false)) {
        skipped.push({ path: rel, reason: 'ignored' });
        continue;
      }

      let stat: Stats;
      try {
        stat = await fs.lstat(abs);
      } catch (error) {
        warnings.push(`Could not stat ${rel}: ${describeFsError(error)}`);
        skipped.push({ path: rel, reason: 'unreadable' });
        continue;
      }
      considerFile(rel, stat.size);
    }
  }

  /**
   * Apply size/count/byte limits and record the file if it survives.
   * @returns true when the file was accepted.
   */
  function considerFile(rel: string, size: number): boolean {
    if (files.length >= limits.maxFiles) {
      truncated = true;
      skipped.push({ path: rel, reason: 'file-limit' });
      return false;
    }
    if (size > limits.maxFileSizeBytes) {
      skipped.push({ path: rel, reason: 'too-large' });
      return false;
    }
    if (!options.accept(rel, size)) {
      skipped.push({ path: rel, reason: 'ignored' });
      return false;
    }
    if (totalBytes + size > limits.maxTotalBytes) {
      truncated = true;
      skipped.push({ path: rel, reason: 'byte-limit' });
      return false;
    }
    totalBytes += size;
    files.push({ path: rel, absolutePath: path.join(root, ...rel.split('/')), size });
    return true;
  }

  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, skipped, warnings, truncated };
}

/**
 * Resolve a scan root to its canonical location.
 *
 * Falls back to the lexically resolved path when the directory cannot be
 * realpath'd, so a permission error surfaces later as a readable warning
 * rather than here as an exception.
 */
export async function resolveScanRoot(target: string): Promise<string> {
  const resolved = path.resolve(target);
  return (await safeRealpath(resolved)) ?? resolved;
}

async function safeRealpath(p: string): Promise<string | null> {
  try {
    return await fs.realpath(p);
  } catch {
    return null;
  }
}

function describeFsError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code !== undefined ? `${code}` : error.message;
  }
  return String(error);
}
