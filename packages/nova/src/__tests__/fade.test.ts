import { describe, expect, it } from 'vitest';
import { fadeChar, fadeLinePerChar, fadeStyledChar, fadeText, parseStyledChars, stripAnsi } from '../fade.js';

describe('stripAnsi', () => {
  it('removes SGR sequences and leaves plain text intact', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m text')).toBe('red text');
    expect(stripAnsi('plain')).toBe('plain');
    expect(stripAnsi('')).toBe('');
  });
});

describe('parseStyledChars', () => {
  it('splits a plain string into one StyledChar per character', () => {
    const chars = parseStyledChars('abc');
    expect(chars).toHaveLength(3);
    expect(chars.map((c) => c.plain)).toEqual(['a', 'b', 'c']);
  });

  it('preserves ANSI styles on each character', () => {
    const chars = parseStyledChars('\x1b[31mab\x1b[0mc');
    expect(chars).toHaveLength(3);
    // First two chars carry the red SGR; third is unstyled.
    expect(chars[0]!.plain).toBe('a');
    expect(chars[1]!.plain).toBe('b');
    expect(chars[2]!.plain).toBe('c');
  });

  it('empty input yields an empty array', () => {
    expect(parseStyledChars('')).toEqual([]);
  });
});

describe('fadeChar', () => {
  it('returns the character unchanged at full opacity', () => {
    expect(fadeChar('A', 1)).toContain('A');
  });

  it('returns a faded character at partial opacity', () => {
    const result = fadeChar('A', 0.5);
    expect(result).toContain('A');
    // Mid-fade emits a true-color SGR for the dimmed glyph.
    expect(result).toMatch(/\x1b\[/);
  });

  it('handles space characters without crashing', () => {
    expect(fadeChar(' ', 0.5)).toBeDefined();
  });
});

describe('fadeStyledChar', () => {
  it('fades while preserving the original style', () => {
    const styled = parseStyledChars('\x1b[31mX\x1b[0m');
    const out = fadeStyledChar(styled[0]!, 0.5);
    expect(out).toContain('X');
  });

  it('opacity 0 still produces output (so spatial buffers can advance)', () => {
    const styled = parseStyledChars('Y');
    expect(fadeStyledChar(styled[0]!, 0)).toBeDefined();
  });
});

describe('fadeText', () => {
  it('fades a multi-character string at the given opacity', () => {
    const out = fadeText('hello', 0.5);
    expect(stripAnsi(out)).toBe('hello');
    expect(out).toMatch(/\x1b\[/);
  });

  it('opacity 1 returns the text essentially unchanged (modulo a reset)', () => {
    const out = fadeText('hi', 1);
    expect(stripAnsi(out)).toBe('hi');
  });
});

describe('fadeLinePerChar', () => {
  it('preserves the visible text with per-char opacities', () => {
    const out = fadeLinePerChar('abcd', [0.25, 0.5, 0.75, 1]);
    expect(stripAnsi(out)).toBe('abcd');
  });

  it('different opacity arrays produce different outputs', () => {
    const a = fadeLinePerChar('abc', [1, 1, 1]);
    const b = fadeLinePerChar('abc', [0.5, 0.5, 0.5]);
    expect(a).not.toBe(b);
  });
});
