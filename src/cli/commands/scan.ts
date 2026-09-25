import fs from 'node:fs/promises';
import path from 'node:path';
import { createBaseline } from '../../baseline/baseline.js';
import { loadBaseline, writeBaseline } from '../../baseline/file.js';
import { applyOverrides, loadConfig } from '../../config/load.js';
import { runScan } from '../../core/engine.js';
import { createDefaultRegistry } from '../../rules/index.js';
import { getReporter } from '../../reporters/index.js';
import { countAtLeast } from '../../scoring/score.js';
import type { Severity } from '../../types/core.js';
import { stripAnsi } from '../../utils/color.js';
import { TargetError, ShipcheckError, UsageError } from '../../utils/errors.js';
import { EXIT, type ExitCode } from '../exit-codes.js';
import type { ParsedArgs } from '../args.js';
import type { ScanResult } from '../../types/core.js';

export interface ScanCommandResult {
  readonly output: string;
  readonly exitCode: ExitCode;
  readonly result: ScanResult;
  /** Message explaining a non-zero exit, written to stderr. */
  readonly failureReason: string | undefined;
}

/** `ai-shipcheck [path]` - the main command. */
export async function runScanCommand(args: ParsedArgs, color: boolean): Promise<ScanCommandResult> {
  const target = args.positionals[0] ?? '.';
  const root = await resolveTarget(target);
  if (args.baseline !== undefined && args.output !== undefined) {
    await assertDistinctBaselineOutput(args.baseline, args.output);
  }
  const baseline =
    args.baseline !== undefined && !args.writeBaseline
      ? await loadBaseline(args.baseline)
      : undefined;

  const loaded = await loadConfig({ root, explicitPath: args.config });
  const config = applyOverrides(loaded, {
    minScore: args.minScore,
    failOn: args.failOn,
  });

  const registry = createDefaultRegistry();
  const result = await runScan({
    root,
    config,
    registry,
    ...(baseline === undefined ? {} : { baseline }),
  });
  if (args.writeBaseline && args.baseline !== undefined) {
    await writeBaseline(args.baseline, createBaseline(result.findings));
  }

  const reporter = getReporter(args.format);
  const wantsColor = color && args.output === undefined && args.format === 'pretty';
  let output = reporter(result, { color: wantsColor, quiet: args.quiet, root });

  if (args.output !== undefined) {
    // A newly written baseline may now resolve through an alias that did not
    // exist at the initial check (including case aliases and dangling symlinks).
    if (args.baseline !== undefined) {
      await assertDistinctBaselineOutput(args.baseline, args.output);
    }
    output = args.format === 'pretty' ? stripAnsi(output) : output;
    await writeOutput(args.output, output);
  }

  const { exitCode, failureReason } = evaluateThresholds(result, config.failOn, config.minScore);

  return {
    output: args.output === undefined ? output : '',
    exitCode,
    result,
    failureReason,
  };
}

/** Decide the exit code from `--fail-on` and `--min-score`. */
export function evaluateThresholds(
  result: ScanResult,
  failOn: Severity | 'none' | null,
  minScore: number | null,
): { exitCode: ExitCode; failureReason: string | undefined } {
  const reasons: string[] = [];

  if (failOn !== null && failOn !== 'none') {
    const count = countAtLeast(result.findings, failOn);
    if (count > 0) {
      reasons.push(
        `${count} finding${count === 1 ? '' : 's'} at severity "${failOn}" or worse (--fail-on ${failOn}).`,
      );
    }
  }

  if (minScore !== null && result.score < minScore) {
    reasons.push(
      `Score ${result.score} is below the required minimum of ${minScore} (--min-score).`,
    );
  }

  return reasons.length === 0
    ? { exitCode: EXIT.OK, failureReason: undefined }
    : { exitCode: EXIT.THRESHOLD_NOT_MET, failureReason: reasons.join(' ') };
}

/** Resolve and validate the scan target. */
async function resolveTarget(target: string): Promise<string> {
  const resolved = path.resolve(process.cwd(), target);
  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw new TargetError(
      code === 'ENOENT'
        ? `No such directory: ${target}`
        : `Could not read ${target} (${code ?? 'unknown error'}).`,
      'Pass a path to the project you want to scan, or run "ai-shipcheck ." from inside it.',
    );
  }
  if (!stat.isDirectory()) {
    throw new TargetError(
      `${target} is a file, not a directory.`,
      'Shipcheck scans a whole project. Point it at the directory that contains package.json.',
    );
  }
  return resolved;
}

/** stat follows symlinks and identifies case aliases and hard links on every platform. */
async function assertDistinctBaselineOutput(baseline: string, output: string): Promise<void> {
  const collision = (): UsageError =>
    new UsageError('--baseline and --output must name different files.');
  if (path.resolve(baseline) === path.resolve(output)) throw collision();

  const inspect = async (target: string) => {
    try {
      return await fs.stat(target, { bigint: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return undefined;
      throw new UsageError(
        `Could not check baseline/output file ${target} (${code ?? 'unknown error'}).`,
      );
    }
  };
  const [baselineStat, outputStat] = await Promise.all([inspect(baseline), inspect(output)]);
  if (
    baselineStat !== undefined &&
    outputStat !== undefined &&
    baselineStat.dev === outputStat.dev &&
    baselineStat.ino === outputStat.ino
  ) {
    throw collision();
  }
}

async function writeOutput(target: string, content: string): Promise<void> {
  const resolved = path.resolve(process.cwd(), target);
  try {
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw new ShipcheckError(`Could not write report to ${target} (${code ?? 'unknown error'}).`, {
      exitCode: EXIT.USAGE,
      hint: 'Check that the directory exists and is writable.',
    });
  }
}
