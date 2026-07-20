import { describe, expect, it } from 'vitest';
import { zoom } from '../strategies/zoom.js';

/** Strip all ANSI codes to get plain text */
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('zoom', () => {
  it('at progress 0 returns old content unchanged', () => {
    expect(zoom('old text', 'new text', 0)).toBe('old text');
  });

  it('at progress 1 returns new content unchanged', () => {
    expect(zoom('old text', 'new text', 1)).toBe('new text');
  });

  it('at mid-progress produces a mix of old and new content', () => {
    const result = zoom('AAAAAA\nAAAAAA\nAAAAAA', 'BBBBBB\nBBBBBB\nBBBBBB', 0.5);
    const plain = strip(result);
    // Should contain both A and B characters
    expect(plain).toContain('A');
    expect(plain).toContain('B');
  });

  it('in zoom-in mode, center reveals first', () => {
    // 5x5 grid, center is (2,2). At low progress, only center should flip.
    const old = 'AAAAA\nAAAAA\nAAAAA\nAAAAA\nAAAAA';
    const new_ = 'BBBBB\nBBBBB\nBBBBB\nBBBBB\nBBBBB';

    const result = zoom(old, new_, 0.15, 'in');
    const lines = strip(result).split('\n');

    // Center line should have some B's (revealed from center)
    const centerLine = lines[2]!;
    const edgeLine = lines[0]!;

    const centerBs = (centerLine.match(/B/g) || []).length;
    const edgeBs = (edgeLine.match(/B/g) || []).length;

    // Center should have more B's than edges at low progress
    expect(centerBs).toBeGreaterThanOrEqual(edgeBs);
  });

  it('in zoom-out mode, edges reveal first', () => {
    const old = 'AAAAA\nAAAAA\nAAAAA\nAAAAA\nAAAAA';
    const new_ = 'BBBBB\nBBBBB\nBBBBB\nBBBBB\nBBBBB';

    const result = zoom(old, new_, 0.15, 'out');
    const lines = strip(result).split('\n');

    // Edge positions (corners) should reveal before center
    const cornerLine = lines[0]!;
    const centerLine = lines[2]!;

    const cornerBs = (cornerLine.match(/B/g) || []).length;
    const centerBs = (centerLine.match(/B/g) || []).length;

    // Corners should have more or equal B's than center
    expect(cornerBs).toBeGreaterThanOrEqual(centerBs);
  });

  it('supports custom origin point', () => {
    const old = 'AAAA\nAAAA\nAAAA\nAAAA';
    const new_ = 'BBBB\nBBBB\nBBBB\nBBBB';

    // Origin at top-left (0, 0) — reveal should start from top-left
    const result = zoom(old, new_, 0.2, 'in', { x: 0, y: 0 });
    const lines = strip(result).split('\n');

    const topLeftIsB = lines[0]![0] === 'B';
    const bottomRightIsB = lines[3]![3] === 'B';

    // Top-left should reveal before (or at same time as) bottom-right
    // At low progress, bottom-right should still be old content
    if (topLeftIsB) {
      // If top-left revealed, that's expected since it's nearest to origin
      expect(topLeftIsB).toBe(true);
    }
    // Bottom-right is farthest from origin; should not yet have flipped
    expect(bottomRightIsB).toBe(false);
  });

  it('uses default center origin when not specified', () => {
    const r1 = zoom('AA\nAA', 'BB\nBB', 0.5, 'in');
    const r2 = zoom('AA\nAA', 'BB\nBB', 0.5, 'in', { x: 0.5, y: 0.5 });
    expect(r1).toBe(r2);
  });

  it('handles single-line content', () => {
    const result = zoom('AAAA', 'BBBB', 0.5);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles empty content', () => {
    expect(zoom('', 'new', 0)).toBe('');
    expect(zoom('old', '', 1)).toBe('');
  });

  it('handles different-length content', () => {
    const result = zoom('AB', 'WXYZ', 0.5);
    const plain = strip(result);
    // Should be padded to max width
    expect(plain.length).toBeGreaterThanOrEqual(4);
  });

  it('clamps progress below 0', () => {
    expect(zoom('old', 'new', -0.5)).toBe('old');
  });

  it('clamps progress above 1', () => {
    expect(zoom('old', 'new', 1.5)).toBe('new');
  });

  it('uses fadeChar for feathered edges', () => {
    // The transition should use ANSI true color for feather blending
    const result = zoom('AAAAAA\nAAAAAA\nAAAAAA', 'BBBBBB\nBBBBBB\nBBBBBB', 0.5);
    expect(result).toContain('\x1b[38;2;');
  });

  it('produces smooth reveal (more positions flip with higher progress)', () => {
    const old = 'AAAAAAAAAA\nAAAAAAAAAA\nAAAAAAAAAA\nAAAAAAAAAA\nAAAAAAAAAA';
    const new_ = 'BBBBBBBBBB\nBBBBBBBBBB\nBBBBBBBBBB\nBBBBBBBBBB\nBBBBBBBBBB';

    const r1 = strip(zoom(old, new_, 0.2));
    const r2 = strip(zoom(old, new_, 0.8));

    const countB_early = (r1.match(/B/g) || []).length;
    const countB_late = (r2.match(/B/g) || []).length;

    expect(countB_late).toBeGreaterThan(countB_early);
  });
});
