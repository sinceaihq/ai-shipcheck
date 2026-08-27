/**
 * Error types with messages written for humans.
 *
 * Rule enforced across the codebase: an error a user can see must name the
 * thing that failed, say what was expected and, where possible, point at a
 * location. `Error: undefined` is a bug, not an error message.
 */

/** Base class for errors that are the user's to fix, not a Shipcheck defect. */
export class ShipcheckError extends Error {
  /** Suggested process exit code. */
  readonly exitCode: number;
  /** Optional actionable hint printed beneath the message. */
  readonly hint: string | undefined;

  constructor(
    message: string,
    options: { exitCode?: number; hint?: string; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ShipcheckError';
    this.exitCode = options.exitCode ?? 2;
    this.hint = options.hint;
  }
}

/** Bad flags, unknown commands, conflicting options. */
export class UsageError extends ShipcheckError {
  constructor(message: string, hint?: string) {
    super(message, hint === undefined ? { exitCode: 2 } : { exitCode: 2, hint });
    this.name = 'UsageError';
  }
}

/** A configuration file exists but is invalid. */
export class ConfigError extends ShipcheckError {
  constructor(message: string, hint?: string) {
    super(message, hint === undefined ? { exitCode: 2 } : { exitCode: 2, hint });
    this.name = 'ConfigError';
  }
}

/** The scan target is missing, unreadable or not a directory. */
export class TargetError extends ShipcheckError {
  constructor(message: string, hint?: string) {
    super(message, hint === undefined ? { exitCode: 2 } : { exitCode: 2, hint });
    this.name = 'TargetError';
  }
}

/** Render an unknown thrown value as a readable single line. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.length > 0 ? error.message : error.name;
  }
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}
