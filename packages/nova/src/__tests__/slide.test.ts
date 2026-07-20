import { describe, expect, it } from 'vitest';
import { slide } from '../strategies/slide.js';

describe('slide', () => {
  describe('horizontal (left)', () => {
    it('at progress 0 shows old content', () => {
      const result = slide('AAAA', 'BBBB', 0, 'left');
      expect(result).toBe('AAAA');
    });

    it('at progress 1 shows new content', () => {
      const result = slide('AAAA', 'BBBB', 1, 'left');
      expect(result).toBe('BBBB');
    });

    it('at progress 0.5 shows mix of old and new', () => {
      const result = slide('AAAA', 'BBBB', 0.5, 'left');
      // Half old shifted left, half new entering from right
      expect(result).toContain('A');
      expect(result).toContain('B');
      expect(result.length).toBe(4);
    });

    it('handles multi-line content', () => {
      const old = 'AAAA\nCCCC';
      const new_ = 'BBBB\nDDDD';
      const result = slide(old, new_, 0, 'left');
      const lines = result.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe('AAAA');
      expect(lines[1]).toBe('CCCC');
    });
  });

  describe('horizontal (right)', () => {
    it('at progress 0 shows old content', () => {
      const result = slide('AAAA', 'BBBB', 0, 'right');
      expect(result).toBe('AAAA');
    });

    it('at progress 1 shows new content', () => {
      const result = slide('AAAA', 'BBBB', 1, 'right');
      expect(result).toBe('BBBB');
    });

    it('at progress 0.5 shows mix of old and new', () => {
      const result = slide('AAAA', 'BBBB', 0.5, 'right');
      expect(result).toContain('A');
      expect(result).toContain('B');
      expect(result.length).toBe(4);
    });
  });

  describe('vertical (up)', () => {
    it('at progress 0 shows old content', () => {
      const old = 'line1\nline2\nline3';
      const new_ = 'newA\nnewB\nnewC';
      const result = slide(old, new_, 0, 'up');
      expect(result).toBe(old);
    });

    it('at progress 1 shows new content', () => {
      const old = 'line1\nline2\nline3';
      const new_ = 'newA\nnewB\nnewC';
      const result = slide(old, new_, 1, 'up');
      expect(result).toBe(new_);
    });

    it('at progress 0.5 shows bottom half of old and top of new', () => {
      const old = 'old1\nold2\nold3\nold4';
      const new_ = 'new1\nnew2\nnew3\nnew4';
      const result = slide(old, new_, 0.5, 'up');
      const lines = result.split('\n');
      // Should show some old lines shifted up and some new lines entering from bottom
      expect(lines).toHaveLength(4);
      // Middle of transition: old lines are shifting up, new lines enter from bottom
      expect(result).toContain('old');
      expect(result).toContain('new');
    });
  });

  describe('vertical (down)', () => {
    it('at progress 0 shows old content', () => {
      const old = 'line1\nline2\nline3';
      const new_ = 'newA\nnewB\nnewC';
      const result = slide(old, new_, 0, 'down');
      expect(result).toBe(old);
    });

    it('at progress 1 shows new content', () => {
      const old = 'line1\nline2\nline3';
      const new_ = 'newA\nnewB\nnewC';
      const result = slide(old, new_, 1, 'down');
      expect(result).toBe(new_);
    });

    it('at progress 0.5 shows top of old and new entering from top', () => {
      const old = 'old1\nold2\nold3\nold4';
      const new_ = 'new1\nnew2\nnew3\nnew4';
      const result = slide(old, new_, 0.5, 'down');
      const lines = result.split('\n');
      expect(lines).toHaveLength(4);
      expect(result).toContain('old');
      expect(result).toContain('new');
    });
  });

  describe('edge cases', () => {
    it('handles different length contents by padding shorter', () => {
      const old = 'AB';
      const new_ = 'WXYZ';
      // At progress 0.5, the slide is mid-transition and padded to max visual width
      const result = slide(old, new_, 0.5, 'left');
      // Visual width should match the max of old/new visual widths
      const visualLen = result.replace(/\x1b\[[0-9;]*m/g, '').length;
      expect(visualLen).toBe(4);
    });

    it('handles empty old content', () => {
      const result = slide('', 'BBBB', 1, 'left');
      expect(result).toBe('BBBB');
    });

    it('handles empty new content', () => {
      const result = slide('AAAA', '', 0, 'left');
      expect(result).toBe('AAAA');
    });

    it('handles different line counts vertically', () => {
      const old = 'a\nb';
      const new_ = 'x\ny\nz';
      // At progress 0.5, the slide is mid-transition and padded to max height
      const result = slide(old, new_, 0.5, 'up');
      const lines = result.split('\n');
      // Should pad to max line count (3)
      expect(lines).toHaveLength(3);
    });

    it('does not cut through ANSI escape codes', () => {
      const old = '\x1b[38;2;255;100;50mHello\x1b[0m';
      const new_ = '\x1b[38;2;50;100;255mWorld\x1b[0m';
      // Mid-transition: should never produce raw ";2;255" visible text
      const result = slide(old, new_, 0.5, 'left');
      // Strip ANSI to get visible chars — should contain no raw escape fragments
      const visible = result.replace(/\x1b\[[0-9;]*m/g, '');
      expect(visible).not.toMatch(/;[0-9]/);
      expect(visible.length).toBe(5); // visual width matches max(5,5)
    });
  });
});
