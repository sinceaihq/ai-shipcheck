import { describe, expect, it } from 'vitest';
import {
  JsonParseError,
  parseJsonc,
  stripJsonComments,
  stripTrailingCommas,
} from '../../src/utils/jsonc.js';

describe('stripJsonComments', () => {
  it('removes line and block comments', () => {
    const input = '{\n  // a\n  "x": 1, /* b */\n  "y": 2\n}';
    const stripped = stripJsonComments(input);
    expect(stripped).not.toContain('//');
    expect(stripped).not.toContain('/*');
    expect(stripped).toHaveLength(input.length);
  });

  it('does not touch comment markers inside strings', () => {
    const input = '{ "url": "https://example.com/a" }';
    expect(stripJsonComments(input)).toBe(input);
  });

  it('handles escaped quotes inside strings', () => {
    const input = String.raw`{ "a": "he said \"//\"" }`;
    expect(stripJsonComments(input)).toBe(input);
  });
});

describe('stripTrailingCommas', () => {
  it('removes trailing commas before closers', () => {
    expect(stripTrailingCommas('{"a":1,}')).toBe('{"a":1 }');
    expect(stripTrailingCommas('[1,2,]')).toBe('[1,2 ]');
  });
});

describe('parseJsonc', () => {
  it('parses JSON with comments and trailing commas', () => {
    const value = parseJsonc<{ strict: boolean }>(
      '{\n  // strictness\n  "strict": true,\n}',
      'tsconfig.json',
    );
    expect(value.strict).toBe(true);
  });

  it('reports the file and the line on failure', () => {
    try {
      parseJsonc('{\n  "a": 1\n  "b": 2\n}', 'tsconfig.json');
      expect.unreachable('parseJsonc should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(JsonParseError);
      const message = (error as Error).message;
      expect(message).toContain('tsconfig.json');
      expect(message).toMatch(/line \d+/);
    }
  });
});
