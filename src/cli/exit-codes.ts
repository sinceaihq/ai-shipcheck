/**
 * Process exit codes.
 *
 * These are part of the CLI contract: CI pipelines branch on them, so they are
 * documented in README.md and must not be renumbered without a major version.
 */
export const EXIT = {
  /** The scan completed and every configured threshold was met. */
  OK: 0,
  /** The scan completed but --fail-on or --min-score was not satisfied. */
  THRESHOLD_NOT_MET: 1,
  /** Bad usage: unknown flag, invalid value, unreadable config or target. */
  USAGE: 2,
  /** Shipcheck itself failed unexpectedly. */
  INTERNAL: 3,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];
