import type { Reporter } from './types.js';

/**
 * Machine-readable output.
 *
 * The shape is exactly the {@link ScanResult} type, which carries an explicit
 * `schemaVersion`. Consumers should branch on that field rather than sniffing
 * for properties.
 */
export const jsonReporter: Reporter = (result) => `${JSON.stringify(result, null, 2)}\n`;
