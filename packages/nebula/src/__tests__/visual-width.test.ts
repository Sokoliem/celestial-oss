import { describe, expect, it } from 'vitest';
import { layout, measure, type TextNode } from '../vdom.js';
import { sliceByWidth, visualWidth, wrapLine } from '../vdom/visual-width.js';

/** Helper: extract a row of characters from a CellGrid as a trimmed string */
function gridRow(grid: ReturnType<typeof layout>, row: number): string {
  if (row >= grid.height) return '';
  return grid.cells[row]!.map((c) => c.char).join('');
}

/** Helper: extract a row of characters without trailing spaces */
function gridRowTrimmed(grid: ReturnType<typeof layout>, row: number): string {
  return gridRow(grid, row).trimEnd();
}

describe('visualWidth – Unicode width correctness', () => {
  describe('CJK characters (double-width)', () => {
    it('should measure CJK characters as 2 cells each', () => {
      // '你好' = 2 CJK chars, should occupy 4 terminal cells
      const node: TextNode = { kind: 'text', content: '你好' };
      const m = measure(node);
      expect(m.width).toBe(4);
    });

    it('should measure mixed ASCII + CJK correctly', () => {
      // 'Hi你好' = 2 ASCII (2 cells) + 2 CJK (4 cells) = 6 cells
      const node: TextNode = { kind: 'text', content: 'Hi你好' };
      const m = measure(node);
      expect(m.width).toBe(6);
    });

    it('should measure fullwidth punctuation as double-width', () => {
      // '！' (U+FF01) is a fullwidth exclamation mark, should be 2 cells
      const node: TextNode = { kind: 'text', content: '！' };
      const m = measure(node);
      expect(m.width).toBe(2);
    });

    it('should measure CJK Unified Ideographs Extension B correctly', () => {
      // U+20000 (surrogate pair in JS) - should be 2 cells
      const node: TextNode = { kind: 'text', content: '\u{20000}' };
      const m = measure(node);
      expect(m.width).toBe(2);
    });

    it('should measure Katakana as double-width', () => {
      // 'カタカナ' = 4 katakana chars, each 2 cells = 8 cells
      const node: TextNode = { kind: 'text', content: 'カタカナ' };
      const m = measure(node);
      expect(m.width).toBe(8);
    });
  });

  describe('combining marks (zero-width)', () => {
    it('should measure combining accent as zero-width', () => {
      // 'e' + combining acute accent (U+0301) = 1 visible cell
      const node: TextNode = { kind: 'text', content: 'e\u0301' };
      const m = measure(node);
      expect(m.width).toBe(1);
    });

    it('should measure multiple combining marks as zero-width', () => {
      // 'a' + combining tilde (U+0303) + combining acute (U+0301) = 1 cell
      const node: TextNode = { kind: 'text', content: 'a\u0303\u0301' };
      const m = measure(node);
      expect(m.width).toBe(1);
    });

    it('should measure combining marks in longer strings correctly', () => {
      // 'café' where é is e + U+0301 = 4 visible cells
      const node: TextNode = { kind: 'text', content: 'cafe\u0301' };
      const m = measure(node);
      expect(m.width).toBe(4);
    });
  });

  describe('emoji (double-width)', () => {
    it('should measure simple emoji as 2 cells', () => {
      const node: TextNode = { kind: 'text', content: '😀' };
      const m = measure(node);
      expect(m.width).toBe(2);
    });

    it('should measure multiple emoji correctly', () => {
      // 3 emoji * 2 cells each = 6 cells
      const node: TextNode = { kind: 'text', content: '😀🎉🚀' };
      const m = measure(node);
      expect(m.width).toBe(6);
    });

    it('should measure emoji with variation selector as 2 cells', () => {
      // '❤' (U+2764) + VS16 (U+FE0F) - emoji presentation = 2 cells
      const node: TextNode = { kind: 'text', content: '\u2764\uFE0F' };
      const m = measure(node);
      expect(m.width).toBe(2);
    });

    it('keeps flags and joined emoji as single display units', () => {
      const flag = '🇺🇸';
      const family = '👨‍👩‍👧‍👦';

      expect(visualWidth(flag)).toBe(2);
      expect(visualWidth(family)).toBe(2);
      expect(sliceByWidth(`${family}Z`, 2)).toEqual([family, 'Z']);

      const grid = layout({ kind: 'text', content: `${flag}A` }, 3, 1);
      expect(grid.cells[0]?.[0]?.char).toBe(flag);
      expect(grid.cells[0]?.[2]?.char).toBe('A');
    });
  });

  describe('zero-width joiners and special characters', () => {
    it('should measure zero-width space as 0 cells', () => {
      // U+200B zero-width space
      const node: TextNode = { kind: 'text', content: 'a\u200Bb' };
      const m = measure(node);
      expect(m.width).toBe(2);
    });

    it('should measure variation selectors as zero-width', () => {
      // VS15 (U+FE0E) text presentation selector = 0 cells
      const node: TextNode = { kind: 'text', content: 'a\uFE0Eb' };
      const m = measure(node);
      expect(m.width).toBe(2);
    });

    it('should measure soft hyphen as zero-width', () => {
      // U+00AD soft hyphen
      const node: TextNode = { kind: 'text', content: 'a\u00ADb' };
      const m = measure(node);
      expect(m.width).toBe(2);
    });
  });

  describe('mixed content', () => {
    it('should measure mixed ASCII + CJK + emoji correctly', () => {
      // 'A' (1) + '你' (2) + '😀' (2) = 5 cells
      const node: TextNode = { kind: 'text', content: 'A你😀' };
      const m = measure(node);
      expect(m.width).toBe(5);
    });

    it('should measure complex mixed string correctly', () => {
      // 'Hello' (5) + '世界' (4) + '!' (1) = 10 cells
      const node: TextNode = { kind: 'text', content: 'Hello世界!' };
      const m = measure(node);
      expect(m.width).toBe(10);
    });
  });

  describe('ANSI codes with CJK/emoji', () => {
    it('should strip ANSI codes and measure CJK width correctly', () => {
      // ANSI red + '你好' + ANSI reset = 4 cells (ANSI is zero-width)
      const node: TextNode = { kind: 'text', content: '\x1b[31m你好\x1b[0m' };
      const m = measure(node);
      expect(m.width).toBe(4);
    });

    it('should strip ANSI codes and measure emoji width correctly', () => {
      // ANSI bold + '😀' + reset = 2 cells
      const node: TextNode = { kind: 'text', content: '\x1b[1m😀\x1b[0m' };
      const m = measure(node);
      expect(m.width).toBe(2);
    });
  });

  describe('control characters', () => {
    it('should measure tab and other C0 control characters as zero-width', () => {
      // Control chars like BEL, NUL should be zero-width
      const node: TextNode = { kind: 'text', content: 'ab\x07c' };
      const m = measure(node);
      expect(m.width).toBe(3);
    });
  });

  describe('text wrapping with CJK', () => {
    it('should wrap CJK text at correct column boundary', () => {
      // '你好世界' = 8 cells. With width=5, first two CJK chars (4 cells) fit,
      // third would overflow at cell 6, so wrap after '你好'
      const node: TextNode = { kind: 'text', content: '你好世界', wrap: true };
      const grid = layout(node, 5, 5);
      // Line 1 should contain '你好' (4 cells) + 1 space padding
      // Line 2 should contain '世界' (4 cells) + 1 space padding
      const line1 = gridRowTrimmed(grid, 0);
      const line2 = gridRowTrimmed(grid, 1);
      // The actual chars should be present
      expect(line1).toContain('你');
      expect(line1).toContain('好');
      expect(line2).toContain('世');
      expect(line2).toContain('界');
    });

    it('splits a long word even when it follows regular prose', () => {
      const lines = wrapLine('go abcdefghij', 4);

      expect(lines.every((line) => visualWidth(line) <= 4)).toBe(true);
      expect(lines.join('').replaceAll(' ', '')).toBe('goabcdefghij');
      expect(lines.at(-1)).toBe('ij');
    });

    it('never splits combining or joined grapheme clusters across lines', () => {
      const family = '👨‍👩‍👧‍👦';
      const combined = 'e\u0301';
      const lines = wrapLine(`${family}${combined}${family}`, 2);

      expect(lines).toEqual([family, combined, family]);
    });
  });
});
