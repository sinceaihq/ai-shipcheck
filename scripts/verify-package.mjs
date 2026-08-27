#!/usr/bin/env node
/**
 * Clean-room package verification.
 *
 * Builds the tarball an npm user would actually receive, installs it into a
 * throwaway project, and exercises the CLI the way a user would. This is the
 * only check that covers what happens *after* publishing: the `files` list,
 * the bin mapping, the shebang, the executable bit, ESM resolution from a
 * published layout, and the exit codes.
 *
 * The registry is deliberately unreachable for the CLI invocations. Without
 * that, every one of these assertions would silently pass by downloading a
 * published copy of the package instead of testing the one just built - which
 * is exactly the failure this script exists to prevent.
 *
 * Usage: npm run verify:package
 */
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Run a command, capturing output, with the repository as the cwd by default. */
function sh(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

/** Run an npm command (not a script) the same way. */
function npmCommand(args, options = {}) {
  const execpath = process.env.npm_execpath;
  if (execpath !== undefined && execpath.endsWith('.js')) {
    return sh(process.execPath, [execpath, ...args], options);
  }
  return sh(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, options);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

let failures = 0;
let checks = 0;

function check(label, condition, detail = '') {
  checks++;
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
  }
}

/** Files that must never reach a published package. */
const FORBIDDEN = [
  { pattern: /^corpus\//, why: 'third-party validation data' },
  { pattern: /^coverage\//, why: 'coverage output' },
  { pattern: /^tests?\//, why: 'test sources' },
  { pattern: /^\.github\//, why: 'CI configuration' },
  { pattern: /^action\//, why: 'GitHub Action bundle' },
  { pattern: /(^|\/)\.env($|\.)/, why: 'environment file' },
  { pattern: /\.tsbuildinfo$/, why: 'build cache' },
  { pattern: /(^|\/)node_modules\//, why: 'dependencies' },
  { pattern: /\.tgz$/, why: 'nested tarball' },
  { pattern: /^scripts\//, why: 'build scripts' },
  { pattern: /\.map$/, why: 'source map' },
];

console.log('\nPackage metadata\n');
check('name is ai-shipcheck', pkg.name === 'ai-shipcheck', pkg.name);
check('version is set', typeof pkg.version === 'string' && pkg.version.length > 0);
check('license is MIT', pkg.license === 'MIT', pkg.license);
check('bin maps ai-shipcheck', pkg.bin?.['ai-shipcheck'] === 'dist/cli/index.js');
check('types are declared', typeof pkg.types === 'string');
check('exports are declared', pkg.exports?.['.'] !== undefined);
check('engines require Node >=22', /(^|\D)22/.test(pkg.engines?.node ?? ''), pkg.engines?.node);
check('repository metadata present', typeof pkg.repository?.url === 'string');
check('is an ES module package', pkg.type === 'module');
check('has no dependency on itself', pkg.dependencies?.['ai-shipcheck'] === undefined);

console.log('\nTarball contents\n');
// `--ignore-scripts` because dist/ was just built and the prepack hook writes
// its own output to stdout, which would otherwise be mixed into the JSON.
const packOutput = npmCommand(['pack', '--dry-run', '--json', '--ignore-scripts']);
const [packed] = JSON.parse(packOutput.slice(packOutput.indexOf('[')));
const entries = packed.files.map((f) => f.path);

for (const { pattern, why } of FORBIDDEN) {
  const offenders = entries.filter((e) => pattern.test(e));
  check(`excludes ${why}`, offenders.length === 0, offenders.slice(0, 3).join(', '));
}
check('includes the CLI entry point', entries.includes('dist/cli/index.js'));
check(
  'includes type declarations',
  entries.some((e) => e.endsWith('.d.ts')),
);
check('includes the licence', entries.includes('LICENSE'));
check('includes the readme', entries.includes('README.md'));
check(
  'includes rule documentation',
  entries.some((e) => e.startsWith('docs/rules/')),
);
check(
  'unpacked size is under 5 MB',
  packed.unpackedSize < 5 * 1024 * 1024,
  `${(packed.unpackedSize / 1024 / 1024).toFixed(1)} MB`,
);

console.log(
  `\n  ${entries.length} files, ${(packed.size / 1024).toFixed(0)} KB packed, ` +
    `${(packed.unpackedSize / 1024).toFixed(0)} KB unpacked\n`,
);

console.log('Clean-room install\n');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'shipcheck-verify-'));
const consumer = path.join(work, 'consumer');
fs.mkdirSync(consumer, { recursive: true });

npmCommand(['pack', '--pack-destination', work, '--ignore-scripts'], { stdio: 'pipe' });
const tarball = fs.readdirSync(work).find((f) => f.endsWith('.tgz'));
if (tarball === undefined) {
  console.error('npm pack produced no tarball.');
  process.exit(1);
}

npmCommand(['init', '-y'], { cwd: consumer, stdio: 'pipe' });
npmCommand(['install', path.join(work, tarball), '--no-audit', '--no-fund'], {
  cwd: consumer,
  stdio: 'pipe',
});

const binary = path.join(consumer, 'node_modules', '.bin', 'ai-shipcheck');
check('installs a binary at node_modules/.bin', fs.existsSync(binary));

/**
 * Invoke the installed CLI.
 *
 * `npm_config_registry` is pointed at an address that cannot answer, so any
 * attempt to reach the registry fails loudly instead of silently substituting
 * a published package for the one under test.
 */
async function cli(args, options = {}) {
  const env = {
    ...process.env,
    NO_COLOR: '1',
    npm_config_registry: 'http://127.0.0.1:1/',
    npm_config_offline: 'true',
  };
  try {
    const { stdout, stderr } = await run(binary, args, {
      cwd: options.cwd ?? consumer,
      env,
      maxBuffer: 64 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

const secure = path.join(root, 'fixtures', 'secure-nextjs');
const vulnerable = path.join(root, 'fixtures', 'vulnerable-nextjs');

console.log('\nCLI behaviour\n');

const version = await cli(['--version']);
check(
  '--version prints the package version',
  version.stdout.trim() === pkg.version,
  version.stdout.trim(),
);

const help = await cli(['--help']);
check(
  '--help documents usage and exit codes',
  help.stdout.includes('USAGE') && help.stdout.includes('EXIT CODES'),
);

const rules = await cli(['rules', '--json']);
check('rules --json emits a rule array', JSON.parse(rules.stdout).length > 40);

const explain = await cli(['explain', 'database/supabase-missing-rls']);
check('explain documents a rule', explain.stdout.includes('How to fix it'));

const explainUnknown = await cli(['explain', 'security/eval-usag']);
check(
  'explain suggests a near miss',
  explainUnknown.code === 2 && explainUnknown.stderr.includes('security/eval-usage'),
);

const clean = await cli([secure, '--fail-on', 'low']);
check('clean repository exits 0', clean.code === 0, `exit ${clean.code}`);
check('clean repository reports READY', clean.stdout.includes('READY'));

const broken = await cli([vulnerable]);
check('vulnerable repository reports NOT READY', broken.stdout.includes('NOT READY'));
check('vulnerable repository exits 0 without thresholds', broken.code === 0);

const failOn = await cli([vulnerable, '--fail-on', 'critical']);
check('--fail-on exits 1 when unmet', failOn.code === 1);

const minScore = await cli([vulnerable, '--min-score', '95']);
check('--min-score exits 1 when unmet', minScore.code === 1);

const json = await cli([vulnerable, '--format', 'json']);
const jsonReport = JSON.parse(json.stdout);
check('--format json is pure, parseable JSON', jsonReport.schemaVersion === '1.0');
check('json carries coverage', typeof jsonReport.coverage?.checksRun === 'number');

const markdown = await cli([vulnerable, '--format', 'markdown']);
check('--format markdown renders a report', markdown.stdout.includes('# AI Shipcheck report'));

const sarif = await cli([vulnerable, '--format', 'sarif']);
const sarifLog = JSON.parse(sarif.stdout);
check('--format sarif emits SARIF 2.1.0', sarifLog.version === '2.1.0');
check(
  'sarif rule indices resolve',
  sarifLog.runs[0].results.every(
    (r) => sarifLog.runs[0].tool.driver.rules[r.ruleIndex]?.id === r.ruleId,
  ),
);

// A target path containing spaces, scanned from a different directory.
const spaced = path.join(work, 'a project with spaces');
fs.mkdirSync(spaced, { recursive: true });
fs.cpSync(vulnerable, spaced, { recursive: true });
const spacedRun = await cli([spaced, '--format', 'json'], { cwd: os.tmpdir() });
check('scans a path containing spaces', JSON.parse(spacedRun.stdout).findings.length > 0);
check('scans a target outside the working directory', spacedRun.code === 0);

const outputFile = path.join(work, 'report.sarif');
const written = await cli([vulnerable, '--format', 'sarif', '--output', outputFile]);
check(
  '--output writes a file and prints nothing',
  written.stdout === '' && fs.existsSync(outputFile),
);

const badFlag = await cli(['--format', 'toml']);
check(
  'an unknown format exits 2 with a readable message',
  badFlag.code === 2 && badFlag.stderr.includes('Unknown output format'),
);

const missingTarget = await cli(['./definitely-not-here']);
check(
  'a missing target exits 2 with a readable message',
  missingTarget.code === 2 && missingTarget.stderr.includes('No such directory'),
);

check('no CLI invocation contaminated stdout with logs', !json.stdout.startsWith('npm'));

fs.rmSync(work, { recursive: true, force: true });

console.log(`\n${checks - failures}/${checks} checks passed\n`);
if (failures > 0) {
  console.error(`${failures} package verification check(s) failed.`);
  process.exit(1);
}
