#!/usr/bin/env node
/**
 * The release gate.
 *
 * Every check that must pass before AI Shipcheck can be published, run in one
 * command from a clean checkout. It exists so that "is this releasable?" has a
 * single, unambiguous answer rather than a checklist someone works through by
 * hand and occasionally skips a line of.
 *
 * Nothing here is allowed to be weakened to get a green result. A gate that
 * can be talked out of is not a gate.
 *
 * Usage: npm run gate
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const results = [];
let failed = 0;

function gate(name, fn) {
  process.stdout.write(`  ${name} ... `);
  const started = Date.now();
  try {
    const detail = fn() ?? '';
    const ms = Date.now() - started;
    console.log(
      `ok${detail ? ` (${detail})` : ''} ${ms > 1000 ? `[${(ms / 1000).toFixed(1)}s]` : ''}`,
    );
    results.push({ name, ok: true });
  } catch (error) {
    console.log('FAIL');
    const message = (error.stdout || error.stderr || error.message || '').toString();
    console.log(
      message
        .split('\n')
        .filter(Boolean)
        .slice(-12)
        .map((l) => `      ${l}`)
        .join('\n'),
    );
    results.push({ name, ok: false });
    failed++;
  }
}

/** Run a command, throwing with captured output when it fails. */
function sh(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

function npm(script) {
  return sh('npm', ['run', script]);
}

function scan(fixture, extra = []) {
  return sh(process.execPath, [
    path.join(root, 'dist', 'cli', 'index.js'),
    path.join(root, 'fixtures', fixture),
    '--no-color',
    ...extra,
  ]);
}

console.log(`\nAI Shipcheck release gate - v${pkg.version}\n`);

console.log('Repository state');
gate('working tree is clean', () => {
  const status = sh('git', ['status', '--porcelain']).trim();
  if (status.length > 0) {
    throw new Error(`uncommitted changes:\n${status}`);
  }
  return 'no uncommitted changes';
});

gate('no third-party corpus checkouts are tracked', () => {
  const tracked = sh('git', ['ls-files', 'corpus/']).trim().split('\n').filter(Boolean);
  const forbidden = tracked.filter(
    (f) => !/^corpus\/(corpus\.json|README\.md|TRIAGE\.md|results\/)/.test(f),
  );
  if (forbidden.length > 0) throw new Error(`unexpected tracked files: ${forbidden.join(', ')}`);
  return `${tracked.length} tracked files, all expected`;
});

gate('no real credential-shaped strings are committed', () => {
  // Fixtures and tests deliberately contain credential-shaped strings - that
  // is what they are for. Rather than exempting whole directories, every match
  // must be recognisably synthetic. A real key pasted into a test would still
  // be caught.
  const SYNTHETIC = /SHIPCHECKFIX|EXAMPLE|PLACEHOLDER|NOTAREAL|0{4}/i;
  const files = sh('git', ['ls-files']).trim().split('\n').filter(Boolean);
  const patterns = [
    /sk-ant-[A-Za-z0-9_-]{24,}/g,
    /sk-proj-[A-Za-z0-9_-]{24,}/g,
    /gh[pousr]_[A-Za-z0-9]{36}/g,
    /AKIA[0-9A-Z]{16}/g,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    /npm_[A-Za-z0-9]{36}/g,
    /xox[baprs]-[A-Za-z0-9-]{20,}/g,
  ];
  const offenders = [];
  for (const file of files) {
    // These two define the detection patterns themselves.
    if (file === 'src/utils/mask.ts' || file === 'src/rules/security/secret-patterns.ts') continue;
    if (!fs.existsSync(path.join(root, file))) continue;
    let content;
    try {
      content = fs.readFileSync(path.join(root, file), 'utf8');
    } catch {
      continue;
    }
    for (const pattern of patterns) {
      for (const match of content.matchAll(pattern)) {
        if (!SYNTHETIC.test(match[0])) offenders.push(`${file}: ${match[0].slice(0, 16)}…`);
      }
    }
  }
  if (offenders.length > 0) throw new Error(offenders.join('\n'));
  return `${files.length} tracked files scanned`;
});

console.log('\nBuild and static checks');
gate('clean install from the lockfile', () => sh('npm', ['ci']) && 'npm ci');
gate('format', () => npm('format:check'));
gate('lint', () => npm('lint'));
gate('typecheck', () => npm('typecheck'));
gate('rule documentation in sync', () => npm('docs:check'));
gate('build', () => npm('build'));
gate('action bundle builds', () => npm('build:action'));
gate('action bundle is committed and current', () => {
  const diff = sh('git', ['status', '--porcelain', '--', 'action/dist']).trim();
  if (diff.length > 0) throw new Error('action/dist differs from a fresh build; commit it');
  return 'matches a fresh build';
});

console.log('\nTests');
gate('unit, integration, CLI and action tests', () => {
  const out = npm('test');
  const match = /Tests\s+(\d+) passed \((\d+)\)/.exec(out);
  return match ? `${match[1]} passed` : 'passed';
});
gate('coverage thresholds', () => {
  const out = npm('test:coverage');
  const match = /Statements\s+:\s+([\d.]+)%/.exec(out);
  return match ? `${match[1]}% statements` : 'thresholds met';
});

console.log('\nBehaviour');
gate('secure fixtures report no findings', () => {
  for (const fixture of ['secure-nextjs', 'secure-api']) {
    const out = scan(fixture, ['--format', 'json']);
    const report = JSON.parse(out);
    if (report.findings.length > 0) {
      throw new Error(`${fixture} reported ${report.findings.length} findings`);
    }
    if (report.verdict !== 'READY') throw new Error(`${fixture} verdict is ${report.verdict}`);
  }
  return 'both READY with 0 findings';
});

gate('vulnerable fixtures report blockers', () => {
  for (const fixture of ['vulnerable-nextjs', 'vulnerable-supabase', 'vulnerable-ai-api']) {
    const report = JSON.parse(scan(fixture, ['--format', 'json']));
    if (report.verdict !== 'NOT READY') throw new Error(`${fixture} verdict is ${report.verdict}`);
    if (!report.findings.some((f) => f.blocker)) throw new Error(`${fixture} has no blocker`);
  }
  return 'all three NOT READY with blockers';
});

gate('dogfood scan of this repository', () => {
  const out = sh(process.execPath, [
    path.join(root, 'dist', 'cli', 'index.js'),
    root,
    '--format',
    'json',
  ]);
  const report = JSON.parse(out);
  const blocking = report.findings.filter(
    (f) => f.severity === 'critical' || f.severity === 'high',
  );
  if (blocking.length > 0) {
    throw new Error(
      `${blocking.length} high or critical findings: ${blocking.map((f) => f.ruleId).join(', ')}`,
    );
  }
  return `${report.verdict} ${report.score}/100, ${report.findings.length} findings`;
});

gate('no fixture credential appears in any output', () => {
  const secrets = [
    'SHIPCHECKFIXTUREKEY000000000000',
    'Hx9Kd2NbTgH5sYcJf8Ae',
    'Qm4pLv9WxKd2NbTgH5sYcJf8AeUiO3Rz',
  ];
  for (const format of ['json', 'markdown', 'sarif', 'pretty']) {
    const out = scan('vulnerable-nextjs', ['--format', format]);
    for (const secret of secrets) {
      if (out.includes(secret)) throw new Error(`${format} output leaked ${secret.slice(0, 12)}…`);
    }
  }
  return '4 formats checked';
});

console.log('\nOutput formats');
gate('JSON is valid and versioned', () => {
  const report = JSON.parse(scan('vulnerable-supabase', ['--format', 'json']));
  if (report.schemaVersion !== '1.0') throw new Error(`schemaVersion is ${report.schemaVersion}`);
  if (typeof report.coverage?.checksRun !== 'number') throw new Error('coverage missing');
  return `schema ${report.schemaVersion}`;
});

gate('Markdown escapes table cells', () => {
  const out = scan('vulnerable-nextjs', ['--format', 'markdown']);
  for (const line of out.split('\n')) {
    if (!line.startsWith('| ')) continue;
    for (const cell of line.slice(2, -2).split(' | ')) {
      if (cell.includes('|')) throw new Error(`unescaped pipe: ${line.slice(0, 60)}`);
    }
  }
  return 'no unescaped pipes';
});

gate('SARIF is well formed', () => {
  const log = JSON.parse(scan('vulnerable-supabase', ['--format', 'sarif']));
  if (log.version !== '2.1.0') throw new Error(`version is ${log.version}`);
  const run = log.runs[0];
  const ids = run.tool.driver.rules.map((r) => r.id);
  for (const result of run.results) {
    if (ids[result.ruleIndex] !== result.ruleId)
      throw new Error(`ruleIndex mismatch for ${result.ruleId}`);
    if (!['error', 'warning', 'note', 'none'].includes(result.level)) {
      throw new Error(`bad level ${result.level}`);
    }
    for (const location of result.locations ?? []) {
      const uri = location.physicalLocation.artifactLocation.uri;
      if (uri.startsWith('/') || uri.includes('\\')) throw new Error(`bad uri ${uri}`);
    }
  }
  return `${run.results.length} results, ${ids.length} rules`;
});

gate('exit codes behave as documented', () => {
  const cases = [
    { args: ['fixtures/secure-nextjs', '--fail-on', 'low'], expected: 0 },
    { args: ['fixtures/vulnerable-nextjs', '--fail-on', 'critical'], expected: 1 },
    { args: ['fixtures/vulnerable-nextjs', '--min-score', '95'], expected: 1 },
    { args: ['--format', 'toml'], expected: 2 },
    { args: ['./definitely-not-here'], expected: 2 },
  ];
  for (const { args, expected } of cases) {
    let code = 0;
    try {
      sh(process.execPath, [path.join(root, 'dist', 'cli', 'index.js'), ...args, '--no-color'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      code = error.status ?? 1;
    }
    if (code !== expected)
      throw new Error(`${args.join(' ')} exited ${code}, expected ${expected}`);
  }
  return `${cases.length} cases`;
});

console.log('\nPackage');
gate('clean-room package verification', () => {
  const out = npm('verify:package');
  const match = /(\d+)\/(\d+) checks passed/.exec(out);
  if (match && match[1] !== match[2]) throw new Error(out);
  return match ? `${match[1]}/${match[2]} checks` : 'passed';
});

gate('package version and version constant agree', () => {
  const built = fs.readFileSync(path.join(root, 'dist', 'version.js'), 'utf8');
  if (!built.includes(`'${pkg.version}'`)) {
    throw new Error(`src/version.ts does not declare ${pkg.version}`);
  }
  return pkg.version;
});

gate('changelog documents this version', () => {
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  if (!changelog.includes(`## [${pkg.version}]`)) {
    throw new Error(`CHANGELOG.md has no '## [${pkg.version}]' section`);
  }
  return `entry for ${pkg.version}`;
});

gate('licence is present and matches the manifest', () => {
  const licence = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8');
  if (!licence.includes('MIT License')) throw new Error('LICENSE is not MIT');
  if (pkg.license !== 'MIT') throw new Error(`package.json says ${pkg.license}`);
  return 'MIT';
});

console.log('\nDocumentation');
/**
 * Blank out fenced code blocks and inline code spans.
 *
 * A documentation example can legitimately contain something shaped like a
 * Markdown link - the GitHub Action recipes build one inside a JavaScript
 * template string - and that is sample code, not a link this repository has
 * to resolve.
 */
function stripCode(markdown) {
  return markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

gate('every documentation link resolves', () => {
  const docs = sh('git', ['ls-files', '*.md'])
    .trim()
    .split('\n')
    .filter(Boolean)
    // A tracked file that no longer exists is a staged deletion, which the
    // working-tree gate already reports. Skipping it here keeps this check
    // about links rather than about git state.
    .filter((doc) => fs.existsSync(path.join(root, doc)));
  const broken = [];
  for (const doc of docs) {
    const content = stripCode(fs.readFileSync(path.join(root, doc), 'utf8'));
    for (const match of content.matchAll(
      /\[[^\]]*\]\((?!https?:|mailto:|#)([^)#]+)(?:#[^)]*)?\)/g,
    )) {
      const target = path.resolve(path.dirname(path.join(root, doc)), match[1]);
      if (!fs.existsSync(target)) broken.push(`${doc} -> ${match[1]}`);
    }
  }
  if (broken.length > 0) throw new Error(broken.join('\n'));
  return `${docs.length} documents checked`;
});

gate('every rule has a documentation page', () => {
  const pages = fs.readdirSync(path.join(root, 'docs', 'rules'));
  const listed = JSON.parse(
    sh(process.execPath, [path.join(root, 'dist', 'cli', 'index.js'), 'rules', '--json']),
  );
  const missing = listed
    .map((r) => `${r.id.replace('/', '__')}.md`)
    .filter((page) => !pages.includes(page));
  if (missing.length > 0) throw new Error(`missing: ${missing.join(', ')}`);
  return `${listed.length} rules documented`;
});

gate('README commands exist', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const scripts = Object.keys(pkg.scripts);
  const missing = [];
  for (const match of readme.matchAll(/npm run ([\w:]+)/g)) {
    if (!scripts.includes(match[1])) missing.push(match[1]);
  }
  if (missing.length > 0)
    throw new Error(`README references unknown scripts: ${[...new Set(missing)].join(', ')}`);
  return 'all referenced scripts exist';
});

console.log('\nRelease configuration');
gate('release workflow is present and uses trusted publishing', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
  if (!workflow.includes('id-token: write')) throw new Error('no OIDC permission');
  if (!workflow.includes('--provenance')) throw new Error('provenance not requested');
  if (/NODE_AUTH_TOKEN|NPM_TOKEN/.test(workflow))
    throw new Error('references a long-lived npm token');
  return 'OIDC + provenance, no stored token';
});

gate('no npm token anywhere in the repository', () => {
  const files = sh('git', ['ls-files']).trim().split('\n').filter(Boolean);
  const offenders = files.filter((file) => {
    if (file === 'scripts/release-gate.mjs' || file === 'docs/RELEASING.md') return false;
    try {
      return /NPM_TOKEN\s*[:=]\s*["']?[a-zA-Z0-9_-]{20,}/.test(
        fs.readFileSync(path.join(root, file), 'utf8'),
      );
    } catch {
      return false;
    }
  });
  if (offenders.length > 0) throw new Error(offenders.join(', '));
  return 'none';
});

const passed = results.length - failed;
console.log(`\n${passed}/${results.length} gates passed\n`);

if (failed > 0) {
  console.error(`${failed} gate(s) failed. This build is not releasable.`);
  process.exit(1);
}
console.log('This build is releasable.\n');
