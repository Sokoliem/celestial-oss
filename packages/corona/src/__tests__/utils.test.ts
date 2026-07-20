import { describe, expect, it } from 'vitest';
import { stripAnsi, visualWidth } from '../utils.js';

describe('stripAnsi (shared utility)', () => {
  it('should strip SGR color codes', () => {
    expect(stripAnsi('\x1b[31mhello\x1b[0m')).toBe('hello');
  });

  it('should strip combined SGR codes', () => {
    expect(stripAnsi('\x1b[1;31;44mtext\x1b[0m')).toBe('text');
  });

  it('should strip OSC hyperlink sequences (BEL terminated)', () => {
    const linked = '\x1b]8;;https://example.com\x07click here\x1b]8;;\x07';
    expect(stripAnsi(linked)).toBe('click here');
  });

  it('should strip OSC hyperlink sequences (ST terminated)', () => {
    const linked = '\x1b]8;;https://example.com\x1b\\click here\x1b]8;;\x1b\\';
    expect(stripAnsi(linked)).toBe('click here');
  });

  it('should strip both SGR and OSC from the same string', () => {
    const mixed = '\x1b[34m\x1b]8;;https://x.com\x07link\x1b]8;;\x07\x1b[0m';
    expect(stripAnsi(mixed)).toBe('link');
  });

  it('should return plain text unchanged', () => {
    expect(stripAnsi('plain text')).toBe('plain text');
  });

  it('should handle empty string', () => {
    expect(stripAnsi('')).toBe('');
  });

  it('should strip non-SGR CSI sequences like cursor movement and clear', () => {
    // C3 regression: regex only matched CSI ending in 'm', missing \x1b[2J, \x1b[A, \x1b[H
    expect(stripAnsi('\x1b[2Jhello')).toBe('hello');
    expect(stripAnsi('\x1b[Aup')).toBe('up');
    expect(stripAnsi('\x1b[Hstart')).toBe('start');
    expect(stripAnsi('before\x1b[10;20Hafter')).toBe('beforeafter');
  });

  it('should strip non-8 OSC sequences like terminal title', () => {
    // C3 regression: regex only matched OSC-8, missing \x1b]0;title\x07
    expect(stripAnsi('\x1b]0;My Title\x07visible')).toBe('visible');
    expect(stripAnsi('\x1b]2;Window Title\x07text')).toBe('text');
  });

  it('should strip non-8 OSC sequences terminated by ST', () => {
    expect(stripAnsi('\x1b]0;My Title\x1b\\visible')).toBe('visible');
  });
});

describe('visualWidth (shared utility)', () => {
  it('should return length of plain text', () => {
    expect(visualWidth('hello')).toBe(5);
  });

  it('should ignore SGR codes in width calculation', () => {
    expect(visualWidth('\x1b[31mhello\x1b[0m')).toBe(5);
  });

  it('should ignore OSC hyperlinks in width calculation', () => {
    const linked = '\x1b]8;;https://example.com\x07docs\x1b]8;;\x07';
    expect(visualWidth(linked)).toBe(4);
  });

  it('should handle empty string', () => {
    expect(visualWidth('')).toBe(0);
  });

  it('measures flags and joined emoji as grapheme clusters', () => {
    expect(visualWidth('🇺🇸')).toBe(2);
    expect(visualWidth('👨‍👩‍👧‍👦')).toBe(2);
    expect(visualWidth('e\u0301')).toBe(1);
  });
});
