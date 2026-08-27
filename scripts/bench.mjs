#!/usr/bin/env node
/**
 * Benchmark harness.
 *
 * Scanning should feel like a lint run, not a build. This measures that.
 *
 * Deliberately not wired into CI as a pass/fail gate: throughput on a shared
 * runner varies by more than any threshold worth setting, and a flaky
 * performance check teaches people to ignore failures. Run it locally before
 * and after a change that touches the walker, the lexer or a hot rule.
 *
 * Usage:
 *   npm run bench                 # the fixture corpus
 *   npm run bench -- <path>       # any project
 *   npm run bench -- <path> 20    # with an explicit iteration count
 */
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distEntry = path.join(root, 'dist', 'index.js');

if (!fs.existsSync(distEntry)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

const { runScan, createDefaultRegistry, DEFAULT_CONFIG } = await import(
  pathToFileURL(distEntry).href
);

const args = process.argv.slice(2);
const explicitTarget = args[0];
const iterations = Number(args[1] ?? 10);

const targets = explicitTarget
  ? [path.resolve(explicitTarget)]
  : fs
      .readdirSync(path.join(root, 'fixtures'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, 'fixtures', entry.name))
      .concat([root]);

const registry = createDefaultRegistry();

function formatMs(ms) {
  return ms < 10 ? `${ms.toFixed(2)} ms` : `${ms.toFixed(1)} ms`;
}

const rows = [];

for (const target of targets) {
  // Warm up so the first measurement is not paying for module loading.
  await runScan({ root: target, config: DEFAULT_CONFIG, registry });

  const samples = [];
  let files = 0;
  let bytes = 0;

  for (let i = 0; i < iterations; i++) {
    const started = performance.now();
    const result = await runScan({ root: target, config: DEFAULT_CONFIG, registry });
    samples.push(performance.now() - started);
    files = result.stats.filesScanned;
    bytes = result.stats.bytesScanned;
  }

  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))];

  rows.push({
    name: path.relative(root, target) || path.basename(target),
    files,
    kb: bytes / 1024,
    median,
    p95,
    filesPerSecond: median > 0 ? (files / median) * 1000 : 0,
  });
}

const nameWidth = Math.max(7, ...rows.map((r) => r.name.length));
const header = [
  'project'.padEnd(nameWidth),
  'files'.padStart(6),
  'size'.padStart(10),
  'median'.padStart(10),
  'p95'.padStart(10),
  'files/s'.padStart(10),
].join('  ');

console.log(`\nai-shipcheck benchmark  (${iterations} iterations, Node ${process.version})\n`);
console.log(header);
console.log('-'.repeat(header.length));

for (const row of rows) {
  console.log(
    [
      row.name.padEnd(nameWidth),
      String(row.files).padStart(6),
      `${row.kb.toFixed(0)} KB`.padStart(10),
      formatMs(row.median).padStart(10),
      formatMs(row.p95).padStart(10),
      Math.round(row.filesPerSecond).toLocaleString('en-US').padStart(10),
    ].join('  '),
  );
}

console.log('');
