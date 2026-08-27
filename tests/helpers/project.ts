import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CONFIG, type ShipcheckConfig } from '../../src/config/schema.js';
import { runScan } from '../../src/core/engine.js';
import { createDefaultRegistry } from '../../src/rules/index.js';
import { RuleRegistry } from '../../src/core/registry.js';
import { buildIndex } from '../../src/core/build-index.js';
import { SourceFile } from '../../src/analysis/source-file.js';
import { classifyFile } from '../../src/detection/classify.js';
import type { Rule } from '../../src/types/rule.js';
import type { ScanResult } from '../../src/types/core.js';

/** Repository root, resolved from this file so tests are cwd-independent. */
export const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

export const FIXTURES = path.join(REPO_ROOT, 'fixtures');

/** Create a temporary directory containing the given files. */
export async function makeProject(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shipcheck-test-'));
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(dir, ...relative.split('/'));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, contents, 'utf8');
  }
  return dir;
}

/** Remove a temporary directory created by {@link makeProject}. */
export async function removeProject(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

/** Scan a directory with the full built-in rule set. */
export async function scanDirectory(
  root: string,
  config: Partial<ShipcheckConfig> = {},
): Promise<ScanResult> {
  return runScan({
    root,
    config: { ...DEFAULT_CONFIG, ...config },
    registry: createDefaultRegistry(),
  });
}

/** Scan a directory with exactly one rule enabled. */
export async function scanWithRule(
  root: string,
  rule: Rule,
  config: Partial<ShipcheckConfig> = {},
): Promise<ScanResult> {
  return runScan({
    root,
    config: { ...DEFAULT_CONFIG, ...config },
    registry: RuleRegistry.from([rule]),
  });
}

/** Build a {@link SourceFile} from an in-memory string, without touching disk. */
export function sourceFile(relativePath: string, content: string): SourceFile {
  return new SourceFile({
    path: relativePath,
    absolutePath: path.join('/virtual', relativePath),
    content,
    size: Buffer.byteLength(content),
    classification: classifyFile({ path: relativePath, content }),
  });
}

/** Build a project index for a temporary directory. */
export async function indexDirectory(root: string) {
  const built = await buildIndex({ root, config: DEFAULT_CONFIG });
  return built.index;
}

/** Rule ids present in a scan result. */
export function firedRules(result: ScanResult): Set<string> {
  return new Set(result.findings.map((f) => f.ruleId));
}
