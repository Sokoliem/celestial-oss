import { describe, expect, it } from 'vitest';
import { color } from '../color.js';
import { type CVDType, simulateColorBlindness } from '../cvd.js';

describe('simulateColorBlindness', () => {
  describe('protanopia', () => {
    it('shifts pure red significantly (R channel reduced)', () => {
      const result = simulateColorBlindness(color.rgb(255, 0, 0), 'protanopia');
      expect(result.rgb).not.toBeNull();
      const [r, g, b] = result.rgb!;
      // Red should be significantly reduced compared to original 255
      expect(r).toBeLessThan(200);
      // Should still have valid RGB range
      expect(r).toBeGreaterThanOrEqual(0);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(255);
      expect(g).toBeLessThanOrEqual(255);
      expect(b).toBeLessThanOrEqual(255);
    });

    it('keeps white close to white', () => {
      const result = simulateColorBlindness(color.rgb(255, 255, 255), 'protanopia');
      expect(result.rgb).not.toBeNull();
      const [r, g, b] = result.rgb!;
      expect(r).toBeGreaterThan(250);
      expect(g).toBeGreaterThan(250);
      expect(b).toBeGreaterThan(250);
    });

    it('keeps black as black', () => {
      const result = simulateColorBlindness(color.rgb(0, 0, 0), 'protanopia');
      expect(result.rgb).not.toBeNull();
      const [r, g, b] = result.rgb!;
      expect(r).toBe(0);
      expect(g).toBe(0);
      expect(b).toBe(0);
    });
  });

  describe('deuteranopia', () => {
    it('shifts pure green (G channel changes)', () => {
      const result = simulateColorBlindness(color.rgb(0, 255, 0), 'deuteranopia');
      expect(result.rgb).not.toBeNull();
      const [r, g, b] = result.rgb!;
      // Green should shift — not stay at pure green
      expect(r).toBeGreaterThan(0);
      // All channels valid
      expect(r).toBeGreaterThanOrEqual(0);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(255);
      expect(g).toBeLessThanOrEqual(255);
      expect(b).toBeLessThanOrEqual(255);
    });
  });

  describe('tritanopia', () => {
    it('shifts pure blue', () => {
      const result = simulateColorBlindness(color.rgb(0, 0, 255), 'tritanopia');
      expect(result.rgb).not.toBeNull();
      const [r, g, b] = result.rgb!;
      // Blue should shift — not stay at pure blue
      expect(r + g).toBeGreaterThan(0);
      // All channels valid
      expect(r).toBeGreaterThanOrEqual(0);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(255);
      expect(g).toBeLessThanOrEqual(255);
      expect(b).toBeLessThanOrEqual(255);
    });
  });

  describe('achromatopsia', () => {
    it('converts red to grayscale', () => {
      const result = simulateColorBlindness(color.rgb(255, 0, 0), 'achromatopsia');
      expect(result.rgb).not.toBeNull();
      const [r, g, b] = result.rgb!;
      // R=G=B for grayscale
      expect(r).toBe(g);
      expect(g).toBe(b);
      // Should be relatively dark (red luminance weight is ~0.2126)
      expect(r).toBeLessThan(128);
      expect(r).toBeGreaterThan(0);
    });

    it('produces R=G=B output', () => {
      const result = simulateColorBlindness(color.rgb(100, 200, 50), 'achromatopsia');
      expect(result.rgb).not.toBeNull();
      const [r, g, b] = result.rgb!;
      expect(r).toBe(g);
      expect(g).toBe(b);
    });
  });

  describe('null rgb passthrough', () => {
    it('returns the same color unchanged when rgb is null', () => {
      const resetColor = color.reset;
      expect(resetColor.rgb).toBeNull();
      const result = simulateColorBlindness(resetColor, 'protanopia');
      expect(result).toBe(resetColor);
    });

    it('returns unchanged for all CVD types when rgb is null', () => {
      const types: CVDType[] = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];
      for (const t of types) {
        const result = simulateColorBlindness(color.reset, t);
        expect(result).toBe(color.reset);
      }
    });
  });

  describe('all CVD types return valid Color with rgb tuple', () => {
    const types: CVDType[] = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];
    const testColors = [color.rgb(255, 0, 0), color.rgb(0, 255, 0), color.rgb(0, 0, 255), color.rgb(128, 64, 200)];

    for (const cvdType of types) {
      for (const c of testColors) {
        it(`${cvdType} on rgb(${c.rgb!.join(',')}) returns valid Color`, () => {
          const result = simulateColorBlindness(c, cvdType);
          expect(result.rgb).not.toBeNull();
          const [r, g, b] = result.rgb!;
          expect(r).toBeGreaterThanOrEqual(0);
          expect(r).toBeLessThanOrEqual(255);
          expect(g).toBeGreaterThanOrEqual(0);
          expect(g).toBeLessThanOrEqual(255);
          expect(b).toBeGreaterThanOrEqual(0);
          expect(b).toBeLessThanOrEqual(255);
          // Should be integers
          expect(Number.isInteger(r)).toBe(true);
          expect(Number.isInteger(g)).toBe(true);
          expect(Number.isInteger(b)).toBe(true);
        });
      }
    }
  });
});
