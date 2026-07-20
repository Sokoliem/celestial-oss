import { color } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { gradient } from '../gradient.js';

/** Strip ANSI escape codes to get visible text */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('gradient', () => {
  describe('horizontal (default)', () => {
    it('should produce per-char ANSI codes for a 2-color gradient', () => {
      const result = gradient('Hello', { from: color.rgb(255, 0, 0), to: color.rgb(0, 0, 255) });

      // Each visible char should get its own ANSI fg code
      // At minimum, should contain multiple \x1b[38;2; sequences
      const matches = result.match(/\x1b\[38;2;\d+;\d+;\d+m/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(5); // one per char in "Hello"
    });

    it('should preserve visible text content', () => {
      const text = 'Hello World';
      const result = gradient(text, { from: color.rgb(255, 0, 0), to: color.rgb(0, 0, 255) });
      expect(stripAnsi(result)).toBe(text);
    });

    it('should handle single character', () => {
      const result = gradient('A', { from: color.rgb(255, 0, 0), to: color.rgb(0, 0, 255) });
      expect(stripAnsi(result)).toBe('A');

      // Single char should have one color code (the from color)
      const matches = result.match(/\x1b\[38;2;\d+;\d+;\d+m/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(1);
    });

    it('should return empty string for empty input', () => {
      const result = gradient('', { from: color.rgb(255, 0, 0), to: color.rgb(0, 0, 255) });
      expect(result).toBe('');
    });

    it('should handle text with existing ANSI codes', () => {
      const text = `${color.red.fg()}Hello${color.reset.fg()}`;
      const result = gradient(text, { from: color.rgb(255, 0, 0), to: color.rgb(0, 0, 255) });

      // Visible text should still be "Hello"
      expect(stripAnsi(result)).toBe('Hello');
    });
  });

  describe('vertical', () => {
    it('should color each line with a single color', () => {
      const text = 'Line1\nLine2\nLine3';
      const result = gradient(text, {
        from: color.rgb(255, 0, 0),
        to: color.rgb(0, 0, 255),
        direction: 'vertical',
      });

      const lines = result.split('\n');
      expect(lines.length).toBe(3);

      // Each line should have visible content preserved
      expect(stripAnsi(lines[0]!)).toBe('Line1');
      expect(stripAnsi(lines[1]!)).toBe('Line2');
      expect(stripAnsi(lines[2]!)).toBe('Line3');
    });

    it('should handle single line as from color', () => {
      const result = gradient('OnlyLine', {
        from: color.rgb(255, 0, 0),
        to: color.rgb(0, 0, 255),
        direction: 'vertical',
      });
      expect(stripAnsi(result)).toBe('OnlyLine');
    });
  });

  describe('diagonal', () => {
    it('should produce per-char ANSI codes based on position', () => {
      const text = 'AB\nCD';
      const result = gradient(text, {
        from: color.rgb(255, 0, 0),
        to: color.rgb(0, 0, 255),
        direction: 'diagonal',
      });

      expect(stripAnsi(result)).toBe('AB\nCD');

      // Should have ANSI codes
      const matches = result.match(/\x1b\[38;2;\d+;\d+;\d+m/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(4); // A, B, C, D
    });
  });

  describe('multi-stop', () => {
    it('should accept colors array for multi-stop gradient', () => {
      const result = gradient('Hello!', {
        colors: [color.rgb(255, 0, 0), color.rgb(0, 255, 0), color.rgb(0, 0, 255)],
      });

      expect(stripAnsi(result)).toBe('Hello!');

      const matches = result.match(/\x1b\[38;2;\d+;\d+;\d+m/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(6);
    });

    it('should use from/to when colors is not provided', () => {
      const result1 = gradient('AB', { from: color.rgb(255, 0, 0), to: color.rgb(0, 0, 255) });
      const result2 = gradient('AB', { colors: [color.rgb(255, 0, 0), color.rgb(0, 0, 255)] });

      // Both should produce the same result
      expect(result1).toBe(result2);
    });
  });
});
