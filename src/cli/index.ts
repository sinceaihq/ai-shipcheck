#!/usr/bin/env node
/**
 * CLI entry point.
 *
 * Responsibilities are deliberately narrow: parse arguments, pick a command,
 * print what it returns, and map errors onto documented exit codes. All real
 * work lives in the core so it can be used as a library and tested without a
 * process boundary.
 */
import process from 'node:process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCliArgs } from './args.js';
import { helpText } from './help.js';
import { runScanCommand } from './commands/scan.js';
import { runRulesCommand } from './commands/rules.js';
import { runExplainCommand } from './commands/explain.js';
import { EXIT, type ExitCode } from './exit-codes.js';
import { createPalette, shouldUseColor } from '../utils/color.js';
import { ShipcheckError, describeError } from '../utils/errors.js';
import { VERSION } from '../version.js';

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly env: NodeJS.ProcessEnv;
  readonly isTty: boolean;
}

const defaultIo: CliIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  env: process.env,
  isTty: process.stdout.isTTY === true,
};

/**
 * Run the CLI.
 *
 * @param argv - Arguments after the node binary and script path.
 * @param io - Injectable IO, so tests can capture output without spawning.
 * @returns The exit code the process should use.
 */
export async function runCli(argv: readonly string[], io: CliIo = defaultIo): Promise<ExitCode> {
  let color = shouldUseColor(io.env, io.isTty);
  try {
    const args = parseCliArgs(argv);
    if (args.color !== undefined) color = args.color;

    switch (args.command) {
      case 'help':
        io.stdout(helpText(color));
        return EXIT.OK;

      case 'version':
        io.stdout(`${VERSION}\n`);
        return EXIT.OK;

      case 'rules':
        io.stdout(runRulesCommand(args, color));
        return EXIT.OK;

      case 'explain':
        io.stdout(runExplainCommand(args, color));
        return EXIT.OK;

      case 'scan': {
        const outcome = await runScanCommand(args, color);
        if (outcome.output.length > 0) io.stdout(outcome.output);
        if (outcome.failureReason !== undefined) {
          io.stderr(`${createPalette(color).red('✖')} ${outcome.failureReason}\n`);
        }
        return outcome.exitCode;
      }
    }
  } catch (error) {
    return reportError(error, io, color);
  }
}

function reportError(error: unknown, io: CliIo, color: boolean): ExitCode {
  const c = createPalette(color);
  if (error instanceof ShipcheckError) {
    io.stderr(`${c.red('✖')} ${error.message}\n`);
    if (error.hint !== undefined) io.stderr(`  ${c.dim(error.hint)}\n`);
    return error.exitCode as ExitCode;
  }
  io.stderr(`${c.red('✖')} ai-shipcheck failed unexpectedly: ${describeError(error)}\n`);
  if (
    error instanceof Error &&
    error.stack !== undefined &&
    process.env['SHIPCHECK_DEBUG'] === '1'
  ) {
    io.stderr(`${error.stack}\n`);
  } else {
    io.stderr(
      `  ${c.dim('Set SHIPCHECK_DEBUG=1 for a stack trace, and please report this at')}\n` +
        `  ${c.dim('https://github.com/sinceaihq/ai-shipcheck/issues')}\n`,
    );
  }
  return EXIT.INTERNAL;
}

/**
 * True when this module is the process entry point.
 *
 * Both sides are resolved through `realpath` because npm installs the binary
 * as `node_modules/.bin/ai-shipcheck`, a symlink to this file: comparing the
 * raw paths would never match, and the CLI would exit silently having done
 * nothing at all. `fileURLToPath` is used rather than URL string surgery so
 * that Windows drive letters survive the round trip.
 */
function isProcessEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isProcessEntryPoint()) {
  runCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      process.stderr.write(`ai-shipcheck crashed: ${describeError(error)}\n`);
      process.exitCode = EXIT.INTERNAL;
    });
}
