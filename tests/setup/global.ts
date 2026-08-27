import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Ensure `dist/` exists before the suite runs.
 *
 * The CLI tests spawn the real binary rather than importing it, because the
 * things most likely to break - the shebang, the executable bit, ESM
 * resolution from a published layout, process exit codes - only exist in the
 * built artefact. Building here keeps `npm test` self-sufficient.
 */
export function setup(): void {
  const cli = path.join(root, 'dist', 'cli', 'index.js');
  if (fs.existsSync(cli)) return;
  execFileSync(process.execPath, [path.join(root, 'scripts', 'build.mjs')], {
    cwd: root,
    stdio: 'inherit',
  });
}
