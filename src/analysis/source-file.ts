import { lex, type LexResult, type StringLiteral } from './lexer.js';
import type { Evidence } from '../types/core.js';
import type { FileClassification, FileRole } from '../detection/classify.js';
import { maskSecret } from '../utils/mask.js';

/** Maximum characters kept in an evidence snippet. */
const SNIPPET_MAX = 200;

export interface SourceFileInit {
  /** Repository-relative POSIX path. */
  readonly path: string;
  /** Absolute path on disk. */
  readonly absolutePath: string;
  readonly content: string;
  readonly size: number;
  readonly classification: FileClassification;
}

/** A regex match resolved back to source coordinates. */
export interface SourceMatch {
  /** Offset in the original file. */
  readonly index: number;
  /** The matched text, taken from the *original* source, not the masked view. */
  readonly text: string;
  /** Capture groups, from the original source. */
  readonly groups: readonly (string | undefined)[];
  /** Named capture groups, from the original source. */
  readonly named: Readonly<Record<string, string | undefined>>;
}

/**
 * One scanned file, with lazily-computed lexical analysis.
 *
 * Rules should scan {@link code} (comments and literal bodies blanked) rather
 * than {@link content}, and use {@link evidenceAt} to build findings so that
 * masking and snippet truncation are applied consistently.
 */
export class SourceFile {
  readonly path: string;
  readonly absolutePath: string;
  readonly content: string;
  readonly size: number;
  readonly ext: string;
  /** What kind of file this is, decided once when the index is built. */
  readonly role: FileRole;
  /** True when the module is marked `'use client'`. */
  readonly isClientComponent: boolean;
  /** True when this module executes on a server. */
  readonly isServer: boolean;
  /** True when this module ships to the browser. */
  readonly isClient: boolean;

  #lex: LexResult | null = null;

  constructor(init: SourceFileInit) {
    this.path = init.path;
    this.absolutePath = init.absolutePath;
    this.content = init.content;
    this.size = init.size;
    this.role = init.classification.role;
    this.isClientComponent = init.classification.isClientComponent;
    this.isServer = init.classification.isServer;
    this.isClient = init.classification.isClient;
    this.ext = normaliseExtension(init.path);
  }

  get lexed(): LexResult {
    this.#lex ??= lex(this.content);
    return this.#lex;
  }

  /**
   * The source with comment, string, template and regex bodies blanked out.
   * Same length as {@link content}, so every offset is directly comparable.
   *
   * This is the default view: matching against it means a rule can never fire
   * on a construct that only appears inside a comment or a string.
   */
  get code(): string {
    return this.lexed.masked;
  }

  /**
   * The source with only comment and regex bodies blanked out; string and
   * template contents are preserved.
   *
   * Use this - through {@link matchesText} - when the rule needs to match the
   * *content* of a literal: a header name, a URL, a table name, an import
   * specifier. Comments are still masked, so a commented-out example cannot
   * trigger a finding.
   */
  get text(): string {
    return this.lexed.maskedKeepingStrings;
  }

  /** Every string and template literal in the file, in source order. */
  get strings(): readonly StringLiteral[] {
    return this.lexed.strings;
  }

  get lineCount(): number {
    return this.lexed.lineStarts.length;
  }

  /** True when the file is TypeScript (`.ts` / `.tsx` / `.mts` / `.cts`). */
  get isTypeScript(): boolean {
    return this.ext === '.ts' || this.ext === '.tsx' || this.ext === '.mts' || this.ext === '.cts';
  }

  /** True when the file may contain JSX. */
  get isJsx(): boolean {
    return this.ext === '.tsx' || this.ext === '.jsx' || this.ext === '.js';
  }

  /** 1-based line number containing `offset`. */
  lineAt(offset: number): number {
    const starts = this.lexed.lineStarts;
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  }

  /** 1-based column of `offset` within its line. */
  columnAt(offset: number): number {
    const line = this.lineAt(offset);
    return offset - this.lexed.lineStarts[line - 1]! + 1;
  }

  /** Full text of a 1-based line, without its terminator. */
  lineText(line: number): string {
    const starts = this.lexed.lineStarts;
    const start = starts[line - 1];
    if (start === undefined) return '';
    const end = starts[line] ?? this.content.length;
    return this.content.slice(start, end).replace(/\r?\n$/, '');
  }

  /**
   * Run a global regex against the masked code view.
   *
   * Match and capture-group text is sliced from the *original* source using
   * the regex's own match indices, so a group that lands inside a literal
   * still yields the real characters even though the pattern matched blanks.
   *
   * The regex must have the `g` flag.
   */
  *matches(pattern: RegExp): Generator<SourceMatch> {
    yield* this.#scan(pattern, this.code);
  }

