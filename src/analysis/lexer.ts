/**
 * A small, dependency-free scanner for JavaScript / TypeScript / JSX source.
 *
 * Shipcheck deliberately does *not* build a full AST. A tokeniser gives us the
 * single most valuable property for keeping false positives low — knowing
 * which bytes are real code and which are comment or string content — at a
 * fraction of the cost and with no third-party parser to keep up to date.
 *
 * The scanner produces a `masked` view of the source: a string of exactly the
 * same length as the input where every comment body, string body, template
 * body and regular-expression body is replaced with a space. Newlines are
 * preserved so byte offsets, line numbers and columns stay identical to the
 * original file. Rules regex-match against `masked` and slice snippets out of
 * the original.
 *
 * Known, deliberate limitations (documented in docs/THREAT_MODEL.md):
 *
 * - A quote that never closes on its line is treated as a plain code
 *   character rather than an unterminated string. This keeps an apostrophe in
 *   JSX text (`<p>It's fine</p>`) from swallowing the rest of the file; the
 *   cost is that the remainder of that one line is scanned as code.
 * - `/` immediately preceded by `<` is always division, never a regular
 *   expression, so JSX closing tags (`</div>`) cannot start a bogus regex.
 * - Regular-expression literals must terminate on the line they start on.
 *
 * All scanning is single-pass and linear in input length; there are no
 * backtracking regular expressions anywhere in this file.
 */

/** Kinds of span the scanner records. Plain code is not recorded as a span. */
export type SpanKind = 'line-comment' | 'block-comment' | 'string' | 'template' | 'regex';

export interface Span {
  readonly kind: SpanKind;
  /** Offset of the first character of the span, including its delimiter. */
  readonly start: number;
  /** Offset one past the last character of the span, including its delimiter. */
  readonly end: number;
  /** Offset of the first character of the span's *body* (inside delimiters). */
  readonly bodyStart: number;
  /** Offset one past the last character of the span's body. */
  readonly bodyEnd: number;
}

export interface StringLiteral {
  /** Offset of the opening quote. */
  readonly start: number;
  /** Offset one past the closing quote. */
  readonly end: number;
  readonly quote: '"' | "'" | '`';
  /** Raw body text, delimiters excluded, escapes NOT resolved. */
  readonly raw: string;
  /** Body text with simple escape sequences resolved. */
  readonly value: string;
  /** True for template literals containing `${...}` interpolation. */
  readonly interpolated: boolean;
}

export interface LexResult {
  /** Same length as the input; comment/string/regex bodies replaced by spaces. */
  readonly masked: string;
  /**
   * Same length as the input, with only comment and regex bodies replaced.
   * String and template contents are preserved, for rules that must match on
   * literal text - header names, URLs, table names, import specifiers.
   */
  readonly maskedKeepingStrings: string;
  readonly spans: readonly Span[];
  /** Every string and template literal found, in source order. */
  readonly strings: readonly StringLiteral[];
  /** Offset of the start of each line; `lineStarts[0] === 0`. */
  readonly lineStarts: readonly number[];
}

const MAX_REGEX_BODY = 400;

function isIdentChar(ch: number): boolean {
  return (
    (ch >= 97 && ch <= 122) || // a-z
    (ch >= 65 && ch <= 90) || // A-Z
    (ch >= 48 && ch <= 57) || // 0-9
    ch === 95 || // _
    ch === 36 || // $
    ch > 127 // treat non-ASCII as identifier-ish
  );
}

/** Keywords after which a `/` starts a regular expression, not a division. */
const REGEX_PRECEDING_KEYWORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
  'default',
]);

/**
 * Decide whether a `/` at `pos` begins a regular expression literal by looking
 * back at the previous significant character. This is the standard heuristic;
 * it is not perfect for every pathological input, but every misclassification
 * is bounded to a single line by {@link MAX_REGEX_BODY} and the
 * no-newline rule.
 */
