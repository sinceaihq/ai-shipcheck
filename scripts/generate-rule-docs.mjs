#!/usr/bin/env node
/**
 * Generate one Markdown page per rule from its metadata, plus an index.
 *
 * Documentation is derived from the single source of truth - the rule's own
 * `meta` block - so it cannot drift. `--check` fails when the committed docs
 * differ from what the rules currently declare, which is wired into
 * `npm run check`.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs', 'rules');
const check = process.argv.includes('--check');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shipcheck-docs-'));
const bundlePath = path.join(tmp, 'rules.mjs');

await build({
  entryPoints: [path.join(root, 'src', 'rules', 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: bundlePath,
  external: ['ignore'],
  logLevel: 'error',
});

const { BUILTIN_RULES } = await import(pathToFileURL(bundlePath).href);

const CATEGORY_ORDER = [
  'security',
  'auth',
  'database',
  'reliability',
  'testing',
  'observability',
  'performance',
  'accessibility',
  'ai-cost',
];

const CATEGORY_LABELS = {
  security: 'Security',
  auth: 'Authentication & Authorization',
  database: 'Database & Data Safety',
  reliability: 'Reliability',
  testing: 'Testing',
  observability: 'Observability',
  performance: 'Performance',
  accessibility: 'Accessibility',
  'ai-cost': 'AI Cost & Abuse Controls',
};

function rulePage(meta) {
  const lines = [];
  lines.push(`# \`${meta.id}\``);
  lines.push('');
  lines.push(`> ${meta.title}`);
  lines.push('');
  lines.push('| | |');
  lines.push('| --- | --- |');
  lines.push(`| **Category** | ${CATEGORY_LABELS[meta.category]} |`);
  lines.push(`| **Severity** | \`${meta.severity}\` |`);
  lines.push(`| **Confidence** | \`${meta.confidence}\` |`);
  lines.push(`| **Blocker** | ${meta.blocker === true ? 'Yes — forces `NOT READY`' : 'No'} |`);
  if (meta.requiresFrameworks?.length) {
    lines.push(`| **Requires** | ${meta.requiresFrameworks.map((f) => `\`${f}\``).join(', ')} |`);
  }
  if (meta.tags?.length) {
    lines.push(`| **Tags** | ${meta.tags.map((t) => `\`${t}\``).join(', ')} |`);
  }
  lines.push('');
  lines.push('## What this means');
  lines.push('');
  lines.push(meta.description);
  lines.push('');
  lines.push('## How to fix it');
  lines.push('');
  lines.push(meta.remediation);
  lines.push('');
  if (meta.references?.length) {
    lines.push('## References');
    lines.push('');
    for (const ref of meta.references) lines.push(`- ${ref}`);
    lines.push('');
  }
  lines.push('## Disabling this rule');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({ rules: { [meta.id]: 'off' } }, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('[← All rules](./README.md)');
  lines.push('');
  return lines.join('\n');
}

function indexPage(rules) {
  const lines = [];
  lines.push('# Rule reference');
  lines.push('');
  lines.push(
    `AI Shipcheck ships ${rules.length} rules across ${CATEGORY_ORDER.length} production-readiness categories.`,
  );
  lines.push('');
  lines.push(
    'This page is generated from rule metadata by `npm run docs:rules`. Do not edit it by hand.',
  );
  lines.push('');
  lines.push(
    '⛔ marks a **blocker**: a single finding forces a `NOT READY` verdict regardless of score.',
  );
  lines.push('');
  for (const category of CATEGORY_ORDER) {
    const group = rules.filter((r) => r.meta.category === category);
    if (group.length === 0) continue;
    lines.push(`## ${CATEGORY_LABELS[category]}`);
    lines.push('');
    lines.push('| Rule | Severity | Confidence | Description |');
    lines.push('| --- | --- | --- | --- |');
    for (const rule of group) {
      const { meta } = rule;
      const blocker = meta.blocker === true ? ' ⛔' : '';
      lines.push(
        `| [\`${meta.id}\`](./${meta.id.replace('/', '__')}.md)${blocker} | \`${meta.severity}\` | \`${meta.confidence}\` | ${meta.title} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

const rules = [...BUILTIN_RULES].sort((a, b) => a.meta.id.localeCompare(b.meta.id));
const expected = new Map();
expected.set('README.md', indexPage(rules));
for (const rule of rules) {
  expected.set(`${rule.meta.id.replace('/', '__')}.md`, rulePage(rule.meta));
}

if (check) {
  const problems = [];
  const actual = fs.existsSync(outDir) ? new Set(fs.readdirSync(outDir)) : new Set();
  for (const [name, content] of expected) {
    const file = path.join(outDir, name);
    if (!fs.existsSync(file)) {
      problems.push(`missing: docs/rules/${name}`);
      continue;
    }
    if (fs.readFileSync(file, 'utf8') !== content) problems.push(`out of date: docs/rules/${name}`);
    actual.delete(name);
  }
  for (const stale of actual) problems.push(`stale: docs/rules/${stale}`);
  if (problems.length > 0) {
    console.error('Rule documentation is out of sync with rule metadata:');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('\nRun "npm run docs:rules" and commit the result.');
    process.exitCode = 1;
  } else {
    console.log(`Rule documentation is up to date (${rules.length} rules).`);
  }
} else {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, content] of expected) {
    fs.writeFileSync(path.join(outDir, name), content);
  }
  console.log(`Wrote ${expected.size} files to docs/rules/`);
}

fs.rmSync(tmp, { recursive: true, force: true });
