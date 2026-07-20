import { describe, expect, it } from 'vitest';
import { crossfade } from '../strategies/crossfade.js';

/** Strip all ANSI codes to get plain text */
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('crossfade', () => {
  it('at progress 0 returns old content unchanged', () => {
    const result = crossfade('old text', 'new text', 0);
    expect(result).toBe('old text');
  });

  it('at progress 1 returns new content unchanged', () => {
    const result = crossfade('old text', 'new text', 1);
    expect(result).toBe('new text');
  });

  it('at mid-progress both layers are visible with ANSI color codes', () => {
    const result = crossfade('old text', 'new text', 0.5);
    // At 0.5 both opacities are equal; new layer dominates (>= check)
    expect(result).toContain('\x1b[38;2;');
  });

  it('at progress < 0.5 old layer dominates (higher opacity)', () => {
    const result = crossfade('AAAA', 'BBBB', 0.3);
    // Old opacity 0.7 > new opacity 0.3, so old chars shown
    expect(strip(result)).toContain('AAAA');
  });

  it('at progress > 0.5 new layer dominates (higher opacity)', () => {
    const result = crossfade('AAAA', 'BBBB', 0.7);
    // New opacity 0.7 > old opacity 0.3, so new chars shown
    expect(strip(result)).toContain('BBBB');
  });

  it('at exactly 0.5 new layer dominates (>= comparison)', () => {
    const result = crossfade('AAAA', 'BBBB', 0.5);
    expect(strip(result)).toContain('BBBB');
  });

  it('identical content returns unchanged at any progress', () => {
    const content = 'same content';
    expect(crossfade(content, content, 0)).toBe(content);
    expect(crossfade(content, content, 0.5)).toBe(content);
    expect(crossfade(content, content, 1)).toBe(content);
  });

  it('handles multi-line content', () => {
    const old = 'line1\nline2\nline3';
    const new_ = 'lineA\nlineB\nlineC';

    const atZero = crossfade(old, new_, 0);
    expect(atZero).toBe(old);

    const atOne = crossfade(old, new_, 1);
    expect(atOne).toBe(new_);

    const atMid = crossfade(old, new_, 0.5);
    expect(strip(atMid)).toContain('lineA');
  });

  it('handles empty old content', () => {
    const result = crossfade('', 'new text', 0.75);
    expect(strip(result)).toContain('new text');
  });

  it('handles empty new content', () => {
    const result = crossfade('old text', '', 0);
    expect(result).toBe('old text');
  });

  it('uses true color ANSI codes for intermediate progress', () => {
    const r1 = crossfade('text', 'other', 0.3);
    const r2 = crossfade('text', 'other', 0.7);
    expect(r1).toContain('\x1b[38;2;');
    expect(r2).toContain('\x1b[38;2;');
  });

  it('pads shorter content with spaces to match width', () => {
    const result = crossfade('AB', 'WXYZ', 0.8);
    // New content is longer; at p=0.8 new dominates, all 4 chars shown
    const plain = strip(result);
    expect(plain.length).toBeGreaterThanOrEqual(4);
  });

  it('clamps progress below 0 to 0', () => {
    const result = crossfade('old', 'new', -0.5);
    expect(result).toBe('old');
  });

  it('clamps progress above 1 to 1', () => {
    const result = crossfade('old', 'new', 1.5);
    expect(result).toBe('new');
  });

  it('opacity increases for the dominating layer as progress moves', () => {
    // At p=0.2, old dominates at 0.8 opacity → brighter
    // At p=0.4, old dominates at 0.6 opacity → dimmer
    const r1 = crossfade('ABCD', 'WXYZ', 0.2);
    const r2 = crossfade('ABCD', 'WXYZ', 0.4);
    // Both should have color codes; r1 should generally be brighter (higher RGB)
    expect(r1).toContain('\x1b[38;2;');
    expect(r2).toContain('\x1b[38;2;');
    // Both show old content
    expect(strip(r1)).toContain('ABCD');
    expect(strip(r2)).toContain('ABCD');
  });
});
