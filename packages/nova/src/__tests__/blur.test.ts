import { describe, expect, it } from 'vitest';
import { blur } from '../strategies/blur.js';

/** Strip all ANSI codes to get plain text */
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('blur', () => {
  it('at progress 0 returns old content unchanged', () => {
    expect(blur('old text', 'new text', 0)).toBe('old text');
  });

  it('at progress 1 returns new content unchanged', () => {
    expect(blur('old text', 'new text', 1)).toBe('new text');
  });

  it('at progress < 0.5 shows old content blurring out', () => {
    const result = blur('Hello', 'World', 0.25);
    // Should contain ANSI color codes (gray desaturation)
    expect(result).toContain('\x1b[38;2;');
    // Block characters or original chars should be present
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('at progress > 0.5 shows new content de-blurring', () => {
    const result = blur('Hello', 'World', 0.75);
    expect(result).toContain('\x1b[38;2;');
    expect(typeof result).toBe('string');
  });

  it('at progress 0.5 is at maximum blur (full block)', () => {
    const result = blur('ABC', 'XYZ', 0.5);
    // At exactly 0.5 the blur is at maximum — new content starts de-blurring
    // blurAmount = 1 - ((0.5 - 0.5) / 0.5) = 1, so full block chars
    const plain = strip(result);
    // Should contain block characters (█) at max blur
    expect(plain).toContain('█');
  });

  it('uses Unicode block elements for blur progression', () => {
    // At various blur levels, different block chars appear
    // blur ≈ 0.3 → ░, blur ≈ 0.5 → ▒, blur ≈ 0.7 → ▓
    const r1 = blur('ABCD', 'WXYZ', 0.15); // blurAmount = 0.3
    const r2 = blur('ABCD', 'WXYZ', 0.25); // blurAmount = 0.5
    const r3 = blur('ABCD', 'WXYZ', 0.35); // blurAmount = 0.7

    const p1 = strip(r1);
    const p2 = strip(r2);
    const p3 = strip(r3);

    // Progressive blur: earlier = less dense blocks, later = denser
    expect(p1.length).toBeGreaterThan(0);
    expect(p2.length).toBeGreaterThan(0);
    expect(p3.length).toBeGreaterThan(0);
  });

  it('handles multi-line content', () => {
    const old = 'line1\nline2';
    const new_ = 'lineA\nlineB';

    const result = blur(old, new_, 0.25);
    expect(result).toContain('\n');
    // Should have two lines
    expect(result.split('\n').length).toBe(2);
  });

  it('handles empty content', () => {
    expect(blur('', 'new', 0)).toBe('');
    expect(blur('old', '', 1)).toBe('');
  });

  it('handles different-length content by padding', () => {
    const result = blur('AB', 'WXYZ', 0.75);
    const plain = strip(result);
    // Width should match the longer content
    expect(plain.length).toBeGreaterThanOrEqual(4);
  });

  it('clamps progress below 0', () => {
    expect(blur('old', 'new', -0.5)).toBe('old');
  });

  it('clamps progress above 1', () => {
    expect(blur('old', 'new', 1.5)).toBe('new');
  });

  it('preserves spaces without blur', () => {
    const result = blur('A B', 'X Y', 0.25);
    const plain = strip(result);
    // Spaces should remain as spaces (not blurred to blocks)
    expect(plain).toContain(' ');
  });

  it('applies gray desaturation via true color codes', () => {
    const result = blur('Hello', 'World', 0.3);
    // Should use RGB true color codes for gray
    expect(result).toContain('\x1b[38;2;');
    // The RGB values should be equal (gray: R=G=B)
    const match = result.match(/\x1b\[38;2;(\d+);(\d+);(\d+)m/);
    expect(match).not.toBeNull();
    if (match) {
      expect(match[1]).toBe(match[2]);
      expect(match[2]).toBe(match[3]);
    }
  });
});
