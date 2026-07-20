import { describe, expect, it } from 'vitest';
import { border } from '../border.js';
import { color } from '../color.js';
import { visualWidth } from '../utils.js';

describe('border', () => {
  describe('character sets', () => {
    it('should have rounded border chars', () => {
      expect(border.rounded.chars.topLeft).toBe('╭');
      expect(border.rounded.chars.topRight).toBe('╮');
      expect(border.rounded.chars.bottomLeft).toBe('╰');
      expect(border.rounded.chars.bottomRight).toBe('╯');
    });

    it('should have square border chars', () => {
      expect(border.square.chars.topLeft).toBe('┌');
      expect(border.square.chars.bottomRight).toBe('┘');
    });

    it('should have double border chars', () => {
      expect(border.double.chars.topLeft).toBe('╔');
      expect(border.double.chars.top).toBe('═');
    });

    it('should have thick border chars', () => {
      expect(border.thick.chars.topLeft).toBe('┏');
      expect(border.thick.chars.top).toBe('━');
    });

    it('should have hidden border (spaces)', () => {
      expect(border.hidden.chars.topLeft).toBe(' ');
      expect(border.hidden.chars.top).toBe(' ');
    });

    it('should create custom borders', () => {
      const custom = border.custom({
        topLeft: '+',
        top: '-',
        topRight: '+',
        left: '|',
        right: '|',
        bottomLeft: '+',
        bottom: '-',
        bottomRight: '+',
      });
      expect(custom.chars.topLeft).toBe('+');
    });
  });

  describe('rendering', () => {
    it('should render single-line content in a box', () => {
      const result = border.render('hello', border.square);
      const lines = result.split('\n');
      expect(lines[0]).toBe('┌─────┐');
      expect(lines[1]).toBe('│hello│');
      expect(lines[2]).toBe('└─────┘');
    });

    it('should render multi-line content', () => {
      const result = border.render('hi\nthere', border.rounded);
      const lines = result.split('\n');
      expect(lines.length).toBe(4);
      expect(lines[0]).toBe('╭─────╮');
      expect(lines[1]).toBe('│hi   │');
      expect(lines[2]).toBe('│there│');
      expect(lines[3]).toBe('╰─────╯');
    });

    it('should render with fixed width', () => {
      const result = border.render('hi', border.square, 10);
      const lines = result.split('\n');
      expect(lines[0]).toBe('┌──────────┐');
      expect(lines[1]).toBe('│hi        │');
    });

    it('should handle empty content', () => {
      const result = border.render('', border.square);
      const lines = result.split('\n');
      expect(lines.length).toBe(3);
    });

    it('should correctly measure width of CJK characters in border box', () => {
      // Regression 1.1: border.render used stripped.length instead of visualWidth(),
      // causing CJK characters (width 2 each) to produce too-narrow borders.
      const cjk = '\u4f60\u597d'; // "你好" — 2 CJK chars, each width 2 → visual width 4
      const result = border.render(cjk, border.square);
      const lines = result.split('\n');
      // Top border should span 4 columns (not 2)
      expect(lines[0]).toBe('┌────┐');
      expect(lines[1]).toBe('│\u4f60\u597d│');
      expect(lines[2]).toBe('└────┘');
    });

    it('should correctly pad CJK and ASCII mixed multi-line content', () => {
      // Regression 1.1: the per-line padding also used stripped.length
      const result = border.render('hi\n\u4f60\u597d', border.square);
      const lines = result.split('\n');
      // "你好" is visual width 4, "hi" is visual width 2 → contentWidth = 4
      expect(lines[0]).toBe('┌────┐');
      expect(lines[1]).toBe('│hi  │'); // "hi" padded to 4 columns
      expect(lines[2]).toBe('│\u4f60\u597d│');
      expect(lines[3]).toBe('└────┘');
    });

    it('should correctly measure width of content with OSC hyperlinks', () => {
      // Regression: border.ts stripAnsi only stripped SGR codes, not OSC hyperlinks.
      // This caused incorrect width calculation for hyperlinked text.
      const linked = '\x1b]8;;https://example.com\x07docs\x1b]8;;\x07';
      const result = border.render(linked, border.square);
      const lines = result.split('\n');
      // "docs" is 4 visual chars, so top border should be 4 dashes + corners
      expect(lines[0]).toBe('┌────┐');
      // Content line preserves OSC escapes (they're invisible in the terminal)
      expect(lines[1]).toContain('docs');
      expect(lines[1]!.startsWith('│')).toBe(true);
      expect(lines[1]!.endsWith('│')).toBe(true);
      expect(lines[2]).toBe('└────┘');
    });

    it('should truncate content when explicit width is smaller than content visual width', () => {
      // C4 regression: when width < content visual width, content silently overflowed the border.
      const result = border.render('hello world', border.square, 5);
      const lines = result.split('\n');
      // Border should be exactly 5 wide (plus corners)
      expect(lines[0]).toBe('┌─────┐');
      // Content line should be truncated to 5 visible chars inside the border
      const contentLine = lines[1]!;
      expect(contentLine.startsWith('│')).toBe(true);
      expect(contentLine.endsWith('│')).toBe(true);
      // Strip border chars to get inner content
      const inner = contentLine.slice(1, -1);
      // Inner should be exactly 5 visual chars (possibly with trailing padding)

      expect(visualWidth(inner)).toBe(5);
      expect(lines[2]).toBe('└─────┘');
    });

    it('should truncate multi-line content when explicit width is smaller', () => {
      // C4 regression: multi-line content also overflowed
      const result = border.render('longline\nshort', border.square, 4);
      const lines = result.split('\n');
      expect(lines[0]).toBe('┌────┐');
      // Each content line should fit within 4 visual chars
      for (let i = 1; i < lines.length - 1; i++) {
        const inner = lines[i]!.slice(1, -1);

        expect(visualWidth(inner)).toBe(4);
      }
      expect(lines[lines.length - 1]).toBe('└────┘');
    });

    it('should apply borderColor to border chars but not content', () => {
      const red = color.rgb(255, 0, 0);
      const result = border.render('hi', border.square, undefined, red);
      // Border chars should be wrapped in fg escape + fg-reset
      const fgEsc = red.fg();
      expect(result).toContain(fgEsc);
      // Content 'hi' should appear without the fg escape immediately before it
      // The content itself should not be colored
      const lines = result.split('\n');
      const middleLine = lines[1]!;
      // The content part between the (colored) borders should contain 'hi' plain
      expect(middleLine).toContain('hi');
      // The border characters should be colored
      expect(lines[0]).toContain(fgEsc);
    });

    it('render with borderColor should produce same structural output as without', () => {
      // Strip all ANSI codes from both outputs — they should be identical
      const plain = border.render('hello', border.square);
      const colored = border.render('hello', border.square, undefined, color.rgb(0, 200, 100));
      // Remove all ANSI escape sequences for comparison
      const strip = (s: string) => s.replace(/\x1b\[[^m]*m/g, '');
      expect(strip(colored)).toBe(strip(plain));
    });
  });

  describe('titled', () => {
    it('should render a box with title in top edge (left-aligned by default)', () => {
      const result = border.titled('content', border.rounded, 20, 'My Panel');
      const lines = result.split('\n');
      expect(lines[0]).toContain('My Panel');
      // Top edge starts with corner
      expect(lines[0]!.startsWith('╭')).toBe(true);
      expect(lines[0]!.endsWith('╮')).toBe(true);
    });

    it('should render content lines between top and bottom edges', () => {
      const result = border.titled('hello\nworld', border.square, 15, 'Title');
      const lines = result.split('\n');
      // top + 2 content + bottom = 4 lines
      expect(lines).toHaveLength(4);
      expect(lines[1]).toContain('hello');
      expect(lines[2]).toContain('world');
    });

    it('should render subtitle in bottom edge', () => {
      const result = border.titled('body', border.rounded, 20, 'Title', { subtitle: 'footer' });
      const lines = result.split('\n');
      const bottomLine = lines[lines.length - 1]!;
      expect(bottomLine).toContain('footer');
    });

    it('should support center title alignment', () => {
      const result = border.titled('x', border.square, 20, 'Hi', { titleAlign: 'center' });
      const lines = result.split('\n');
      const top = lines[0]!;
      // Title should be roughly centered — there should be dashes on both sides
      const titleIdx = top.indexOf('Hi');
      expect(titleIdx).toBeGreaterThan(1);
      expect(top.length - titleIdx - 'Hi'.length).toBeGreaterThan(1);
    });

    it('should support right title alignment', () => {
      const result = border.titled('x', border.square, 20, 'Hi', { titleAlign: 'right' });
      const lines = result.split('\n');
      const top = lines[0]!;
      // Title should be near the right — most dashes on the left
      const titleIdx = top.indexOf('Hi');
      const dashes = top.length - titleIdx - 'Hi'.length;
      // With right alignment there should be minimal dashes after the title
      expect(dashes).toBeLessThanOrEqual(3); // space + corner + space = 3 chars
    });

    it('should apply borderColor to border chars', () => {
      const blue = color.rgb(0, 100, 255);
      const result = border.titled('body', border.rounded, 20, 'T', { borderColor: blue });
      expect(result).toContain(blue.fg());
    });

    it('should apply titleColor to title text', () => {
      const green = color.rgb(0, 200, 0);
      const result = border.titled('body', border.rounded, 20, 'MyTitle', { titleColor: green });
      expect(result).toContain(green.fg());
      // Title text should appear in output
      expect(result).toContain('MyTitle');
    });

    it('should apply subtitleColor to subtitle text', () => {
      const yellow = color.rgb(255, 200, 0);
      const result = border.titled('body', border.square, 20, 'T', {
        subtitle: 'Sub',
        subtitleColor: yellow,
      });
      expect(result).toContain(yellow.fg());
      expect(result).toContain('Sub');
    });

    it('should truncate title when it exceeds available width', () => {
      // width=10, title="A very long title that exceeds" → should be truncated
      const result = border.titled('content', border.square, 10, 'A very long title that exceeds');
      const lines = result.split('\n');
      // Strip ANSI for measurement
      const strip = (s: string) => s.replace(/\x1b\[[^m]*m/g, '');
      const topPlain = strip(lines[0]!);
      // Total visible width of top edge = width + 2 (corners)
      expect(visualWidth(topPlain)).toBe(12);
    });

    it('plain-text titled output width matches requested width', () => {
      const width = 30;
      const result = border.titled('line', border.square, width, 'Section');
      const strip = (s: string) => s.replace(/\x1b\[[^m]*m/g, '');
      const lines = result.split('\n');
      // Every line (including top/bottom) should be width + 2 wide
      for (const line of lines) {
        expect(visualWidth(strip(line))).toBe(width + 2);
      }
    });
  });
});
