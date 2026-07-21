import { describe, expect, it } from 'vitest';
import { cellWidth, sanitizeHyperlink, sanitizeSgr, sanitizeTerminalText, sliceCells, stripAnsi, tokenizeTerminalText, wrapCells } from '../index.js';

describe('canonical terminal text', () => {
  it('measures emoji presentation and joined clusters as cells', () => {
    expect(cellWidth('❤️')).toBe(2);
    expect(cellWidth('☀️')).toBe(2);
    expect(cellWidth('👨‍👩‍👧‍👦')).toBe(2);
    expect(cellWidth('🇺🇸')).toBe(2);
    expect(cellWidth('e\u0301')).toBe(1);
  });

  it('recognizes modern CSI plus string-control families', () => {
    const value = '\x1b[4:3munder\x1b[0m\x1bPpayload\x1b\\\x1b]0;title\x07';
    expect(tokenizeTerminalText(value).map((token) => token.kind)).toEqual(['sgr', 'text', 'sgr', 'control', 'control']);
    expect(stripAnsi(value)).toBe('under');
  });

  it('renders destructive controls inert while retaining safe styling', () => {
    expect(sanitizeTerminalText('\x1b[31mred\x1b[0m\x1b[2J')).toBe('\x1b[31mred\x1b[0m␛[2J');
    expect(sanitizeSgr('\x1b[38:2::1:2:3m')).toBe('\x1b[38:2::1:2:3m');
    expect(sanitizeSgr('\x1b[2J')).toBe('');
  });

  it('allows only validated hyperlinks', () => {
    expect(sanitizeHyperlink('https://example.com/a')).toBe('https://example.com/a');
    expect(sanitizeHyperlink('javascript:alert(1)')).toBeUndefined();
    expect(sanitizeHyperlink('https://example.com/\x1b]8;;bad')).toBeUndefined();
  });

  it('slices and wraps without losing graphemes or whitespace', () => {
    expect(sliceCells('A❤️B', 3)).toEqual(['A❤️', 'B']);
    const input = '  alpha   beta  ';
    const lines = wrapCells(input, 7);
    expect(lines.every((line) => cellWidth(line) <= 7)).toBe(true);
    expect(lines.join('')).toBe(input);
  });

  it('replays ANSI state on wrapped lines', () => {
    const lines = wrapCells('\x1b[31mabcdef\x1b[0m', 3, { preserveWords: false });
    expect(lines).toHaveLength(2);
    expect(stripAnsi(lines[0]!)).toBe('abc');
    expect(stripAnsi(lines[1]!)).toBe('def');
    expect(lines[1]!.startsWith('\x1b[31m')).toBe(true);
  });
});
