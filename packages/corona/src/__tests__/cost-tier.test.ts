import { describe, expect, it } from 'vitest';
import { COST_GLYPHS, type CostThresholds, costTier, DEFAULT_COST_THRESHOLDS } from '../domain-tokens.js';

describe('costTier', () => {
  it('returns "low" below the default mid threshold', () => {
    expect(costTier(0)).toBe('low');
    expect(costTier(0.5)).toBe('low');
    expect(costTier(0.99)).toBe('low');
  });

  it('returns "mid" at or above mid and below high', () => {
    expect(costTier(1)).toBe('mid');
    expect(costTier(2)).toBe('mid');
    expect(costTier(4.99)).toBe('mid');
  });

  it('returns "high" at or above the high threshold', () => {
    expect(costTier(5)).toBe('high');
    expect(costTier(100)).toBe('high');
  });

  it('honours custom thresholds', () => {
    const thresholds: CostThresholds = { mid: 0.5, high: 1 };
    expect(costTier(0.4, thresholds)).toBe('low');
    expect(costTier(0.5, thresholds)).toBe('mid');
    expect(costTier(2, thresholds)).toBe('high');
  });

  it('treats NaN as "low" but lets ±Infinity follow the threshold ladder', () => {
    expect(costTier(Number.NaN)).toBe('low');
    expect(costTier(Number.POSITIVE_INFINITY)).toBe('high');
    expect(costTier(Number.NEGATIVE_INFINITY)).toBe('low');
  });

  it('exposes default thresholds', () => {
    expect(DEFAULT_COST_THRESHOLDS).toEqual({ mid: 1, high: 5 });
  });
});

describe('COST_GLYPHS', () => {
  it('provides a non-empty glyph triple for every tier', () => {
    for (const key of ['low', 'mid', 'high'] as const) {
      const triple = COST_GLYPHS[key];
      expect(triple.level1.length).toBeGreaterThan(0);
      expect(triple.level2.length).toBeGreaterThan(0);
      expect(typeof triple.level3).toBe('string');
    }
  });

  it('escalates the level1 glyph by tier', () => {
    expect(COST_GLYPHS.low.level1).toBe('$');
    expect(COST_GLYPHS.mid.level1).toBe('$$');
    expect(COST_GLYPHS.high.level1).toBe('$$$');
  });
});
