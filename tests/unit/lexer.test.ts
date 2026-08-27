import { describe, expect, it } from 'vitest';
import { lex } from '../../src/analysis/lexer.js';

/**
 * The lexer is the foundation every rule stands on: if it mislabels a byte,
 * a rule either misses a real problem or invents one. These tests pin the
 * behaviours that matter, including the deliberate limitations.
 */
describe('lex', () => {
  it('preserves length and line structure in both masked views', () => {
    const src = 'const a = "hello";\n// comment\nconst b = `x${a}y`;\n';
    const result = lex(src);
    expect(result.masked).toHaveLength(src.length);
    expect(result.maskedKeepingStrings).toHaveLength(src.length);
    expect(result.masked.split('\n')).toHaveLength(src.split('\n').length);
    expect(result.lineStarts).toEqual([0, 19, 30, 50]);
  });

  it('blanks string bodies but keeps their delimiters', () => {
    const result = lex('const key = "abcdef";');
    expect(result.masked).toBe('const key = "      ";');
    expect(result.maskedKeepingStrings).toBe('const key = "abcdef";');
  });

  it('blanks comments in both views', () => {
    const result = lex('a; // eval(x)\nb;');
    expect(result.masked).not.toContain('eval');
    expect(result.maskedKeepingStrings).not.toContain('eval');
  });

  it('blanks block comments and keeps newlines', () => {
    const src = 'a;\n/* line one\n   line two */\nb;';
    const result = lex(src);
    expect(result.masked).toHaveLength(src.length);
    expect(result.masked).not.toContain('line one');
    expect(result.masked.split('\n')).toHaveLength(4);
  });

  it('keeps template interpolations visible as code', () => {
    const result = lex('const q = `SELECT * FROM t WHERE id = ${userId}`;');
    expect(result.masked).toContain('${userId}');
    expect(result.masked).not.toContain('SELECT');
  });

  it('handles nested template interpolation', () => {
    const src = 'const a = `outer ${`inner ${x}`} end`;';
    const result = lex(src);
    expect(result.masked).toHaveLength(src.length);
    expect(result.masked).toContain('${x}');
    expect(result.masked).not.toContain('outer');
    expect(result.masked).not.toContain('inner');
  });

  it('records string literals with escapes resolved', () => {
    const result = lex(String.raw`const s = "a\nb\"c";`);
    expect(result.strings).toHaveLength(1);
    expect(result.strings[0]?.value).toBe('a\nb"c');
    expect(result.strings[0]?.quote).toBe('"');
  });

  it('marks interpolated templates', () => {
    const result = lex('const a = `x${y}z`; const b = `plain`;');
    const templates = result.strings.filter((s) => s.quote === '`');
    expect(templates[0]?.interpolated).toBe(true);
    expect(templates[1]?.interpolated).toBe(false);
  });

  it('treats an apostrophe in JSX text as a plain character, not a string', () => {
    const src = "const el = <p>It's fine</p>;\nconst secret = 'abcdef';";
    const result = lex(src);
    // The apostrophe must not swallow the rest of the file.
    expect(result.strings.some((s) => s.value === 'abcdef')).toBe(true);
  });

  it('does not treat a JSX closing tag as a regex literal', () => {
    const src = 'const a = <div>{x}</div>;\nconst b = <div>{y}</div>;\nconst c = danger;';
    const result = lex(src);
    expect(result.masked).toContain('danger');
    expect(result.spans.some((s) => s.kind === 'regex')).toBe(false);
  });

  it('recognises regex literals after operators and keywords', () => {
    const result = lex('const re = /ab+c/gi; if (x) return /d/.test(s);');
    const regexes = result.spans.filter((s) => s.kind === 'regex');
    expect(regexes).toHaveLength(2);
    expect(result.masked).not.toContain('ab+c');
  });

  it('treats division as division, not a regex', () => {
    const src = 'const ratio = total / count / 2;\nconst tail = keepMe;';
    const result = lex(src);
    expect(result.spans.some((s) => s.kind === 'regex')).toBe(false);
    expect(result.masked).toContain('keepMe');
  });

  it('does not let an unterminated regex span lines', () => {
    const src = 'const a = b / c;\nconst d = e / f;\nconst survivor = 1;';
    const result = lex(src);
    expect(result.masked).toContain('survivor');
  });

  it('handles a character class containing a slash', () => {
    const result = lex('const re = /[/]+/g; const after = 1;');
    expect(result.masked).toContain('after');
    expect(result.spans.filter((s) => s.kind === 'regex')).toHaveLength(1);
  });

  it('blanks an unterminated template to end of file rather than mis-parsing', () => {
    const src = 'const a = `never closed\nconst b = eval(x);';
    const result = lex(src);
    expect(result.masked).not.toContain('eval');
    expect(result.masked).toHaveLength(src.length);
  });

  it('is linear on pathological input', () => {
    const src = `${'"'.repeat(2000)}\n${'`'.repeat(200)}\n${'/'.repeat(2000)}`;
    const started = performance.now();
    const result = lex(src);
    expect(result.masked).toHaveLength(src.length);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('handles an empty file', () => {
    const result = lex('');
    expect(result.masked).toBe('');
    expect(result.lineStarts).toEqual([0]);
  });
});
