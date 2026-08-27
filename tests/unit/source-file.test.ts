import { describe, expect, it } from 'vitest';
import { sourceFile } from '../helpers/project.js';

describe('SourceFile', () => {
  it('maps offsets to 1-based lines and columns', () => {
    const file = sourceFile('a.ts', 'const a = 1;\nconst b = 2;\n');
    expect(file.lineAt(0)).toBe(1);
    expect(file.columnAt(0)).toBe(1);
    expect(file.lineAt(13)).toBe(2);
    expect(file.columnAt(13)).toBe(1);
    expect(file.lineText(2)).toBe('const b = 2;');
  });

  it('returns capture groups sliced from the original source, not the masked view', () => {
    const file = sourceFile('a.ts', 'import x from "lodash";');
    const matches = [...file.matches(/from\s*["']([^"']+)["']/g)];
    expect(matches).toHaveLength(1);
    expect(matches[0]?.groups[0]).toBe('lodash');
  });

  it('does not match inside string literals with the default view', () => {
    const file = sourceFile('a.ts', 'const doc = "call eval(x) here";');
    expect(file.has(/eval\s*\(/g)).toBe(false);
  });

  it('matches inside string literals with the text view', () => {
    const file = sourceFile('a.ts', 'res.setHeader("Access-Control-Allow-Origin", "*");');
    expect(file.hasText(/Access-Control-Allow-Origin/g)).toBe(true);
    expect(file.has(/Access-Control-Allow-Origin/g)).toBe(false);
  });

  it('never matches inside comments in either view', () => {
    const file = sourceFile('a.ts', '// Access-Control-Allow-Origin: *\nconst a = 1;');
    expect(file.hasText(/Access-Control-Allow-Origin/g)).toBe(false);
  });

  it('rejects non-global patterns', () => {
    const file = sourceFile('a.ts', 'const a = 1;');
    expect(() => [...file.matches(/a/)]).toThrow(/global/);
  });

  it('matches braces using the masked view', () => {
    const file = sourceFile('a.ts', 'function f() { const s = "}"; return 1; }');
    const open = file.code.indexOf('{');
    const close = file.matchBrace(open);
    expect(close).toBe(file.content.length - 1);
  });

  it('extracts a braced function body', () => {
    const file = sourceFile('a.ts', 'export async function POST(req) {\n  return 1;\n}\n');
    const body = file.functionBody(0);
    expect(body?.text).toContain('return 1;');
  });

  it('reports the line a match is really on, after block comments', () => {
    const file = sourceFile(
      'a.ts',
      [
        '/**',
        ' * A licence header.',
        ' * Spanning several lines.',
        ' */',
        '',
        'const r = eval("1");',
      ].join('\n'),
    );
    const match = [...file.matches(/eval\s*\(/g)][0];
    expect(match).toBeDefined();
    const evidence = file.evidenceAt(match!.index);
    expect(evidence.line).toBe(6);
    expect(file.lineText(evidence.line)).toContain('eval');
  });

  it('produces evidence whose snippet is genuinely on the reported line', () => {
    const source = [
      '/* header',
      '   continued */',
      'import x from "y";',
      '',
      '/** doc */',
      'export function f() {',
      '  return eval("2");',
      '}',
    ].join('\n');
    const file = sourceFile('a.ts', source);
    for (const match of file.matches(/eval\s*\(/g)) {
      const evidence = file.evidenceAt(match.index);
      expect(source.split('\n')[evidence.line - 1]).toContain('eval');
    }
  });

  it('masks credentials in evidence snippets', () => {
    const file = sourceFile('a.ts', 'const apiKey = "sk-ant-SHIPCHECKFIXTUREKEY000000000000";');
    const evidence = file.evidenceAt(0);
    expect(evidence.snippet).not.toContain('SHIPCHECKFIXTUREKEY000000000000');
    expect(evidence.snippet).toContain('masked');
  });

  it('normalises environment file extensions', () => {
    expect(sourceFile('.env.production', 'A=1').ext).toBe('.env');
    expect(sourceFile('.env', 'A=1').ext).toBe('.env');
    expect(sourceFile('app/page.tsx', '').ext).toBe('.tsx');
    expect(sourceFile('Dockerfile', '').ext).toBe('');
  });

  it('reports line and column for an offset at end of file', () => {
    const file = sourceFile('a.ts', 'ab\ncd');
    expect(file.lineAt(5)).toBe(2);
    expect(file.lineText(99)).toBe('');
  });
});