function regexAllowedAt(src: string, pos: number): boolean {
  let i = pos - 1;
  while (i >= 0) {
    const c = src.charCodeAt(i);
    if (c === 32 || c === 9 || c === 13 || c === 10) {
      i--;
      continue;
    }
    break;
  }
  if (i < 0) return true;
  const ch = src[i]!;

  // `</` is a JSX closing tag, never a regex.
  if (ch === '<') return false;

  if (ch === ')' || ch === ']' || ch === '}' || ch === '"' || ch === "'" || ch === '`')
    return false;

  if (isIdentChar(src.charCodeAt(i))) {
    // Could be an identifier/number (division) or a keyword (regex).
    let start = i;
    while (start > 0 && isIdentChar(src.charCodeAt(start - 1))) start--;
    const word = src.slice(start, i + 1);
    return REGEX_PRECEDING_KEYWORDS.has(word);
  }
  return true;
}

/** Resolve the common escape sequences so secret detection sees real values. */
function unescape(raw: string): string {
  if (!raw.includes('\\')) return raw;
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = raw[++i];
    switch (next) {
      case 'n':
        out += '\n';
        break;
      case 't':
        out += '\t';
        break;
      case 'r':
        out += '\r';
        break;
      case 'b':
        out += '\b';
        break;
      case 'f':
        out += '\f';
        break;
      case 'v':
        out += '\v';
        break;
      case '0':
        out += '\0';
        break;
      case '\n':
        break; // line continuation
      case undefined:
        out += '\\';
        break;
      default:
        out += next;
    }
  }
  return out;
}

/**
 * Tokenise a JavaScript/TypeScript/JSX source string.
 *
 * @param src - File contents. Must already be a UTF-8 decoded string.
 */