  /**
   * Like {@link matches}, but scans the view that preserves string contents.
   *
   * Reach for this only when the rule genuinely needs literal text; the
   * stricter {@link matches} should stay the default because it cannot fire on
   * an example inside a string.
   */
  *matchesText(pattern: RegExp): Generator<SourceMatch> {
    yield* this.#scan(pattern, this.text);
  }

  *#scan(pattern: RegExp, haystack: string): Generator<SourceMatch> {
    if (!pattern.global) {
      throw new Error(`SourceFile match patterns must be global, got ${String(pattern)}`);
    }
    const flags = pattern.flags.includes('d') ? pattern.flags : `${pattern.flags}d`;
    const re = new RegExp(pattern.source, flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(haystack)) !== null) {
      const index = m.index;
      const text = this.content.slice(index, index + m[0].length);
      const indices = m.indices;
      const groups: (string | undefined)[] = [];
      for (let g = 1; g < m.length; g++) {
        const span = indices?.[g];
        groups.push(span === undefined ? undefined : this.content.slice(span[0], span[1]));
      }
      const named: Record<string, string | undefined> = {};
      if (m.groups !== undefined) {
        for (const key of Object.keys(m.groups)) {
          const span = indices?.groups?.[key];
          named[key] = span === undefined ? undefined : this.content.slice(span[0], span[1]);
        }
      }
      yield { index, text, groups, named };
      if (m[0].length === 0) re.lastIndex++;
    }
  }

  /** True when at least one match of `pattern` exists in the code view. */
  has(pattern: RegExp): boolean {
    for (const _ of this.matches(pattern)) return true;
    return false;
  }

  /** True when at least one match exists in the string-preserving view. */
  hasText(pattern: RegExp): boolean {
    for (const _ of this.matchesText(pattern)) return true;
    return false;
  }

  /**
   * Find the matching `}` for the `{` at or after `from`, using the masked
   * view so braces inside strings and comments are ignored.
   *
   * @returns offset of the closing brace, or -1 when unbalanced.
   */
  matchBrace(from: number): number {
    const code = this.code;
    let i = code.indexOf('{', from);
    if (i === -1) return -1;
    let depth = 0;
    for (; i < code.length; i++) {
      const ch = code[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  /**
   * Extract the body of the function whose parameter list starts at or after
   * `from`. Handles both `{ ... }` bodies and concise arrow bodies.
   */
  functionBody(from: number): { start: number; end: number; text: string } | null {
    const code = this.code;
    const brace = code.indexOf('{', from);
    if (brace === -1) return null;
    const arrow = code.indexOf('=>', from);
    // A concise arrow body (`=> expr`) has no leading brace before a newline.
    if (arrow !== -1 && arrow < brace) {
      const between = code.slice(arrow + 2, brace);
      if (between.trim().length > 0) {
        // `=> expr` — take to end of statement (best effort: end of line).
        const eol = code.indexOf('\n', arrow);
        const end = eol === -1 ? code.length : eol;
        return { start: arrow + 2, end, text: this.content.slice(arrow + 2, end) };
      }
    }
    const close = this.matchBrace(brace);
    if (close === -1) return null;
    return { start: brace, end: close + 1, text: this.content.slice(brace, close + 1) };
  }

  /**
   * Build an {@link Evidence} record for an offset, masking anything that
   * looks like a credential and truncating long lines.
   */
  evidenceAt(offset: number, options: { length?: number; note?: string } = {}): Evidence {
    const line = this.lineAt(offset);
    const column = this.columnAt(offset);
    const length = options.length ?? 0;
    const endOffset = offset + length;
    const endLine = this.lineAt(endOffset);
    const raw = this.lineText(line).trim();
    const snippet = truncate(maskSecret(raw), SNIPPET_MAX);
    const ev: {
      file: string;
      line: number;
      column: number;
      snippet: string;
      endLine?: number;
      endColumn?: number;
      note?: string;
    } = { file: this.path, line, column, snippet };
    if (length > 0) {
      ev.endLine = endLine;
      ev.endColumn = this.columnAt(endOffset);
    }
    if (options.note !== undefined) ev.note = options.note;
    return ev;
  }
}

/**
 * Lowercase extension, with environment files normalised.
 *
 * `.env.local` and `.env.production` are the same kind of file as `.env`, so
 * they all report `.env`. Without this a rule that opts into `.env` would
 * silently skip every environment variant.
 */
function normaliseExtension(filePath: string): string {
  const base = filePath.slice(filePath.lastIndexOf('/') + 1).toLowerCase();
  if (base.startsWith('.env')) return '.env';
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
