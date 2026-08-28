/**
 * The published version string.
 *
 * Kept as a literal rather than read from `package.json` at runtime so the
 * bundled GitHub Action has no filesystem dependency and so the value is
 * available in every output format without an async read.
 * `scripts/check-version.mjs` asserts it matches `package.json`.
 */
export const VERSION = '1.0.1';
