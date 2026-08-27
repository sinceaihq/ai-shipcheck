/**
 * A tiny ANSI colour helper.
 *
 * Deliberately hand-rolled rather than pulled in as a dependency: the surface
 * we need is a dozen styles, and a scanning tool that inspects other people's
 * supply chains should keep its own dependency tree close to empty.
 *
 * Colour is disabled when any of the following hold:
 * - `NO_COLOR` is set (https://no-color.org)
 * - `TERM=dumb`
 * - the destination stream is not a TTY
 * - `--no-color` was passed
 *
 * `FORCE_COLOR` (any value other than `0`/`false`) overrides all of the above.
 */

/** Control Sequence Introducer. */
const CSI = '\u001B[';

type Styler = (text: string) => string;

const CODES = {
  reset: [0, 0],
  bold: [1, 22],
  dim: [2, 22],
  italic: [3, 23],
  underline: [4, 24],
  inverse: [7, 27],
  black: [30, 39],
  red: [31, 39],
  green: [32, 39],
  yellow: [33, 39],
  blue: [34, 39],
  magenta: [35, 39],
  cyan: [36, 39],
  white: [37, 39],
  gray: [90, 39],
  bgRed: [41, 49],
  bgGreen: [42, 49],
  bgYellow: [43, 49],
  bgBlue: [44, 49],
  bgGray: [100, 49],
} as const satisfies Record<string, readonly [number, number]>;

export type StyleName = keyof typeof CODES;

export type Palette = Record<StyleName, Styler> & { readonly enabled: boolean };

/**
 * Decide whether ANSI output is appropriate for the current environment.
 *
 * @param env - Environment to inspect; injectable for tests.
 * @param isTty - Whether the destination stream is a terminal.
 */
export function shouldUseColor(
  env: NodeJS.ProcessEnv = process.env,
  isTty: boolean = process.stdout.isTTY === true,
): boolean {
  const force = env['FORCE_COLOR'];
  if (force !== undefined && force !== '0' && force !== 'false') return true;
  const noColor = env['NO_COLOR'];
  if (noColor !== undefined && noColor !== '') return false;
  if (env['TERM'] === 'dumb') return false;
  return isTty;
}

/** Build a palette. When `enabled` is false every styler is the identity. */
export function createPalette(enabled: boolean): Palette {
  const entries = Object.entries(CODES).map(([name, codes]) => {
    const [open, close] = codes;
    const styler: Styler = enabled
      ? (text) => `${CSI}${open}m${text}${CSI}${close}m`
      : (text) => text;
    return [name, styler] as const;
  });
  return Object.assign(Object.fromEntries(entries) as Record<StyleName, Styler>, { enabled });
}

const ANSI_PATTERN = /\u001B\[[0-9;]*m/g;

/** Strip ANSI escape sequences - used when writing terminal output to a file. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}

/** Visible width of a string, ignoring ANSI escapes. */
export function visibleLength(text: string): number {
  return stripAnsi(text).length;
}

/** Pad `text` to `width` visible characters. */
export function padEnd(text: string, width: number): string {
  const diff = width - visibleLength(text);
  return diff > 0 ? text + ' '.repeat(diff) : text;
}

/** Pad `text` to `width` visible characters, aligned right. */
export function padStart(text: string, width: number): string {
  const diff = width - visibleLength(text);
  return diff > 0 ? ' '.repeat(diff) + text : text;
}
