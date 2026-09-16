import fs from 'node:fs/promises';
import path from 'node:path';
import { UsageError } from '../utils/errors.js';
import { parseBaseline, type Baseline } from './baseline.js';

/** Baseline paths, like --output paths, are relative to the working directory. */
export async function loadBaseline(target: string): Promise<Baseline> {
  let text: string;
  try {
    text = await fs.readFile(path.resolve(target), 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw new UsageError(
      code === 'ENOENT'
        ? `Baseline file not found: ${target}`
        : `Could not read baseline ${target} (${code ?? 'unknown error'}).`,
      'Record it with --baseline <file> --write-baseline, or pass an existing baseline file.',
    );
  }
  try {
    return parseBaseline(text);
  } catch (error) {
    if (error instanceof UsageError) throw new UsageError(`${target}: ${error.message}`);
    throw error;
  }
}

export async function writeBaseline(target: string, baseline: Baseline): Promise<void> {
  const resolved = path.resolve(target);
  try {
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw new UsageError(
      `Could not write baseline to ${target} (${code ?? 'unknown error'}).`,
      'Check that the destination is writable.',
    );
  }
}
