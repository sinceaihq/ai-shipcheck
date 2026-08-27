/**
 * Minimal JSON-with-comments reader.
 *
 * `tsconfig.json`, `.eslintrc.json` and friends are routinely written with
 * comments and trailing commas. Pulling in a full JSON5 dependency for this is
 * not worth it, and `JSON.parse` on the raw text fails with an unhelpful
 * message. This strips comments and trailing commas, then delegates to
 * `JSON.parse` so the error text still points at a real offset.
 */

export class JsonParseError extends Error {
  constructor(
    readonly file: string,
    readonly detail: string,
    readonly line?: number,
  ) {
    super(
      line === undefined
        ? `Could not parse ${file}: ${detail}`
        : `Could not parse ${file}: ${detail} at line ${line}`,
    );
    this.name = 'JsonParseError';
  }
}

/** Remove `//` and block comments without disturbing string contents. */
export function stripJsonComments(text: string): string {
  const out: string[] = new Array<string>(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text[i]!;
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const ch = text[i]!;
    if (inString) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i++;
      continue;
    }
    if (ch === '"') {
      inString = true;
      i++;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      let end = i;
      while (end < text.length && text[end] !== '\n') {
        out[end] = ' ';
        end++;
      }
      i = end;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      let end = i;
      while (end < text.length && !(text[end] === '*' && text[end + 1] === '/')) {
        if (text[end] !== '\n') out[end] = ' ';
        end++;
      }
      for (let k = end; k < Math.min(end + 2, text.length); k++) out[k] = ' ';
      i = end + 2;
      continue;
    }
    i++;
  }
  return out.join('');
}

/** Remove commas that directly precede `}` or `]`. */
export function stripTrailingCommas(text: string): string {
  return text.replace(/,(?=\s*[}\]])/g, ' ');
}

/**
 * Parse JSONC, producing a developer-readable error on failure.
 *
 * @param text - Raw file contents.
 * @param file - Path used in error messages.
 */
export function parseJsonc<T = unknown>(text: string, file: string): T {
  const cleaned = stripTrailingCommas(stripJsonComments(text));
  try {
    return JSON.parse(cleaned) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const posMatch = /position (\d+)/.exec(message);
    let line: number | undefined;
    if (posMatch?.[1] !== undefined) {
      const pos = Number(posMatch[1]);
      line = cleaned.slice(0, pos).split('\n').length;
    }
    const detail = message
      .replace(/^JSON\.parse: /, '')
      .replace(/ in JSON at position \d+.*$/s, '');
    throw new JsonParseError(file, detail, line);
  }
}
