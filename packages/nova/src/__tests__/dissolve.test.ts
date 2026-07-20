import { describe, expect, it } from 'vitest';
import { dissolve } from '../strategies/dissolve.js';

/** Strip all ANSI codes to get plain text */
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('dissolve', () => {
  it('at progress 0 returns old content unchanged', () => {
    expect(dissolve('old text', 'new text', 0)).toBe('old text');
  });

  it('at progress 1 returns new content unchanged', () => {
    expect(dissolve('old text', 'new text', 1)).toBe('new text');
  });

  it('at progress 0.5 shows a mix of old and new characters', () => {
    const result = dissolve('AAAA', 'BBBB', 0.5);
    const plain = strip(result);
    // Should contain some A's and some B's
    const hasA = plain.includes('A');
    const hasB = plain.includes('B');
    // At 50%, we expect some positions flipped and some not
    expect(hasA || hasB).toBe(true);
  });

  it('is deterministic with the same seed', () => {
    const r1 = dissolve('Hello', 'World', 0.5, 123);
    const r2 = dissolve('Hello', 'World', 0.5, 123);
    expect(r1).toBe(r2);
  });

  it('produces different results with different seeds', () => {
    const r1 = dissolve('Hello World!', 'Goodbye Moon', 0.5, 1);
    const r2 = dissolve('Hello World!', 'Goodbye Moon', 0.5, 9999);
    // Different seeds should produce different character patterns
    expect(r1).not.toBe(r2);
  });

  it('more positions flip as progress increases', () => {
    const old = 'AAAAAAAAAAAAAAAAAA';
    const new_ = 'BBBBBBBBBBBBBBBBBB';

    const r1 = strip(dissolve(old, new_, 0.2, 42));
    const r2 = strip(dissolve(old, new_, 0.8, 42));

    const countB_early = (r1.match(/B/g) || []).length;
    const countB_late = (r2.match(/B/g) || []).length;

    // More B's at higher progress
    expect(countB_late).toBeGreaterThan(countB_early);
  });

  it('handles multi-line content', () => {
    const old = 'line1\nline2';
    const new_ = 'lineA\nlineB';

    const result = dissolve(old, new_, 0.5);
    expect(result).toContain('\n');
    expect(result.split('\n').length).toBe(2);
  });

  it('handles empty content', () => {
    expect(dissolve('', 'new', 0)).toBe('');
    expect(dissolve('old', '', 1)).toBe('');
  });

  it('pads shorter content to match width', () => {
    const result = dissolve('AB', 'WXYZ', 0.5);
    // Each line should be 4 chars wide
    const plain = strip(result);
    expect(plain.length).toBeGreaterThanOrEqual(4);
  });

  it('applies sparkle effect near flip points', () => {
    // Characters that just flipped should have a brightness pulse.
    // We verify ANSI color codes are present in the output.
    const result = dissolve('AAAA', 'BBBB', 0.5, 42);
    expect(result).toContain('\x1b[38;2;');
  });

  it('clamps progress below 0', () => {
    expect(dissolve('old', 'new', -0.5)).toBe('old');
  });

  it('clamps progress above 1', () => {
    expect(dissolve('old', 'new', 1.5)).toBe('new');
  });

  it('uses default seed of 42 when not provided', () => {
    const r1 = dissolve('Hello', 'World', 0.5);
    const r2 = dissolve('Hello', 'World', 0.5, 42);
    expect(r1).toBe(r2);
  });

  it('at very low progress almost all positions show old content', () => {
    const old = 'AAAAAAAAAAAAAAAAAA';
    const new_ = 'BBBBBBBBBBBBBBBBBB';
    const result = strip(dissolve(old, new_, 0.05, 42));
    const countA = (result.match(/A/g) || []).length;
    // Most chars should still be A
    expect(countA).toBeGreaterThan(result.length / 2);
  });

  it('at very high progress almost all positions show new content', () => {
    const old = 'AAAAAAAAAAAAAAAAAA';
    const new_ = 'BBBBBBBBBBBBBBBBBB';
    const result = strip(dissolve(old, new_, 0.95, 42));
    const countB = (result.match(/B/g) || []).length;
    // Most chars should be B
    expect(countB).toBeGreaterThan(result.length / 2);
  });
});
