import { describe, expect, it } from 'vitest';
import { joinH, joinV, place, table, wrap } from '../layout.js';

describe('layout', () => {
  describe('joinH', () => {
    it('should join two single-line texts horizontally', () => {
      expect(joinH('hello', 'world')).toBe('helloworld');
    });

    it('should join with gap', () => {
      expect(joinH('hello', 'world', 2)).toBe('hello  world');
    });

    it('should handle multi-line left and right', () => {
      const result = joinH('a\nb', 'c\nd');
      const lines = result.split('\n');
      expect(lines[0]).toBe('ac');
      expect(lines[1]).toBe('bd');
    });

    it('should pad shorter side with spaces', () => {
      const result = joinH('a\nb\nc', 'x');
      const lines = result.split('\n');
      expect(lines.length).toBe(3);
      expect(lines[0]).toBe('ax');
      expect(lines[1]).toBe('b ');
      expect(lines[2]).toBe('c ');
    });

    it('should handle different width lines on left', () => {
      const result = joinH('hi\nthere', '!');
      const lines = result.split('\n');
      // 'there' is 5 chars, 'hi' pads to 5
      expect(lines[0]).toBe('hi   !');
      expect(lines[1]).toBe('there ');
    });

    it('should ignore OSC hyperlink escapes when padding', () => {
      const link = '\x1b]8;;https://example.com\x07docs\x1b]8;;\x07';
      expect(joinH(link, '!')).toBe(`${link}!`);
    });

    it('should not produce trailing whitespace-only lines when input has trailing empty lines', () => {
      // C5 regression: joinH pads trailing empty rows on the short side with
      // full-width spaces. When the left side has trailing empty lines and the
      // right side is shorter, the trailing rows become purely whitespace.
      // e.g. joinH('a\n\n', 'x') without fix: ['ax', '  ', '  ']
      const result = joinH('a\n\n', 'x');
      const lines = result.split('\n');
      // Trailing lines should be trimmed away
      const lastLine = lines[lines.length - 1]!;
      expect(lastLine.trim().length).toBeGreaterThan(0);
    });

    it('should trim trailing whitespace-only lines from both sides having trailing empties', () => {
      // C5 regression: joinH('a\nb', 'x\ny\nz\n\n') produces trailing whitespace lines
      // because both sides have empty content in the last rows
      const result = joinH('a\nb', 'x\ny\nz\n\n');
      const lines = result.split('\n');
      const lastLine = lines[lines.length - 1]!;
      expect(lastLine.trim().length).toBeGreaterThan(0);
    });
  });

  describe('joinV', () => {
    it('should join vertically', () => {
      expect(joinV('top', 'bottom')).toBe('top\nbottom');
    });

    it('should join with gap', () => {
      const result = joinV('top', 'bottom', 2);
      const lines = result.split('\n');
      expect(lines.length).toBe(4);
      expect(lines[0]).toBe('top');
      expect(lines[1]).toBe('');
      expect(lines[2]).toBe('');
      expect(lines[3]).toBe('bottom');
    });
  });

  describe('place', () => {
    it('should place content with left-top alignment (default)', () => {
      const result = place('hi', 6, 3);
      const lines = result.split('\n');
      expect(lines[0]).toBe('hi    ');
      expect(lines[1]).toBe('      ');
      expect(lines[2]).toBe('      ');
    });

    it('should center horizontally', () => {
      const result = place('hi', 6, 1, 'center');
      expect(result).toBe('  hi  ');
    });

    it('should right-align', () => {
      const result = place('hi', 6, 1, 'right');
      expect(result).toBe('    hi');
    });

    it('should center vertically', () => {
      const result = place('hi', 6, 3, 'left', 'middle');
      const lines = result.split('\n');
      expect(lines[0]).toBe('      ');
      expect(lines[1]).toBe('hi    ');
      expect(lines[2]).toBe('      ');
    });

    it('should bottom-align vertically', () => {
      const result = place('hi', 6, 3, 'left', 'bottom');
      const lines = result.split('\n');
      expect(lines[0]).toBe('      ');
      expect(lines[1]).toBe('      ');
      expect(lines[2]).toBe('hi    ');
    });
  });

  describe('table', () => {
    it('should render a simple table', () => {
      const result = table([
        ['Name', 'Age'],
        ['Alice', '30'],
        ['Bob', '25'],
      ]);
      const lines = result.split('\n');
      expect(lines[0]).toBe('Name   Age');
      expect(lines[1]).toBe('Alice  30 ');
      expect(lines[2]).toBe('Bob    25 ');
    });

    it('should handle empty rows', () => {
      expect(table([])).toBe('');
    });

    it('should use custom column widths', () => {
      const result = table([['a', 'b']], [10, 5]);
      expect(result).toBe('a           b    ');
    });
  });

  describe('wrap', () => {
    it('should wrap long text', () => {
      const result = wrap('hello world foo bar', 11);
      const lines = result.split('\n');
      expect(lines[0]).toBe('hello world');
      expect(lines[1]).toBe('foo bar');
    });

    it('should not wrap short text', () => {
      expect(wrap('hello', 20)).toBe('hello');
    });

    it('should preserve existing newlines', () => {
      const result = wrap('line1\nline2', 20);
      expect(result).toBe('line1\nline2');
    });

    it('should break words longer than maxWidth into chunks', () => {
      // Regression: wrap() left words longer than maxWidth on a single line,
      // producing output wider than the requested maxWidth.
      const result = wrap('abcdefghijklmno', 5);
      const lines = result.split('\n');
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(5);
      }
      // Should produce 3 lines: "abcde", "fghij", "klmno"
      expect(lines).toEqual(['abcde', 'fghij', 'klmno']);
    });

    it('should preserve ANSI styles when breaking overlong words', () => {
      // Regression 1.8: wrap() stripped ANSI from overlong words, discarding styling.
      const styled = '\x1b[31mabcdefghij\x1b[0m'; // red "abcdefghij" — visual width 10
      const result = wrap(styled, 5);
      const lines = result.split('\n');
      // Each chunk should preserve the ANSI codes, not be plain text
      for (const line of lines) {
        expect(line).toContain('\x1b[');
      }
      // The visible text across all lines should reconstruct the original
      const allVisible = lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, '')).join('');
      expect(allVisible).toBe('abcdefghij');
    });

    it('should break a long word within a sentence', () => {
      const result = wrap('say supercalifragilistic ok', 10);
      const lines = result.split('\n');
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(10);
      }
      expect(lines[0]).toBe('say');
      // The long word should be broken into chunks
      expect(lines[1]).toBe('supercalif');
      expect(lines[2]).toBe('ragilistic');
      expect(lines[3]).toBe('ok');
    });

    it('should not consume visible characters after non-SGR CSI in overlong word break', () => {
      // C1 regression: wrap()'s word-break loop set inEscape on \x1b and only
      // reset on 'm'. CSI \x1b[A (cursor up) ends with 'A', leaving inEscape stuck.
      const input = '\x1b[Aabcdefghij'; // CSI cursor up + 10 visible chars
      const result = wrap(input, 5);
      const lines = result.split('\n');
      // Strip all CSI sequences to count visible chars
      const allVisible = lines.map((l) => l.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')).join('');
      expect(allVisible).toBe('abcdefghij');
    });

    it('should not consume visible characters after OSC sequence in overlong word break', () => {
      // C1 regression: OSC \x1b]8;;url\x07 never reset inEscape (needs \x07, not 'm')
      const input = '\x1b]8;;https://x.com\x07abcdefghij\x1b]8;;\x07';
      const result = wrap(input, 5);
      const lines = result.split('\n');
      const allVisible = lines
        .map((l) => l.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, ''))
        .map((l) => l.replace(/\x1b\[[0-9;]*[A-Za-z]/g, ''))
        .join('');
      expect(allVisible).toBe('abcdefghij');
    });
  });
});
