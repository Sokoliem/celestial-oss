import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../renderer/index.js';
import { stripAnsi } from '../renderer/ansi.js';
import { visualWidth } from '../renderer/width.js';
import { wrapText } from '../renderer/wrap.js';

describe('wrapText boundaries', () => {
  it('hard-wraps long unbroken words without dropping the final character', () => {
    const wrapped = wrapText('abcdefghijk', 5, '');
    expect(wrapped).toBe('abcde\nfghij\nk');
    expect(wrapped.replaceAll('\n', '')).toBe('abcdefghijk');
  });

  it('splits only at grapheme boundaries', () => {
    const source = '👨‍👩‍👧‍👦e\u0301界x';
    const wrapped = wrapText(source, 2, '');
    const lines = wrapped.split('\n');

    expect(lines.join('')).toBe(source);
    expect(lines.every((line) => visualWidth(line) <= 2)).toBe(true);
    expect(lines).toEqual(['👨‍👩‍👧‍👦', 'e\u0301', '界', 'x']);
  });

  it('preserves style and hyperlink state across hard wraps', () => {
    const openLink = '\x1b]8;;https://example.test\x07';
    const closeLink = '\x1b]8;;\x07';
    const wrapped = wrapText(`${openLink}\x1b[1mabcdefgh\x1b[0m${closeLink}`, 3, '');
    const lines = wrapped.split('\n');

    expect(lines.map(stripAnsi).join('')).toBe('abcdefgh');
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line).toContain(openLink);
      expect(line).toContain(closeLink);
      expect(visualWidth(line)).toBeLessThanOrEqual(3);
    }
  });

  it('does not revive a style after a selective reset', () => {
    const wrapped = wrapText('\x1b[1mabc\x1b[22mdefghi', 3, '');
    const lines = wrapped.split('\n');

    expect(lines.map(stripAnsi).join('')).toBe('abcdefghi');
    expect(lines.at(-1)).not.toContain('\x1b[1m');
  });

  it('uses the original no-wrap behavior for invalid direct widths', () => {
    expect(wrapText('content', Number.NaN, '> ')).toBe('> content');
    expect(wrapText('content', 0, '> ')).toBe('> content');
  });
});

describe('render context dimensions', () => {
  it('normalizes non-finite width and indent options', () => {
    expect(() => renderMarkdown('safe output', { width: Number.NaN, indent: Number.POSITIVE_INFINITY })).not.toThrow();
    expect(stripAnsi(renderMarkdown('safe output', { width: Number.NaN, indent: Number.POSITIVE_INFINITY }))).toContain('safe output');
  });

  it('clamps negative dimensions instead of calling String.repeat with them', () => {
    expect(() => renderMarkdown('safe', { width: -20, indent: -5 })).not.toThrow();
  });
});