export function lex(src: string): LexResult {
  const len = src.length;

  // Two masked views are built in the same pass: `out` blanks comments and
  // literal bodies, `keep` blanks only comments and regex bodies.
  const out: string[] = new Array<string>(len);
  const keep: string[] = new Array<string>(len);
  for (let i = 0; i < len; i++) {
    out[i] = src[i]!;
    keep[i] = src[i]!;
  }

  const spans: Span[] = [];
  const strings: StringLiteral[] = [];
  const lineStarts: number[] = [0];

  /** Blank out `[from, to)` but keep newlines so offsets/lines stay aligned. */
  const blank = (from: number, to: number, alsoKeepView = false): void => {
    for (let i = from; i < to && i < len; i++) {
      if (src[i] === '\n' || src[i] === '\r') continue;
      out[i] = ' ';
      if (alsoKeepView) keep[i] = ' ';
    }
  };

  // Template literal nesting: each entry is the brace depth at which the
  // enclosing `${` was opened.
  const templateStack: {
    start: number;
    bodyStart: number;
    braceDepth: number;
    interpolated: boolean;
  }[] = [];
  let braceDepth = 0;

  let i = 0;
  while (i < len) {
    const ch = src[i]!;

    if (ch === '\n') {
      lineStarts.push(i + 1);
      i++;
      continue;
    }

    // --- inside a template literal? -----------------------------------------
    const activeTemplate =
      templateStack.length > 0 ? templateStack[templateStack.length - 1]! : null;
    if (activeTemplate !== null && braceDepth === activeTemplate.braceDepth) {
      if (ch === '\\') {
        blank(i, Math.min(i + 2, len));
        i += 2;
        continue;
      }
      if (ch === '$' && src[i + 1] === '{') {
        activeTemplate.interpolated = true;
        braceDepth++;
        i += 2;
        continue;
      }
      if (ch === '`') {
        const t = templateStack.pop()!;
        spans.push({
          kind: 'template',
          start: t.start,
          end: i + 1,
          bodyStart: t.bodyStart,
          bodyEnd: i,
        });
        const raw = src.slice(t.bodyStart, i);
        strings.push({
          start: t.start,
          end: i + 1,
          quote: '`',
          raw,
          value: unescape(raw),
          interpolated: t.interpolated,
        });
        i++;
        continue;
      }
      // Literal template text is blanked as it is scanned, so that `${...}`
      // interpolations - which are real code - stay visible in the masked view.
      blank(i, i + 1);
      i++;
      continue;
    }

    // --- comments -----------------------------------------------------------
    if (ch === '/' && src[i + 1] === '/') {
      let end = i + 2;
      while (end < len && src[end] !== '\n') end++;
      blank(i, end, true);
      spans.push({ kind: 'line-comment', start: i, end, bodyStart: i + 2, bodyEnd: end });
      i = end;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      let end = i + 2;
      while (end < len && !(src[end] === '*' && src[end + 1] === '/')) end++;
      const close = Math.min(end + 2, len);
      blank(i, close, true);
      spans.push({ kind: 'block-comment', start: i, end: close, bodyStart: i + 2, bodyEnd: end });
      i = close;
      continue;
    }

    // --- strings ------------------------------------------------------------
    if (ch === '"' || ch === "'") {
      const closed = scanQuoted(src, i, ch);
      if (closed === -1) {
        // Unterminated on this line: treat the quote as an ordinary character.
        i++;
        continue;
      }
      blank(i + 1, closed);
      spans.push({ kind: 'string', start: i, end: closed + 1, bodyStart: i + 1, bodyEnd: closed });
      const raw = src.slice(i + 1, closed);
      strings.push({
        start: i,
        end: closed + 1,
        quote: ch,
        raw,
        value: unescape(raw),
        interpolated: false,
      });
      i = closed + 1;
      continue;
    }

    if (ch === '`') {
      templateStack.push({ start: i, bodyStart: i + 1, braceDepth, interpolated: false });
      i++;
      continue;
    }

    // --- regex literals -----------------------------------------------------
    if (ch === '/' && regexAllowedAt(src, i)) {
      const end = scanRegex(src, i);
      if (end !== -1) {
        blank(i + 1, end, true);
        spans.push({ kind: 'regex', start: i, end: end + 1, bodyStart: i + 1, bodyEnd: end });
        i = end + 1;
        continue;
      }
    }

    if (ch === '{') braceDepth++;
    else if (ch === '}') {
      braceDepth--;
      if (braceDepth < 0) braceDepth = 0;
    }

    i++;
  }

  // An unterminated template runs to EOF; blank what is left so its body is
  // never scanned as code.
  while (templateStack.length > 0) {
    const t = templateStack.pop()!;
    blank(t.bodyStart, len);
    spans.push({
      kind: 'template',
      start: t.start,
      end: len,
      bodyStart: t.bodyStart,
      bodyEnd: len,
    });
  }

  spans.sort((a, b) => a.start - b.start);
  strings.sort((a, b) => a.start - b.start);

  return {
    masked: out.join(''),
    maskedKeepingStrings: keep.join(''),
    spans,
    strings,
    lineStarts,
  };
}

/**
 * Scan a single- or double-quoted string starting at `start`.
 * @returns offset of the closing quote, or -1 if it does not close on the line.
 */
function scanQuoted(src: string, start: number, quote: string): number {
  const len = src.length;
  let i = start + 1;
  while (i < len) {
    const ch = src[i]!;
    if (ch === '\\') {
      // A backslash-newline is a line continuation; anything else escapes one char.
      i += 2;
      continue;
    }
    if (ch === '\n') return -1;
    if (ch === quote) return i;
    i++;
  }
  return -1;
}

/**
 * Scan a regular-expression literal starting at `start`.
 * @returns offset of the closing `/`, or -1 when it is really a division.
 */
function scanRegex(src: string, start: number): number {
  const len = src.length;
  let i = start + 1;
  let inClass = false;
  const limit = Math.min(len, start + MAX_REGEX_BODY);
  while (i < limit) {
    const ch = src[i]!;
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '\n') return -1;
    if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    else if (ch === '/' && !inClass) {
      // An empty regex `//` is a comment, already handled earlier.
      return i === start + 1 ? -1 : i;
    }
    i++;
  }
  return -1;
}
