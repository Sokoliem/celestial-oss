import { describe, expect, it } from 'vitest';
import { color } from '../color.js';
import { style } from '../style.js';

describe('style', () => {
  describe('creation', () => {
    it('should create an empty style', () => {
      const s = style({});
      expect(s.render('hello')).toBe('hello');
    });

    it('should apply foreground color', () => {
      const s = style({ color: color.red });
      const result = s.render('hello');
      expect(result).toContain('\x1b[31m');
      expect(result).toContain('hello');
      expect(result).toContain('\x1b[39m'); // reset fg
    });

    it('should apply background color', () => {
      const s = style({ background: color.blue });
      const result = s.render('hello');
      expect(result).toContain('\x1b[44m');
      expect(result).toContain('\x1b[49m'); // reset bg
    });

    it('should apply bold', () => {
      const s = style({ bold: true });
      const result = s.render('hello');
      expect(result).toContain('\x1b[1m');
      expect(result).toContain('\x1b[22m'); // reset bold
    });

    it('should apply italic', () => {
      const s = style({ italic: true });
      const result = s.render('hello');
      expect(result).toContain('\x1b[3m');
      expect(result).toContain('\x1b[23m');
    });

    it('should apply underline', () => {
      const s = style({ underline: true });
      const result = s.render('hello');
      expect(result).toContain('\x1b[4m');
      expect(result).toContain('\x1b[24m');
    });

    it('should apply dim', () => {
      const s = style({ dim: true });
      const result = s.render('hello');
      expect(result).toContain('\x1b[2m');
      expect(result).toContain('\x1b[22m');
    });

    it('should apply strikethrough', () => {
      const s = style({ strikethrough: true });
      const result = s.render('hello');
      expect(result).toContain('\x1b[9m');
      expect(result).toContain('\x1b[29m');
    });

    it('should combine multiple decorations', () => {
      const s = style({ color: color.red, bold: true, underline: true });
      const result = s.render('hello');
      expect(result).toContain('\x1b[31m');
      expect(result).toContain('\x1b[1m');
      expect(result).toContain('\x1b[4m');
      expect(result).toContain('hello');
    });
  });

  describe('padding', () => {
    it('should apply horizontal padding', () => {
      const s = style({ padding: [0, 2] });
      const result = s.render('hi');
      expect(result).toBe('  hi  ');
    });

    it('should apply all-sides padding with single number', () => {
      const s = style({ padding: 1 });
      const lines = s.render('hi').split('\n');
      expect(lines.length).toBe(3); // top + content + bottom
      expect(lines[1]).toBe(' hi ');
    });

    it('should compute correct emptyLine width for multi-line content', () => {
      // Regression 1.5: emptyLine used visualWidth(result) where result contained
      // newlines, making the empty padding lines too wide.
      const s = style({ padding: [1, 0, 1, 0] }); // top=1, right=0, bottom=1, left=0
      const lines = s.render('ab\ncd').split('\n');
      // Should be: empty(2), "ab", "cd", empty(2) — all lines same width
      expect(lines.length).toBe(4);
      expect(lines[0]).toBe('  '); // empty line should be 2 wide (max line width)
      expect(lines[1]).toBe('ab');
      expect(lines[2]).toBe('cd');
      expect(lines[3]).toBe('  '); // empty line should be 2 wide
    });

    it('should apply 4-value padding [top, right, bottom, left]', () => {
      const s = style({ padding: [0, 3, 0, 1] });
      const result = s.render('x');
      expect(result).toBe(' x   ');
    });
  });

  describe('width', () => {
    it('should pad to fixed width', () => {
      const s = style({ width: 10 });
      const result = s.render('hi');
      expect(s.measureWidth(result)).toBe(10);
    });

    it('should truncate to fixed width', () => {
      const s = style({ width: 5 });
      const result = s.render('hello world');
      expect(s.measureWidth(result)).toBe(5);
    });

    it('should center-align text', () => {
      const s = style({ width: 10, align: 'center' });
      const result = s.render('hi');
      // 'hi' is 2 chars, 10 - 2 = 8, 4 left + 4 right
      expect(result).toBe('    hi    ');
    });

    it('should right-align text', () => {
      const s = style({ width: 10, align: 'right' });
      const result = s.render('hi');
      expect(result).toBe('        hi');
    });
  });

  describe('width with CJK characters', () => {
    it('should truncate CJK text correctly by visual width', () => {
      // Regression 1.2: truncate guard used stripped.length instead of visualWidth(),
      // so CJK text of width 8 was not truncated when maxWidth=5.
      const s = style({ width: 5 });
      const result = s.render('\u4f60\u597d\u4e16\u754c'); // "你好世界" — visual width 8
      expect(s.measureWidth(result)).toBeLessThanOrEqual(5);
    });

    it('should pad CJK text correctly by visual width', () => {
      // Regression 1.2: width check used stripped.length instead of visualWidth(),
      // causing CJK text to be padded as if it were only 2 cols wide when it is 4.
      const s = style({ width: 10 });
      const result = s.render('\u4f60\u597d'); // "你好" — visual width 4
      // Should be padded to total visual width of 10: 4 CJK + 6 spaces
      expect(s.measureWidth(result)).toBe(10);
    });

    it('should detect CJK text exceeds fixed width and truncate', () => {
      // Regression 1.2: stripped.length > width missed CJK text being wider than its char count
      const s = style({ width: 3 });
      const result = s.render('\u4f60\u597d'); // "你好" — visual width 4, char count 2
      expect(s.measureWidth(result)).toBeLessThanOrEqual(3);
    });

    it('does not cut through a joined emoji grapheme', () => {
      const family = '👨‍👩‍👧‍👦';
      const s = style({ width: 3 });
      const result = s.render(`${family}AB`);

      expect(result).toContain(family);
      expect(result).toContain('A');
      expect(result).not.toContain('B');
      expect(s.measureWidth(result)).toBe(3);
    });
  });

  describe('truncate closes unclosed SGR sequences', () => {
    it('should append reset when truncation cuts styled text with open SGR codes', () => {
      // C2 regression: truncating pre-styled text like '\x1b[1m\x1b[31mlong text'
      // left SGR codes unclosed, dirtying the terminal state.
      const s = style({ width: 4 });
      const input = '\x1b[1m\x1b[31mlong text\x1b[0m';
      const result = s.render(input);
      // The truncated output must end with a reset sequence
      expect(result).toMatch(/\x1b\[0m$/);
    });

    it('should not append reset when no SGR codes are present', () => {
      const s = style({ width: 3 });
      const input = 'abcdef'; // plain text, no ANSI
      const result = s.render(input);
      expect(result).not.toContain('\x1b[0m');
    });
  });

  describe('truncate with non-SGR escape sequences', () => {
    it('should not consume visible characters after a CSI cursor-movement sequence', () => {
      // C1 regression: inEscape only reset on 'm', so \x1b[A (cursor up, ends with 'A')
      // left inEscape=true, silently consuming all subsequent visible chars.
      const s = style({ width: 5 });
      const input = '\x1b[Ahello world';
      const result = s.render(input);
      const stripped = result.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
      expect(stripped).toBe('hello');
    });

    it('should not consume visible characters after an OSC sequence', () => {
      // C1 regression: OSC \x1b]8;;url\x07 contains \x07 terminator which never reset inEscape.
      const s = style({ width: 5 });
      const input = '\x1b]8;;https://x.com\x07hello world\x1b]8;;\x07';
      const result = s.render(input);
      // After stripping all ANSI, should see exactly 5 visible chars
      const stripped = result.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
      expect(stripped).toBe('hello');
    });

    it('should not consume visible characters after a clear-screen CSI sequence', () => {
      // C1 regression: \x1b[2J ends with 'J' not 'm', leaving inEscape stuck.
      const s = style({ width: 3 });
      const input = '\x1b[2Jabcdef';
      const result = s.render(input);
      const stripped = result.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
      expect(stripped).toBe('abc');
    });
  });

  describe('composition', () => {
    it('should merge styles', () => {
      const base = style({ color: color.red, bold: true });
      const extended = base.merge({ color: color.blue });
      const result = extended.render('hello');
      expect(result).toContain('\x1b[34m'); // blue, not red
      expect(result).toContain('\x1b[1m'); // still bold
    });

    it('should unset properties', () => {
      const s = style({ bold: true, italic: true });
      const without = s.unset('bold');
      const result = without.render('hello');
      expect(result).not.toContain('\x1b[1m'); // no bold
      expect(result).toContain('\x1b[3m'); // still italic
    });
  });

  describe('margin prop is supported', () => {
    it('should apply margin (outer spacing) around rendered text', () => {
      // margin adds blank space outside the rendered block
      const s = style({ margin: [0, 1] });
      const result = s.render('hi');
      expect(result).toBe(' hi ');
    });
  });

  describe('measureWidth', () => {
    it('should measure plain text width', () => {
      const s = style({});
      expect(s.measureWidth('hello')).toBe(5);
    });

    it('should measure width ignoring ANSI codes', () => {
      const s = style({ color: color.red, bold: true });
      const rendered = s.render('hello');
      expect(s.measureWidth(rendered)).toBe(5);
    });

    it('should measure width ignoring OSC hyperlink escapes', () => {
      const s = style({});
      const linked = '\x1b]8;;https://example.com\x07docs\x1b]8;;\x07';
      expect(s.measureWidth(linked)).toBe(4);
    });

    it('should handle empty string', () => {
      const s = style({});
      expect(s.measureWidth('')).toBe(0);
    });
  });
});
