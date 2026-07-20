import { describe, expect, it } from 'vitest';
import { aspectCorrectCells, CELL_ASPECT_RATIO } from '../geometry.js';

describe('CELL_ASPECT_RATIO', () => {
  it('is 0.5 — terminal cells are ~twice as tall as wide', () => {
    expect(CELL_ASPECT_RATIO).toBe(0.5);
  });
});

describe('aspectCorrectCells', () => {
  it('square source → rows = cols / 2 (default aspect)', () => {
    expect(aspectCorrectCells({ srcW: 1280, srcH: 1280, cols: 36 })).toEqual({ cols: 36, rows: 18 });
    expect(aspectCorrectCells({ srcW: 1280, srcH: 1281, cols: 36 })).toEqual({ cols: 36, rows: 18 });
  });

  it('wide source (16:9) → fewer rows than half cols', () => {
    expect(aspectCorrectCells({ srcW: 1920, srcH: 1080, cols: 80 })).toEqual({ cols: 80, rows: 23 });
  });

  it('tall portrait source (2:3) → more rows than half cols', () => {
    expect(aspectCorrectCells({ srcW: 480, srcH: 720, cols: 40 })).toEqual({ cols: 40, rows: 30 });
  });

  it('explicit cellAspect overrides the default', () => {
    // 14×32 cell pixel size — wider cells than typical, so fewer rows.
    expect(aspectCorrectCells({ srcW: 1280, srcH: 1280, cols: 36, cellAspect: 14 / 32 })).toEqual({
      cols: 36,
      rows: 16,
    });
  });

  it('clamps result to at least 1 row even when source is extremely wide', () => {
    expect(aspectCorrectCells({ srcW: 10000, srcH: 1, cols: 80 })).toEqual({ cols: 80, rows: 1 });
  });

  it('rounds rows to the nearest integer', () => {
    // 50 × 0.5 × (33 / 100) = 8.25 → rounds to 8
    expect(aspectCorrectCells({ srcW: 100, srcH: 33, cols: 50 })).toEqual({ cols: 50, rows: 8 });
  });

  it('throws on non-positive srcW / srcH / cols / cellAspect', () => {
    expect(() => aspectCorrectCells({ srcW: 0, srcH: 1, cols: 10 })).toThrow();
    expect(() => aspectCorrectCells({ srcW: 1, srcH: 0, cols: 10 })).toThrow();
    expect(() => aspectCorrectCells({ srcW: 1, srcH: 1, cols: 0 })).toThrow();
    expect(() => aspectCorrectCells({ srcW: 1, srcH: 1, cols: 10, cellAspect: 0 })).toThrow();
    expect(() => aspectCorrectCells({ srcW: -1, srcH: 1, cols: 10 })).toThrow();
    expect(() => aspectCorrectCells({ srcW: Number.NaN, srcH: 1, cols: 10 })).toThrow();
    expect(() => aspectCorrectCells({ srcW: Number.POSITIVE_INFINITY, srcH: 1, cols: 10 })).toThrow();
  });

  it('matches the documented formula with default cellAspect', () => {
    // Spot-check against rows = round(cols × 0.5 × srcH/srcW)
    const cases: Array<[number, number, number, number]> = [
      [800, 600, 60, Math.round(60 * 0.5 * (600 / 800))], // 22.5 → 23
      [400, 200, 40, Math.round(40 * 0.5 * (200 / 400))], // 10
      [1024, 1024, 50, Math.round(50 * 0.5 * (1024 / 1024))], // 25
    ];
    for (const [srcW, srcH, cols, expectedRows] of cases) {
      expect(aspectCorrectCells({ srcW, srcH, cols })).toEqual({ cols, rows: expectedRows });
    }
  });
});
