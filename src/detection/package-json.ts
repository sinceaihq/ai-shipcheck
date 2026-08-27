import { parseJsonc, JsonParseError } from '../utils/jsonc.js';

/** The subset of `package.json` Shipcheck reasons about. */
export interface PackageJson {
  readonly name?: string;
  readonly version?: string;
  readonly private?: boolean;
  readonly type?: string;
  readonly workspaces?: readonly string[] | { readonly packages?: readonly string[] };
  readonly scripts?: Record<string, string>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
  readonly engines?: Record<string, string>;
}

export interface PackageJsonResult {
  readonly data: PackageJson | null;
  /** Human-readable problem, if the file existed but could not be used. */
  readonly warning: string | null;
}

function stringRecord(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

/**
 * Parse `package.json` defensively. A malformed manifest degrades detection
 * but must never abort a scan — plenty of real repositories have one.
 */
export function parsePackageJson(text: string, file: string): PackageJsonResult {
  let raw: unknown;
  try {
    raw = parseJsonc(text, file);
  } catch (error) {
    if (error instanceof JsonParseError) return { data: null, warning: error.message };
    return { data: null, warning: `Could not parse ${file}.` };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { data: null, warning: `${file} does not contain a JSON object.` };
  }
  const obj = raw as Record<string, unknown>;
  const result: PackageJson = {
    ...(typeof obj['name'] === 'string' ? { name: obj['name'] } : {}),
    ...(typeof obj['version'] === 'string' ? { version: obj['version'] } : {}),
    ...(typeof obj['private'] === 'boolean' ? { private: obj['private'] } : {}),
    ...(typeof obj['type'] === 'string' ? { type: obj['type'] } : {}),
    ...(obj['workspaces'] !== undefined ? { workspaces: obj['workspaces'] as never } : {}),
    scripts: stringRecord(obj['scripts']),
    dependencies: stringRecord(obj['dependencies']),
    devDependencies: stringRecord(obj['devDependencies']),
    peerDependencies: stringRecord(obj['peerDependencies']),
    optionalDependencies: stringRecord(obj['optionalDependencies']),
    engines: stringRecord(obj['engines']),
  };
  return { data: result, warning: null };
}

/** All runtime + dev dependency names, deduplicated. */
export function allDependencyNames(pkg: PackageJson | null): Set<string> {
  const names = new Set<string>();
  if (pkg === null) return names;
  for (const group of [
    pkg.dependencies,
    pkg.devDependencies,
    pkg.peerDependencies,
    pkg.optionalDependencies,
  ]) {
    if (group === undefined) continue;
    for (const name of Object.keys(group)) names.add(name);
  }
  return names;
}
