import type { ScanResult } from '../types/core.js';

/** Options every reporter receives. */
export interface ReporterOptions {
  /** Whether ANSI colour is permitted in the output. */
  readonly color: boolean;
  /** Suppress non-essential sections. */
  readonly quiet: boolean;
  /** Absolute path the scan was run against, for display. */
  readonly root: string;
}

/** A reporter turns a scan result into text. Reporters never write files. */
export type Reporter = (result: ScanResult, options: ReporterOptions) => string;

export const FORMATS = ['pretty', 'json', 'markdown', 'sarif'] as const;
export type Format = (typeof FORMATS)[number];
