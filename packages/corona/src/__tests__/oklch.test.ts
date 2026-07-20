import { describe, expect, it } from 'vitest';
import { color } from '../color.js';

describe('OKLCH API', () => {
  describe('toOklch', () => {
    it('converts a Color to OKLCH tuple', () => {
      const result = color.toOklch(color.rgb(255, 0, 0));
      expect(result).not.toBeNull();
      expect(result!.length).toBe(3);
      // Red should have L ~0.63, C ~0.26, H ~29
      expect(result![0]).toBeCloseTo(0.63, 1);
      expect(result![2]).toBeGreaterThan(20);
      expect(result![2]).toBeLessThan(40);
    });

    it('converts a hex string to OKLCH tuple', () => {
      const result = color.toOklch('#ff0000');
      expect(result).not.toBeNull();
      const fromColor = color.toOklch(color.rgb(255, 0, 0));
      // Should match
      expect(result![0]).toBeCloseTo(fromColor![0], 4);
      expect(result![1]).toBeCloseTo(fromColor![1], 4);
      expect(result![2]).toBeCloseTo(fromColor![2], 4);
    });

    it('returns null for color with no rgb', () => {
      expect(color.toOklch(color.reset)).toBeNull();
    });
  });

  describe('fromOklch', () => {
    it('creates a Color from OKLCH tuple', () => {
      const c = color.fromOklch([0.63, 0.26, 29]);
      expect(c.rgb).not.toBeNull();
      // Should be approximately red
      expect(c.rgb![0]).toBeGreaterThan(200);
    });

    it('round-trips with toOklch', () => {
      const original = color.rgb(100, 150, 200);
      const oklch = color.toOklch(original)!;
      const roundTripped = color.fromOklch(oklch);
      // Should be close (within 1 due to floating point)
      expect(Math.abs(roundTripped.rgb![0] - original.rgb![0])).toBeLessThanOrEqual(1);
      expect(Math.abs(roundTripped.rgb![1] - original.rgb![1])).toBeLessThanOrEqual(1);
      expect(Math.abs(roundTripped.rgb![2] - original.rgb![2])).toBeLessThanOrEqual(1);
    });
  });

  describe('adjustOklch', () => {
    it('increases lightness', () => {
      const dark = color.rgb(50, 50, 50);
      const lighter = color.adjustOklch(dark, { l: 0.2 });
      // Lighter should have higher RGB values
      expect(lighter.rgb![0]).toBeGreaterThan(dark.rgb![0]);
    });

    it('rotates hue by 180 matches complement', () => {
      const c = color.rgb(200, 50, 50);
      const adjusted = color.adjustOklch(c, { h: 180 });
      const complemented = color.complement(c);
      // Should be approximately equal
      expect(Math.abs(adjusted.rgb![0] - complemented.rgb![0])).toBeLessThanOrEqual(2);
      expect(Math.abs(adjusted.rgb![1] - complemented.rgb![1])).toBeLessThanOrEqual(2);
      expect(Math.abs(adjusted.rgb![2] - complemented.rgb![2])).toBeLessThanOrEqual(2);
    });

    it('clamps lightness to [0, 1]', () => {
      const c = color.rgb(200, 200, 200);
      const adjusted = color.adjustOklch(c, { l: 10 }); // way over
      expect(adjusted.rgb).not.toBeNull();
      // Should be near white
      expect(adjusted.rgb![0]).toBeGreaterThan(240);
    });

    it('handles null-rgb gracefully', () => {
      const result = color.adjustOklch(color.reset, { l: 0.1 });
      expect(result).toBe(color.reset); // returns unchanged
    });

    it('adjusts chroma', () => {
      const c = color.rgb(150, 100, 100);
      const moreSaturated = color.adjustOklch(c, { c: 0.05 });
      // More saturated should have more color separation
      const diffOriginal = Math.abs(c.rgb![0] - c.rgb![1]);
      const diffAdjusted = Math.abs(moreSaturated.rgb![0] - moreSaturated.rgb![1]);
      expect(diffAdjusted).toBeGreaterThan(diffOriginal);
    });

    it('adjusts with no changes returns equivalent color', () => {
      const c = color.rgb(100, 150, 200);
      const same = color.adjustOklch(c, {});
      expect(Math.abs(same.rgb![0] - c.rgb![0])).toBeLessThanOrEqual(1);
      expect(Math.abs(same.rgb![1] - c.rgb![1])).toBeLessThanOrEqual(1);
      expect(Math.abs(same.rgb![2] - c.rgb![2])).toBeLessThanOrEqual(1);
    });
  });
});
