import { parseArgs } from 'node:util';
import { SEVERITIES, type Severity } from '../types/core.js';
import { FORMATS, type Format } from '../reporters/types.js';
import { UsageError } from '../utils/errors.js';

export type Command = 'scan' | 'rules' | 'explain' | 'help' | 'version';

export interface ParsedArgs {
  readonly command: Command;
  /** Positional arguments after the command. */
  readonly positionals: readonly string[];
  readonly format: Format;
  readonly output: string | undefined;
  readonly failOn: Severity | 'none' | undefined;
  readonly minScore: number | undefined;
  readonly config: string | undefined;
  readonly color: boolean | undefined;
  readonly quiet: boolean;
  readonly category: string | undefined;
  readonly json: boolean;
}

const KNOWN_COMMANDS = new Set<Command>(['scan', 'rules', 'explain', 'help', 'version']);

/**
 * Parse command-line arguments.
 *
 * The first positional is treated as a command when it names one, and as a
 * scan path otherwise - so `ai-shipcheck .` and `ai-shipcheck scan .` are the
 * same thing, which is what makes the zero-argument path pleasant.
 */
export function parseCliArgs(argv: readonly string[]): ParsedArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        format: { type: 'string', short: 'f' },
        output: { type: 'string', short: 'o' },
        'fail-on': { type: 'string' },
        'min-score': { type: 'string' },
        config: { type: 'string', short: 'c' },
        'no-color': { type: 'boolean' },
        color: { type: 'boolean' },
        quiet: { type: 'boolean', short: 'q' },
        category: { type: 'string' },
        json: { type: 'boolean' },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const flag = /'(--?[^']+)'/.exec(message)?.[1];
    throw new UsageError(
      flag !== undefined
        ? `Unknown or malformed option ${flag}.`
        : `Could not parse arguments: ${message}`,
      'Run "ai-shipcheck --help" to see the available options.',
    );
  }

  const values = parsed.values;
  const positionals = parsed.positionals;

  if (values.help === true) {
    return base('help', positionals, values);
  }
  if (values.version === true) {
    return base('version', positionals, values);
  }

  const first = positionals[0];
  let command: Command = 'scan';
  let rest = positionals;
  if (first !== undefined && KNOWN_COMMANDS.has(first as Command)) {
    command = first as Command;
    rest = positionals.slice(1);
  }

  if (command === 'explain' && rest.length === 0) {
    throw new UsageError(
      'The "explain" command needs a rule id.',
      'For example: ai-shipcheck explain security/eval-usage. Run "ai-shipcheck rules" to list them.',
    );
  }

  return base(command, rest, values);
}

type RawValues = Record<string, string | boolean | undefined>;

function base(command: Command, positionals: readonly string[], values: RawValues): ParsedArgs {
  return {
    command,
    positionals,
    format: parseFormat(values['format']),
    output: asString(values['output']),
    failOn: parseFailOn(values['fail-on']),
    minScore: parseMinScore(values['min-score']),
    config: asString(values['config']),
    color: values['no-color'] === true ? false : values['color'] === true ? true : undefined,
    quiet: values['quiet'] === true,
    category: asString(values['category']),
    json: values['json'] === true,
  };
}

function asString(value: string | boolean | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseFormat(value: string | boolean | undefined): Format {
  if (typeof value !== 'string') return 'pretty';
  if (!(FORMATS as readonly string[]).includes(value)) {
    throw new UsageError(
      `Unknown output format "${value}".`,
      `Valid formats: ${FORMATS.join(', ')}.`,
    );
  }
  return value as Format;
}

function parseFailOn(value: string | boolean | undefined): Severity | 'none' | undefined {
  if (typeof value !== 'string') return undefined;
  const allowed: readonly string[] = [...SEVERITIES, 'none'];
  if (!allowed.includes(value)) {
    throw new UsageError(
      `Invalid --fail-on value "${value}".`,
      `Valid values: ${allowed.join(', ')}. Use "none" to never fail on findings.`,
    );
  }
  return value as Severity | 'none';
}

function parseMinScore(value: string | boolean | undefined): number | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new UsageError(
      `Invalid --min-score value "${value}".`,
      'Pass a number between 0 and 100, for example --min-score 80.',
    );
  }
  return parsed;
}
