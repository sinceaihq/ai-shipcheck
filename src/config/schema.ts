import { SEVERITIES, CATEGORIES, type Category, type Severity } from '../types/core.js';
import { ConfigError } from '../utils/errors.js';

/** Per-rule override. `"off"` disables; an object refines severity. */
export type RuleSetting =
  'off' | 'on' | { readonly severity?: Severity; readonly enabled?: boolean };

/** User configuration, all fields optional. */
export interface ShipcheckConfig {
  /** Extra `.gitignore`-syntax patterns excluded from the scan. */
  readonly exclude: readonly string[];
  /** Per-rule enable/disable and severity overrides. */
  readonly rules: Readonly<Record<string, RuleSetting>>;
  /** Whole categories to skip. */
  readonly disabledCategories: readonly Category[];
  /** Minimum acceptable score; below it the CLI exits non-zero. */
  readonly minScore: number | null;
  /** Exit non-zero when a finding of this severity or worse exists. */
  readonly failOn: Severity | 'none' | null;
  /** Honour `.gitignore` files while walking. */
  readonly respectGitignore: boolean;
  /** Resource ceilings. */
  readonly limits: {
    readonly maxFileSizeBytes?: number;
    readonly maxFiles?: number;
    readonly maxTotalBytes?: number;
    readonly maxDepth?: number;
  };
  /** Absolute path of the file these settings came from, if any. */
  readonly sourcePath: string | null;
}

export const DEFAULT_CONFIG: ShipcheckConfig = {
  exclude: [],
  rules: {},
  disabledCategories: [],
  minScore: null,
  failOn: null,
  respectGitignore: true,
  limits: {},
  sourcePath: null,
};

const KNOWN_KEYS = new Set([
  '$schema',
  'exclude',
  'rules',
  'disabledCategories',
  'minScore',
  'failOn',
  'respectGitignore',
  'limits',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectStringArray(value: unknown, key: string, file: string): readonly string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new ConfigError(
      `Invalid "${key}" in ${file}: expected an array of strings, got ${describeType(value)}.`,
      `Example: "${key}": ["**/legacy/**"]`,
    );
  }
  return value as readonly string[];
}

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}

/**
 * Validate raw parsed JSON into a {@link ShipcheckConfig}.
 *
 * Every rejection names the offending key, what was expected and an example,
 * because a config error is the single most likely thing to block a first run.
 */
