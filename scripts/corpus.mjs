#!/usr/bin/env node
/**
 * Real-world validation harness.
 *
 * Runs AI Shipcheck against a fixed set of public repositories and records
 * what it reported. This is how false positives are found: fixtures written
 * alongside a rule agree with that rule by construction, and only real code
 * written by people who have never heard of this tool tells you whether a rule
 * is actually precise.
 *
 * The repositories are never vendored. They are cloned into a cache directory
 * outside this repository and checked out at the exact commit recorded in
 * corpus/corpus.json, so a run is reproducible and the results in
 * corpus/results/ can be compared across changes.
 *
 * Nothing in a cloned repository is installed, executed or imported. `git` is
 * invoked with an explicit argument array and no shell.
 *
 * Usage:
 *   npm run corpus:sync            clone/checkout every pinned repository
 *   npm run corpus:sync -- --pin   resolve current HEADs and write them back
 *   npm run corpus:scan            scan the corpus and write a report
 *   npm run corpus:report          print the last report
 *   npm run corpus:scan -- --only vercel/ai-chatbot
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const corpusFile = path.join(root, 'corpus', 'corpus.json');
const resultsDir = path.join(root, 'corpus', 'results');

/**
 * Where clones live. Outside the repository by construction, so a third-party
 * checkout can never be staged, packed or published by accident.
 */
const cacheDir =
  process.env.SHIPCHECK_CORPUS_DIR ?? path.join(os.homedir(), '.cache', 'ai-shipcheck-corpus');

const args = process.argv.slice(2);
const command = args[0] ?? 'scan';
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

function readCorpus() {
  return JSON.parse(fs.readFileSync(corpusFile, 'utf8'));
}

function slug(name) {
  return name.replace('/', '__');
}

async function git(cwd, ...gitArgs) {
  return run('git', gitArgs, { cwd, maxBuffer: 64 * 1024 * 1024 });
}

/**
 * Clone (or update) one repository and check out its pinned commit.
 *
 * Uses a blobless partial clone so large histories stay cheap: only the trees
 * and the blobs of the checked-out commit are fetched.
 */
async function syncRepository(repo, { pin }) {
  const dir = path.join(cacheDir, slug(repo.name));
  const exists = fs.existsSync(path.join(dir, '.git'));

  if (!exists) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    process.stdout.write(`  cloning ${repo.name} ... `);
    await run('git', ['clone', '--filter=blob:none', '--no-checkout', '--quiet', repo.url, dir], {
      maxBuffer: 64 * 1024 * 1024,
    });
    process.stdout.write('done\n');
  }

  let commit = repo.commit;
  if (commit === null || pin) {
    await git(dir, 'fetch', '--quiet', 'origin', repo.ref);
    const { stdout } = await git(dir, 'rev-parse', 'FETCH_HEAD');
    commit = stdout.trim();
  }

  await git(dir, 'fetch', '--quiet', 'origin', commit).catch(() => undefined);
  await git(dir, 'checkout', '--quiet', '--force', commit);
  return { dir, commit };
}

async function commandSync() {
  const corpus = readCorpus();
  const pin = flag('pin');
  fs.mkdirSync(cacheDir, { recursive: true });
  console.log(`Corpus cache: ${cacheDir}\n`);

  const failures = [];
  for (const repo of corpus.repositories) {
    try {
      const { commit } = await syncRepository(repo, { pin });
      if (repo.commit !== commit) {
        repo.commit = commit;
        console.log(`  pinned ${repo.name} @ ${commit.slice(0, 12)}`);
      } else {
        console.log(`  ok     ${repo.name} @ ${commit.slice(0, 12)}`);
      }
    } catch (error) {
      failures.push({ name: repo.name, message: error.message.split('\n')[0] });
      console.log(`  FAILED ${repo.name}: ${error.message.split('\n')[0]}`);
    }
  }

  if (pin) {
    fs.writeFileSync(corpusFile, `${JSON.stringify(corpus, null, 2)}\n`);
    console.log('\nWrote pinned commits to corpus/corpus.json');
  }
  if (failures.length > 0) {
    console.log(`\n${failures.length} repository/repositories could not be synced.`);
  }
}

