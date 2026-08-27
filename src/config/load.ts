import fs from 'node:fs/promises';
import path from 'node:path';
import { parseJsonc, JsonParseError } from '../utils/jsonc.js';
import { ConfigError } from '../utils/errors.js';
import { DEFAULT_CONFIG, validateConfig, type ShipcheckConfig } from './schema.js';

/**
 * Configuration file names searched in the scan root, in priority order.
 * Configuration is entirely optional — the zero-config path must stay perfect.
 */
export const CONFIG_FILENAMES: readonly string[] = [
  'shipcheck.config.json',
  '.shipcheckrc.json',
  '.shipcheckrc',
];

export interface LoadConfigOptions {
  /** Directory to search when no explicit path is given. */
  readonly root: string;
  /** Explicit `--config` path. When set, a missing file is an error. */
  readonly explicitPath?: string | undefined;
}

/**
 * Load configuration.
 *
 * Resolution order:
 * 1. `--config <file>` when supplied (missing file is a hard error).
 * 2. The first of {@link CONFIG_FILENAMES} present in the scan root.
 * 3. A `"shipcheck"` key in the root `package.json`.
 * 4. Built-in defaults.
 */
export async function loadConfig(options: LoadConfigOptions): Promise<ShipcheckConfig> {
  if (options.explicitPath !== undefined) {
    const abs = path.resolve(options.explicitPath);
    let text: string;
    try {
      text = await fs.readFile(abs, 'utf8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      throw new ConfigError(
        code === 'ENOENT'
          ? `Configuration file not found: ${options.explicitPath}`
          : `Could not read configuration file ${options.explicitPath} (${code ?? 'unknown error'}).`,
        'Pass --config with a path relative to your current directory, or omit it to use shipcheck.config.json in the scan root.',
      );
    }
    return validateConfig(parseConfigText(text, abs), abs);
  }

  for (const name of CONFIG_FILENAMES) {
    const abs = path.join(options.root, name);
    let text: string;
    try {
      text = await fs.readFile(abs, 'utf8');
    } catch {
      continue;
    }
    return validateConfig(parseConfigText(text, abs), abs);
  }

  const pkgPath = path.join(options.root, 'package.json');
  try {
    const text = await fs.readFile(pkgPath, 'utf8');
    const pkg = parseConfigText(text, pkgPath);
    if (typeof pkg === 'object' && pkg !== null && 'shipcheck' in pkg) {
      return validateConfig(
        (pkg as Record<string, unknown>)['shipcheck'],
        `${pkgPath} ("shipcheck")`,
      );
    }
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    // A malformed package.json is reported by the detection layer, not here.
  }

  return DEFAULT_CONFIG;
}

function parseConfigText(text: string, file: string): unknown {
  try {
    return parseJsonc(text, file);
  } catch (error) {
    if (error instanceof JsonParseError) {
      throw new ConfigError(
        error.message,
        'Shipcheck accepts JSON with comments and trailing commas.',
      );
    }
    throw error;
  }
}

/** Merge CLI overrides over a loaded configuration file. */
export function applyOverrides(
  config: ShipcheckConfig,
  overrides: {
    readonly minScore?: number | undefined;
    readonly failOn?: ShipcheckConfig['failOn'] | undefined;
    readonly exclude?: readonly string[] | undefined;
  },
): ShipcheckConfig {
  return {
    ...config,
    minScore: overrides.minScore ?? config.minScore,
    failOn: overrides.failOn ?? config.failOn,
    exclude:
      overrides.exclude === undefined ? config.exclude : [...config.exclude, ...overrides.exclude],
  };
}
