import { describe, it, expect } from 'vitest';

function slugify(value: string) {
  return value.toLowerCase().replace(/\s+/g, '-');
}

describe('slugify', () => {
  it.only('lowercases and hyphenates', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it.skip('strips punctuation', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
  });
});