async function commandScan() {
  const distEntry = path.join(root, 'dist', 'index.js');
  if (!fs.existsSync(distEntry)) {
    console.error('dist/ not found. Run `npm run build` first.');
    process.exit(1);
  }
  const { runScan, createDefaultRegistry, DEFAULT_CONFIG } = await import(
    pathToFileURL(distEntry).href
  );

  const corpus = readCorpus();
  const only = option('only');
  const registry = createDefaultRegistry();
  const selected = corpus.repositories.filter((r) => only === undefined || r.name === only);

  const entries = [];
  for (const repo of selected) {
    const dir = path.join(cacheDir, slug(repo.name));
    if (!fs.existsSync(dir)) {
      console.log(`  skipped ${repo.name} (not synced)`);
      continue;
    }

    const started = performance.now();
    let result;
    try {
      result = await runScan({ root: dir, config: DEFAULT_CONFIG, registry });
    } catch (error) {
      console.log(`  ERROR   ${repo.name}: ${error.message}`);
      entries.push({ name: repo.name, url: repo.url, commit: repo.commit, error: error.message });
      continue;
    }
    const elapsed = performance.now() - started;

    const byRule = {};
    for (const finding of result.findings) {
      (byRule[finding.ruleId] ??= []).push({
        severity: finding.severity,
        confidence: finding.confidence,
        blocker: finding.blocker === true,
        title: finding.title,
        file: finding.evidence[0]?.file ?? null,
        line: finding.evidence[0]?.line ?? null,
        snippet: finding.evidence[0]?.snippet ?? null,
      });
    }

    entries.push({
      name: repo.name,
      url: repo.url,
      commit: repo.commit,
      license: repo.license,
      frameworks: result.profile.frameworks.map((f) => f.id),
      manifestCount: result.profile.manifestCount,
      filesScanned: result.stats.filesScanned,
      filesSkipped: result.stats.filesSkipped,
      bytesScanned: result.stats.bytesScanned,
      truncated: result.stats.truncated,
      durationMs: Math.round(elapsed),
      score: result.score,
      verdict: result.verdict,
      coverage: result.coverage,
      findingCount: result.findings.length,
      findingsByRule: byRule,
    });

    console.log(
      `  ${repo.name.padEnd(42)} ${String(result.score).padStart(3)}/100  ${result.verdict.padEnd(15)} ` +
        `${String(result.findings.length).padStart(4)} findings  ${String(result.stats.filesScanned).padStart(5)} files  ${Math.round(elapsed)}ms`,
    );
  }

  fs.mkdirSync(resultsDir, { recursive: true });
  const report = { generatedAt: new Date().toISOString(), entries };
  fs.writeFileSync(path.join(resultsDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeSummary(report);
  console.log(`\nWrote corpus/results/latest.json and corpus/results/SUMMARY.md`);
}

/** Aggregate the per-rule totals that drive triage. */
function writeSummary(report) {
  const totals = new Map();
  for (const entry of report.entries) {
    for (const [ruleId, findings] of Object.entries(entry.findingsByRule ?? {})) {
      const current = totals.get(ruleId) ?? { count: 0, repos: new Set() };
      current.count += findings.length;
      current.repos.add(entry.name);
      totals.set(ruleId, current);
    }
  }

  const rows = [...totals.entries()]
    .map(([ruleId, v]) => ({ ruleId, count: v.count, repos: v.repos.size }))
    .sort((a, b) => b.count - a.count || a.ruleId.localeCompare(b.ruleId));

  const scanned = report.entries.filter((e) => e.error === undefined);
  const lines = [];
  lines.push('# Corpus validation summary');
  lines.push('');
  lines.push(`Generated ${report.generatedAt}`);
  lines.push('');
  lines.push(
    `${scanned.length} repositories scanned, ` +
      `${scanned.reduce((n, e) => n + e.findingCount, 0)} findings, ` +
      `${scanned.reduce((n, e) => n + e.filesScanned, 0)} files.`,
  );
  lines.push('');
  lines.push('## Per repository');
  lines.push('');
  lines.push('| Repository | Commit | Score | Verdict | Findings | Files | ms |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const e of scanned) {
    lines.push(
      `| [${e.name}](${e.url.replace(/\.git$/, '')}) | \`${(e.commit ?? '').slice(0, 10)}\` | ${e.score} | ${e.verdict} | ${e.findingCount} | ${e.filesScanned} | ${e.durationMs} |`,
    );
  }
  lines.push('');
  lines.push('## Findings by rule');
  lines.push('');
  lines.push('| Rule | Findings | Repositories |');
  lines.push('| --- | --- | --- |');
  for (const row of rows) {
    lines.push(`| \`${row.ruleId}\` | ${row.count} | ${row.repos} |`);
  }
  lines.push('');
  fs.writeFileSync(path.join(resultsDir, 'SUMMARY.md'), `${lines.join('\n')}\n`);
}

function commandReport() {
  const file = path.join(resultsDir, 'latest.json');
  if (!fs.existsSync(file)) {
    console.error('No corpus results yet. Run `npm run corpus:scan` first.');
    process.exit(1);
  }
  process.stdout.write(fs.readFileSync(path.join(resultsDir, 'SUMMARY.md'), 'utf8'));
}

switch (command) {
  case 'sync':
    await commandSync();
    break;
  case 'scan':
    await commandScan();
    break;
  case 'report':
    commandReport();
    break;
  default:
    console.error(`Unknown corpus command "${command}". Use sync, scan or report.`);
    process.exit(2);
}