export function validateConfig(raw: unknown, file: string): ShipcheckConfig {
  if (!isPlainObject(raw)) {
    throw new ConfigError(
      `Invalid configuration in ${file}: expected a JSON object, got ${describeType(raw)}.`,
    );
  }

  for (const key of Object.keys(raw)) {
    if (!KNOWN_KEYS.has(key)) {
      const suggestion = closestKey(key);
      throw new ConfigError(
        `Unknown option "${key}" in ${file}.`,
        suggestion !== null
          ? `Did you mean "${suggestion}"? Valid options: ${[...KNOWN_KEYS].filter((k) => k !== '$schema').join(', ')}.`
          : `Valid options: ${[...KNOWN_KEYS].filter((k) => k !== '$schema').join(', ')}.`,
      );
    }
  }

  const exclude =
    raw['exclude'] === undefined ? [] : expectStringArray(raw['exclude'], 'exclude', file);

  const rules: Record<string, RuleSetting> = {};
  if (raw['rules'] !== undefined) {
    if (!isPlainObject(raw['rules'])) {
      throw new ConfigError(
        `Invalid "rules" in ${file}: expected an object keyed by rule id, got ${describeType(raw['rules'])}.`,
        'Example: "rules": { "security/eval-usage": "off" }',
      );
    }
    for (const [ruleId, setting] of Object.entries(raw['rules'])) {
      rules[ruleId] = validateRuleSetting(ruleId, setting, file);
    }
  }

  let disabledCategories: readonly Category[] = [];
  if (raw['disabledCategories'] !== undefined) {
    const list = expectStringArray(raw['disabledCategories'], 'disabledCategories', file);
    for (const c of list) {
      if (!(CATEGORIES as readonly string[]).includes(c)) {
        throw new ConfigError(
          `Unknown category "${c}" in ${file}.`,
          `Valid categories: ${CATEGORIES.join(', ')}.`,
        );
      }
    }
    disabledCategories = list as readonly Category[];
  }

  let minScore: number | null = null;
  if (raw['minScore'] !== undefined && raw['minScore'] !== null) {
    const value = raw['minScore'];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
      throw new ConfigError(
        `Invalid "minScore" in ${file}: expected a number between 0 and 100, got ${JSON.stringify(value)}.`,
      );
    }
    minScore = value;
  }

  let failOn: Severity | 'none' | null = null;
  if (raw['failOn'] !== undefined && raw['failOn'] !== null) {
    const value = raw['failOn'];
    const allowedFailOn: readonly string[] = [...SEVERITIES, 'none'];
    if (typeof value !== 'string' || !allowedFailOn.includes(value)) {
      throw new ConfigError(
        `Invalid "failOn" in ${file}: expected one of ${[...SEVERITIES, 'none'].join(', ')}, got ${JSON.stringify(value)}.`,
      );
    }
    failOn = value as Severity | 'none';
  }

  let respectGitignore = true;
  if (raw['respectGitignore'] !== undefined) {
    if (typeof raw['respectGitignore'] !== 'boolean') {
      throw new ConfigError(
        `Invalid "respectGitignore" in ${file}: expected true or false, got ${describeType(raw['respectGitignore'])}.`,
      );
    }
    respectGitignore = raw['respectGitignore'];
  }

  const limits: Record<string, number> = {};
  if (raw['limits'] !== undefined) {
    if (!isPlainObject(raw['limits'])) {
      throw new ConfigError(
        `Invalid "limits" in ${file}: expected an object, got ${describeType(raw['limits'])}.`,
      );
    }
    const allowed = ['maxFileSizeBytes', 'maxFiles', 'maxTotalBytes', 'maxDepth'];
    for (const [key, value] of Object.entries(raw['limits'])) {
      if (!allowed.includes(key)) {
        throw new ConfigError(
          `Unknown limit "${key}" in ${file}.`,
          `Valid limits: ${allowed.join(', ')}.`,
        );
      }
      if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        throw new ConfigError(
          `Invalid limit "${key}" in ${file}: expected a positive integer, got ${JSON.stringify(value)}.`,
        );
      }
      limits[key] = value;
    }
  }

  return {
    exclude,
    rules,
    disabledCategories,
    minScore,
    failOn,
    respectGitignore,
    limits,
    sourcePath: file,
  };
}

function validateRuleSetting(ruleId: string, setting: unknown, file: string): RuleSetting {
  if (setting === 'off' || setting === 'on') return setting;
  if (isPlainObject(setting)) {
    const result: { severity?: Severity; enabled?: boolean } = {};
    for (const [key, value] of Object.entries(setting)) {
      if (key === 'severity') {
        if (typeof value !== 'string' || !(SEVERITIES as readonly string[]).includes(value)) {
          throw new ConfigError(
            `Invalid severity for rule "${ruleId}" in ${file}: expected one of ${SEVERITIES.join(', ')}, got ${JSON.stringify(value)}.`,
          );
        }
        result.severity = value as Severity;
      } else if (key === 'enabled') {
        if (typeof value !== 'boolean') {
          throw new ConfigError(
            `Invalid "enabled" for rule "${ruleId}" in ${file}: expected true or false.`,
          );
        }
        result.enabled = value;
      } else {
        throw new ConfigError(
          `Unknown option "${key}" for rule "${ruleId}" in ${file}.`,
          'Valid rule options: severity, enabled.',
        );
      }
    }
    return result;
  }
  throw new ConfigError(
    `Invalid setting for rule "${ruleId}" in ${file}: expected "off", "on" or an object.`,
    'Example: "rules": { "security/eval-usage": { "severity": "medium" } }',
  );
}

/** Levenshtein-based suggestion for a misspelled top-level key. */
function closestKey(key: string): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const candidate of KNOWN_KEYS) {
    if (candidate === '$schema') continue;
    const d = editDistance(key.toLowerCase(), candidate.toLowerCase());
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  }
  return bestDistance <= 3 ? best : null;
}

function editDistance(a: string, b: string): number {
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]!;
  }
  return prev[b.length]!;
}
