import path from 'node:path';

/**
 * Path helpers shared by the scanner and every reporter.
 *
 * Every path that appears in Shipcheck output is a repository-relative POSIX
 * path, so a scan of the same project produces byte-identical reports on
 * Windows, macOS and Linux.
 */

/** Convert a platform-native path to POSIX separators. */
export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

/** Repository-relative POSIX path of `absolute` within `root`. */
export function relativePosix(root: string, absolute: string): string {
  return toPosix(path.relative(root, absolute));
}

/**
 * True when `candidate` resolves inside `root`.
 *
 * Used to reject symlinks and `..` segments that would let a scan escape the
 * directory the user pointed at.
 */
export function isInside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  if (rel === '') return true;
  return !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel);
}

/** Lowercase extension including the leading dot, or `''`. */
export function extname(p: string): string {
  return path.extname(p).toLowerCase();
}
