import { describe, expect, it } from 'vitest';
import { wipe } from '../strategies/wipe.js';

/** Strip all ANSI codes to get plain text */
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('wipe', () => {
  describe('vertical (down)', () => {
    it('at progress 0 shows all old', () => {
      const old = 'old1\nold2\nold3\nold4';
      const new_ = 'new1\nnew2\nnew3\nnew4';
      const result = wipe(old, new_, 0, 'down');
      expect(result).toBe(old);
    });

    it('at progress 1 shows all new', () => {
      const old = 'old1\nold2\nold3\nold4';
      const new_ = 'new1\nnew2\nnew3\nnew4';
      const result = wipe(old, new_, 1, 'down');
      expect(result).toBe(new_);
    });

    it('at progress 0.5 shows mix of new and old with feathering', () => {
      const old = 'old1\nold2\nold3\nold4';
      const new_ = 'new1\nnew2\nnew3\nnew4';
      const result = wipe(old, new_, 0.5, 'down');
      const lines = result.split('\n');
      expect(lines).toHaveLength(4);
      // Top lines should contain new content, bottom old (with feathered edge)
      expect(strip(lines[0]!)).toContain('new1');
      expect(strip(lines[3]!)).toContain('old4');
    });
  });

  describe('vertical (up)', () => {
    it('at progress 0 shows all old', () => {
      const old = 'old1\nold2\nold3\nold4';
      const new_ = 'new1\nnew2\nnew3\nnew4';
      const result = wipe(old, new_, 0, 'up');
      expect(result).toBe(old);
    });

    it('at progress 1 shows all new', () => {
      const old = 'old1\nold2\nold3\nold4';
      const new_ = 'new1\nnew2\nnew3\nnew4';
      const result = wipe(old, new_, 1, 'up');
      expect(result).toBe(new_);
    });

    it('at progress 0.5 shows bottom new and top old with feathering', () => {
      const old = 'old1\nold2\nold3\nold4';
      const new_ = 'new1\nnew2\nnew3\nnew4';
      const result = wipe(old, new_, 0.5, 'up');
      const lines = result.split('\n');
      expect(lines).toHaveLength(4);
      // Up wipe: new enters from bottom
      expect(strip(lines[0]!)).toContain('old1');
      expect(strip(lines[3]!)).toContain('new4');
    });
  });

  describe('horizontal (right)', () => {
    it('at progress 0 shows all old', () => {
      const result = wipe('AAAA', 'BBBB', 0, 'right');
      expect(result).toBe('AAAA');
    });

    it('at progress 1 shows all new', () => {
      const result = wipe('AAAA', 'BBBB', 1, 'right');
      expect(result).toBe('BBBB');
    });

    it('at progress 0.5 shows blend of new and old', () => {
      const result = wipe('AAAA', 'BBBB', 0.5, 'right');
      const plain = strip(result);
      // Should contain both characters due to feathered edge
      expect(plain).toContain('B');
      expect(plain).toContain('A');
    });
  });

  describe('horizontal (left)', () => {
    it('at progress 0 shows all old', () => {
      const result = wipe('AAAA', 'BBBB', 0, 'left');
      expect(result).toBe('AAAA');
    });

    it('at progress 1 shows all new', () => {
      const result = wipe('AAAA', 'BBBB', 1, 'left');
      expect(result).toBe('BBBB');
    });

    it('at progress 0.5 shows blend with feathered edge', () => {
      const result = wipe('AAAA', 'BBBB', 0.5, 'left');
      const plain = strip(result);
      expect(plain).toContain('A');
      expect(plain).toContain('B');
    });
  });

  describe('horizontal (left) character correctness regression', () => {
    it('left wipe should use oldCh/newCh consistently with boundary calc', () => {
      // Regression: wipeHorizontal for direction='left' indexes characters
      // via `newPadded[col]` (the raw loop counter) but computes the wipe
      // boundary using `effectiveCol` (width-1-col). This mismatch means
      // the boundary at one position controls the visibility of a character
      // from a different position.
      //
      // The fix: use `newCh`/`oldCh` (already indexed via effectiveCol)
      // in all branches, so boundary and character are consistent.
      //
      // With identical chars (AAAA->BBBB), this bug is invisible. We use
      // distinct chars to expose the mismatch.
      const old = 'abcd';
      const new_ = 'WXYZ';

      // At progress=0.99 with width=4: wipeCol=3.96
      // col=3: effectiveCol=0, dist=3.96, >FEATHER_WIDTH(3) -> fully revealed
      // Buggy code: fadeChar(newPadded[col]=Z, 1)
      // Fixed code: fadeChar(newCh=W, 1)
      //
      // After the fix, output[3] should show newPadded[effectiveCol=0]='W'
      // because the wipe is sweeping effectiveCol 0->3 and at col=3 the
      // wipe is at effectiveCol=0 (first to be fully revealed).
      const result = wipe(old, new_, 0.99, 'left');
      const plain = strip(result);
      // With the fix, the fully revealed position (col=3) should show 'W'
      // (the character at effectiveCol=0 in the new content)
      expect(plain[3]).toBe('W');
    });
  });

  describe('edge cases', () => {
    it('handles unequal line counts', () => {
      const old = 'old1\nold2';
      const new_ = 'new1\nnew2\nnew3';
      const result = wipe(old, new_, 1, 'down');
      expect(result).toBe(new_);
    });

    it('handles single line content with vertical wipe', () => {
      const result = wipe('old', 'new', 1, 'down');
      expect(result).toBe('new');
    });

    it('contains true color codes during feathered transition', () => {
      const result = wipe('AAAA', 'BBBB', 0.5, 'right');
      // Feathered edge uses true color
      expect(result).toContain('\x1b[38;2;');
    });
  });
});
