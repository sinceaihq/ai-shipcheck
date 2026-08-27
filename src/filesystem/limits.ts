/**
 * Resource ceilings applied to every scan.
 *
 * Shipcheck is routinely pointed at repositories it has never seen, including
 * hostile ones. These limits bound memory, wall-clock time and the damage a
 * pathological tree can do. They are overridable through configuration but the
 * defaults are chosen so a scan of an unknown repo always terminates.
 */
export interface ScanLimits {
  /** Files larger than this are recorded as skipped and never read. */
  readonly maxFileSizeBytes: number;
  /** Hard cap on the number of files read in one scan. */
  readonly maxFiles: number;
  /** Hard cap on total bytes read into memory across the scan. */
  readonly maxTotalBytes: number;
  /** Maximum directory nesting below the scan root. */
  readonly maxDepth: number;
  /** Files with more lines than this are skipped as generated. */
  readonly maxLines: number;
}

export const DEFAULT_LIMITS: ScanLimits = {
  maxFileSizeBytes: 1024 * 1024,
  maxFiles: 25_000,
  maxTotalBytes: 192 * 1024 * 1024,
  maxDepth: 24,
  maxLines: 20_000,
};

/**
 * Source extensions Shipcheck reads for lexical analysis. Anything else is
 * only considered by name (for example lockfiles and CI workflows).
 */
export const SOURCE_EXTENSIONS: readonly string[] = [
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
];

/** Extensions read as plain text for non-lexical rules. */
export const TEXT_EXTENSIONS: readonly string[] = [
  '.json',
  '.sql',
  '.yml',
  '.yaml',
  '.env',
  '.toml',
  '.md',
  '.prisma',
  '.html',
  '.sh',
  '.dockerfile',
];

/** Filenames always read regardless of extension. */
export const ALWAYS_READ_FILENAMES: readonly string[] = [
  'package.json',
  'tsconfig.json',
  'jsconfig.json',
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'vite.config.ts',
  'vite.config.js',
  'dockerfile',
  'procfile',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.env.example',
  '.env.sample',
  'vercel.json',
  'netlify.toml',
  'railway.json',
  'fly.toml',
  'middleware.ts',
  'middleware.js',
];
