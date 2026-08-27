import { describe, expect, it } from 'vitest';
import {
  createPalette,
  padEnd,
  shouldUseColor,
  stripAnsi,
  visibleLength,
} from '../../src/utils/color.js';

describe('shouldUseColor', () => {
  it('honours NO_COLOR', () => {
    expect(shouldUseColor({ NO_COLOR: '1' }, true)).toBe(false);
  });

  it('honours FORCE_COLOR over everything else', () => {
    expect(shouldUseColor({ NO_COLOR: '1', FORCE_COLOR: '1' }, false)).toBe(true);
  });

  it('treats FORCE_COLOR=0 as not forcing', () => {
    expect(shouldUseColor({ FORCE_COLOR: '0' }, false)).toBe(false);
  });

  it('disables colour for dumb terminals', () => {
    expect(shouldUseColor({ TERM: 'dumb' }, true)).toBe(false);
  });

  it('follows the TTY flag otherwise', () => {
    expect(shouldUseColor({}, true)).toBe(true);
    expect(shouldUseColor({}, false)).toBe(false);
  });
});

describe('createPalette', () => {
  it('is the identity when disabled', () => {
    const palette = createPalette(false);
    expect(palette.red('x')).toBe('x');
    expect(palette.enabled).toBe(false);
  });

  it('wraps text in escape codes when enabled', () => {
    const palette = createPalette(true);
    const styled = palette.red('x');
    expect(styled).not.toBe('x');
    expect(stripAnsi(styled)).toBe('x');
  });
});

describe('visibleLength and padEnd', () => {
  it('ignores escape codes', () => {
    const styled = createPalette(true).green('abc');
    expect(visibleLength(styled)).toBe(3);
    expect(visibleLength(padEnd(styled, 6))).toBe(6);
  });
});
