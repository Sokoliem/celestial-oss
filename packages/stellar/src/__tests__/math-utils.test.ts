import { describe, expect, it } from 'vitest';
import { safeMax, safeMin, safeMinMax } from '../math-utils.js';

// ── safeMin ──────────────────────────────────────────────────────────────

describe('safeMin', () => {
  it('returns Infinity for empty array', () => {
    expect(safeMin([])).toBe(Infinity);
  });

  it('returns the single element for [x]', () => {
    expect(safeMin([42])).toBe(42);
  });

  it('finds minimum in mixed positive/negative values', () => {
    expect(safeMin([3, -1, 7, 0, -5, 2])).toBe(-5);
  });

  it('handles all-same values', () => {
    expect(safeMin([8, 8, 8, 8])).toBe(8);
  });

  it('handles large arrays (100K elements) without throwing', () => {
    const large = Array.from({ length: 100_000 }, (_, i) => i);
    expect(() => safeMin(large)).not.toThrow();
    expect(safeMin(large)).toBe(0);
  });
});

// ── safeMax ──────────────────────────────────────────────────────────────

describe('safeMax', () => {
  it('returns -Infinity for empty array', () => {
    expect(safeMax([])).toBe(-Infinity);
  });

  it('returns the single element for [x]', () => {
    expect(safeMax([42])).toBe(42);
  });

  it('finds maximum in mixed positive/negative values', () => {
    expect(safeMax([3, -1, 7, 0, -5, 2])).toBe(7);
  });

  it('handles all-same values', () => {
    expect(safeMax([8, 8, 8, 8])).toBe(8);
  });

  it('handles large arrays (100K elements) without throwing', () => {
    const large = Array.from({ length: 100_000 }, (_, i) => i);
    expect(() => safeMax(large)).not.toThrow();
    expect(safeMax(large)).toBe(99_999);
  });
});

// ── safeMinMax ───────────────────────────────────────────────────────────

describe('safeMinMax', () => {
  it('returns [Infinity, -Infinity] for empty array', () => {
    expect(safeMinMax([])).toEqual([Infinity, -Infinity]);
  });

  it('returns [x, x] for [x]', () => {
    expect(safeMinMax([42])).toEqual([42, 42]);
  });

  it('finds both min and max correctly', () => {
    expect(safeMinMax([3, -1, 7, 0, -5, 2])).toEqual([-5, 7]);
  });

  it('handles large arrays without throwing', () => {
    const large = Array.from({ length: 100_000 }, (_, i) => i);
    expect(() => safeMinMax(large)).not.toThrow();
    expect(safeMinMax(large)).toEqual([0, 99_999]);
  });

  it('result matches individual safeMin/safeMax calls', () => {
    const data = [10, -3, 55, 0, 7, -20, 100, 42];
    const [min, max] = safeMinMax(data);
    expect(min).toBe(safeMin(data));
    expect(max).toBe(safeMax(data));
  });
});
