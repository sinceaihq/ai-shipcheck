#!/usr/bin/env node
/**
 * Build the distributable.
 *
 * `tsc` produces the ESM output and declarations; the CLI entry then gets a
 * shebang and the executable bit so `npx ai-shipcheck` works from a fresh
 * install with no postinstall step.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });

execFileSync(
  process.execPath,
  [
    path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
    '-p',
    path.join(root, 'tsconfig.build.json'),
  ],
  { stdio: 'inherit', cwd: root },
);

const cli = path.join(root, 'dist', 'cli', 'index.js');
const contents = fs.readFileSync(cli, 'utf8');
if (!contents.startsWith('#!')) {
  fs.writeFileSync(cli, `#!/usr/bin/env node\n${contents}`);
}
fs.chmodSync(cli, 0o755);

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const versionModule = fs.readFileSync(path.join(root, 'dist', 'version.js'), 'utf8');
if (!versionModule.includes(`'${pkg.version}'`)) {
  throw new Error(
    `src/version.ts (${versionModule.trim()}) does not match package.json version ${pkg.version}. ` +
      'Update src/version.ts when bumping the package version.',
  );
}

console.log(`Built ai-shipcheck v${pkg.version} -> dist/`);
