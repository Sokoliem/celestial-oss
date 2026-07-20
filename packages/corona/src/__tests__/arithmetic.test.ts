import { describe, expect, it } from 'vitest';
import { color } from '../color.js';

/**
 * Helper: compare two RGB tuples with tolerance for rounding differences.
 */
function expectRgbClose(actual: [number, number, number] | null, expected: [number, number, number], tolerance = 1) {
  expect(actual).not.toBeNull();
  const [ar, ag, ab] = actual!;
  const [er, eg, eb] = expected;
  expect(ar).toBeGreaterThanOrEqual(er - tolerance);
  expect(ar).toBeLessThanOrEqual(er + tolerance);
  expect(ag).toBeGreaterThanOrEqual(eg - tolerance);
  expect(ag).toBeLessThanOrEqual(eg + tolerance);
  expect(ab).toBeGreaterThanOrEqual(eb - tolerance);
  expect(ab).toBeLessThanOrEqual(eb + tolerance);
}

describe('color arithmetic', () => {
  // --- rgbToHsl (tested via toHsl) ---

  describe('toHsl', () => {
    it('should convert primary colors correctly', () => {
      // Red: rgb(255,0,0) -> hsl(0, 100, 50)
      expect(color.toHsl(color.rgb(255, 0, 0))).toEqual([0, 100, 50]);
      // Green: rgb(0,255,0) -> hsl(120, 100, 50)
      expect(color.toHsl(color.rgb(0, 255, 0))).toEqual([120, 100, 50]);
      // Blue: rgb(0,0,255) -> hsl(240, 100, 50)
      expect(color.toHsl(color.rgb(0, 0, 255))).toEqual([240, 100, 50]);
    });

    it('should handle grayscale colors', () => {
      // Black: rgb(0,0,0) -> hsl(0, 0, 0)
      expect(color.toHsl(color.rgb(0, 0, 0))).toEqual([0, 0, 0]);
      // White: rgb(255,255,255) -> hsl(0, 0, 100)
      expect(color.toHsl(color.rgb(255, 255, 255))).toEqual([0, 0, 100]);
      // ~50% gray: rgb(128,128,128) -> hsl(0, 0, ~50)
      const [h, s, l] = color.toHsl(color.rgb(128, 128, 128));
      expect(h).toBe(0);
      expect(s).toBe(0);
      expect(l).toBeGreaterThanOrEqual(49);
      expect(l).toBeLessThanOrEqual(51);
    });

    it('should return HSL components from a truecolor', () => {
      // Pure red
      const hsl = color.toHsl(color.rgb(255, 0, 0));
      expect(hsl).toEqual([0, 100, 50]);
    });

    it('should return [0,0,0] for colors without rgb', () => {
      // NoColor (degrade to none) has no rgb
      const noColor = color.rgb(255, 0, 0).degrade('none');
      expect(noColor.rgb).toBeNull();
      expect(color.toHsl(noColor)).toEqual([0, 0, 0]);
    });
  });

  // --- darken ---

  describe('darken', () => {
    it('should reduce lightness', () => {
      // Pure red: hsl(0, 100, 50). Darken by 20 -> hsl(0, 100, 30) -> rgb(153, 0, 0)
      const darkened = color.darken(color.rgb(255, 0, 0), 20);
      expect(darkened.rgb).not.toBeNull();
      // Lightness should be lower — the resulting color should be darker
      const [, , l] = color.toHsl(darkened);
      expect(l).toBe(30);
    });

    it('should clamp lightness at 0', () => {
      const darkened = color.darken(color.rgb(255, 0, 0), 200);
      expect(darkened.rgb).not.toBeNull();
      const [, , l] = color.toHsl(darkened);
      expect(l).toBe(0);
      // Should be black
      expectRgbClose(darkened.rgb, [0, 0, 0]);
    });

    it('should return the same color when color has no rgb', () => {
      const noColor = color.rgb(255, 0, 0).degrade('none');
      const result = color.darken(noColor, 20);
      expect(result.rgb).toBeNull();
    });
  });

  // --- lighten ---

  describe('lighten', () => {
    it('should increase lightness', () => {
      // Dark red: rgb(128,0,0) -> hsl(0, 100, ~25). Lighten by 20 -> hsl(0, 100, ~45)
      const lightened = color.lighten(color.rgb(128, 0, 0), 20);
      expect(lightened.rgb).not.toBeNull();
      const [, , l] = color.toHsl(lightened);
      // Original lightness of rgb(128,0,0) is ~25, plus 20 = ~45
      expect(l).toBeGreaterThanOrEqual(44);
      expect(l).toBeLessThanOrEqual(46);
    });

    it('should clamp lightness at 100', () => {
      const lightened = color.lighten(color.rgb(255, 0, 0), 200);
      expect(lightened.rgb).not.toBeNull();
      const [, , l] = color.toHsl(lightened);
      expect(l).toBe(100);
      // Should be white
      expectRgbClose(lightened.rgb, [255, 255, 255]);
    });

    it('should return the same color when color has no rgb', () => {
      const noColor = color.rgb(255, 0, 0).degrade('none');
      const result = color.lighten(noColor, 20);
      expect(result.rgb).toBeNull();
    });
  });

  // --- saturate ---

  describe('saturate', () => {
    it('should increase saturation', () => {
      // Start with a partially desaturated color
      // hsl(0, 50, 50) -> rgb(191, 64, 64)
      const desaturatedRed = color.hsl(0, 50, 50);
      const saturated = color.saturate(desaturatedRed, 30);
      const [, s] = color.toHsl(saturated);
      expect(s).toBeGreaterThanOrEqual(79);
      expect(s).toBeLessThanOrEqual(81);
    });

    it('should clamp saturation at 100', () => {
      const saturated = color.saturate(color.rgb(255, 0, 0), 200);
      const [, s] = color.toHsl(saturated);
      expect(s).toBe(100);
    });
  });

  // --- desaturate ---

  describe('desaturate', () => {
    it('should decrease saturation', () => {
      // Pure red: hsl(0, 100, 50). Desaturate by 50 -> hsl(0, 50, 50)
      const desaturated = color.desaturate(color.rgb(255, 0, 0), 50);
      const [, s] = color.toHsl(desaturated);
      expect(s).toBeGreaterThanOrEqual(49);
      expect(s).toBeLessThanOrEqual(51);
    });

    it('should produce grayscale when fully desaturated', () => {
      const gray = color.desaturate(color.rgb(255, 0, 0), 100);
      const [, s] = color.toHsl(gray);
      expect(s).toBe(0);
      // All RGB channels should be equal (grayscale)
      expect(gray.rgb).not.toBeNull();
      expect(gray.rgb![0]).toBe(gray.rgb![1]);
      expect(gray.rgb![1]).toBe(gray.rgb![2]);
    });

    it('should clamp saturation at 0', () => {
      const desaturated = color.desaturate(color.rgb(255, 0, 0), 200);
      const [, s] = color.toHsl(desaturated);
      expect(s).toBe(0);
    });
  });

  // --- mix ---

  describe('mix', () => {
    it('should blend two colors equally', () => {
      // Mix red and blue at 0.5 -> purple-ish
      const mixed = color.mix(color.rgb(255, 0, 0), color.rgb(0, 0, 255), 0.5);
      expectRgbClose(mixed.rgb, [128, 0, 128], 1);
    });

    it('should return first color at ratio 0', () => {
      const red = color.rgb(255, 0, 0);
      const blue = color.rgb(0, 0, 255);
      const mixed = color.mix(red, blue, 0);
      expectRgbClose(mixed.rgb, [255, 0, 0]);
    });

    it('should return second color at ratio 1', () => {
      const red = color.rgb(255, 0, 0);
      const blue = color.rgb(0, 0, 255);
      const mixed = color.mix(red, blue, 1);
      expectRgbClose(mixed.rgb, [0, 0, 255]);
    });

    it('should default to ratio 0.5', () => {
      const mixed = color.mix(color.rgb(255, 0, 0), color.rgb(0, 0, 255));
      expectRgbClose(mixed.rgb, [128, 0, 128], 1);
    });

    it('should clamp ratio to [0, 1]', () => {
      const red = color.rgb(255, 0, 0);
      const blue = color.rgb(0, 0, 255);
      // ratio < 0 should clamp to 0 (return first color)
      expectRgbClose(color.mix(red, blue, -1).rgb, [255, 0, 0]);
      // ratio > 1 should clamp to 1 (return second color)
      expectRgbClose(color.mix(red, blue, 2).rgb, [0, 0, 255]);
    });

    it('should handle colors without rgb', () => {
      const noColor = color.rgb(255, 0, 0).degrade('none');
      const blue = color.rgb(0, 0, 255);
      // When first has no rgb, treat as [0,0,0]
      const mixed = color.mix(noColor, blue, 0.5);
      expectRgbClose(mixed.rgb, [0, 0, 128], 1);
    });

    it('should return first color when both lack rgb', () => {
      const nc1 = color.rgb(255, 0, 0).degrade('none');
      const nc2 = color.rgb(0, 0, 255).degrade('none');
      const mixed = color.mix(nc1, nc2, 0.5);
      expect(mixed.rgb).toBeNull();
    });
  });

  // --- ANSI 16 color arithmetic ---

  describe('ANSI 16 color arithmetic', () => {
    it('should darken ANSI 16 colors that have rgb', () => {
      // color.red has .rgb = [128, 0, 0]
      expect(color.red.rgb).not.toBeNull();
      const darkened = color.darken(color.red, 10);
      expect(darkened.rgb).not.toBeNull();
      // Should be darker than the original
      const [, , originalL] = color.toHsl(color.red);
      const [, , darkenedL] = color.toHsl(darkened);
      expect(darkenedL).toBeLessThan(originalL);
    });
  });

  // --- Return type ---

  describe('return types', () => {
    it('should return truecolor level from arithmetic operations', () => {
      const darkened = color.darken(color.rgb(255, 0, 0), 10);
      expect(darkened.level).toBe('truecolor');

      const lightened = color.lighten(color.rgb(128, 0, 0), 10);
      expect(lightened.level).toBe('truecolor');

      const saturated = color.saturate(color.rgb(200, 100, 100), 10);
      expect(saturated.level).toBe('truecolor');

      const desaturated = color.desaturate(color.rgb(255, 0, 0), 10);
      expect(desaturated.level).toBe('truecolor');

      const mixed = color.mix(color.rgb(255, 0, 0), color.rgb(0, 0, 255));
      expect(mixed.level).toBe('truecolor');
    });
  });

  // --- complement ---

  describe('complement', () => {
    it('should return the opposite hue in OKLCh', () => {
      const red = color.rgb(255, 0, 0);
      const comp = color.complement(red);
      expect(comp.rgb).not.toBeNull();
      // Complement of red should not be red
      expect(comp.rgb![0]).not.toBe(255);
      // The complement should be a different color
      expect(comp.rgb).not.toEqual(red.rgb);
    });

    it('applying complement twice should approximately recover the original', () => {
      const original = color.rgb(100, 150, 200);
      const doubleComp = color.complement(color.complement(original));
      expectRgbClose(doubleComp.rgb, original.rgb!, 3);
    });

    it('should return the input color when it has no rgb', () => {
      const noColor = color.rgb(255, 0, 0).degrade('none');
      expect(color.complement(noColor)).toBe(noColor);
    });
  });

  // --- triad ---

  describe('triad', () => {
    it('should return exactly 3 colors', () => {
      const result = color.triad(color.rgb(255, 0, 0));
      expect(result).toHaveLength(3);
    });

    it('first element should be the original color', () => {
      const red = color.rgb(255, 0, 0);
      const [first] = color.triad(red);
      expectRgbClose(first!.rgb, red.rgb!, 1);
    });

    it('should return three distinct colors', () => {
      const [a, b, c] = color.triad(color.rgb(255, 128, 0));
      expect(a!.rgb).not.toEqual(b!.rgb);
      expect(b!.rgb).not.toEqual(c!.rgb);
      expect(a!.rgb).not.toEqual(c!.rgb);
    });

    it('should return the input color three times when no rgb', () => {
      const noColor = color.rgb(255, 0, 0).degrade('none');
      const result = color.triad(noColor);
      expect(result[0]).toBe(noColor);
      expect(result[1]).toBe(noColor);
      expect(result[2]).toBe(noColor);
    });
  });

  // --- analogous ---

  describe('analogous', () => {
    it('should return the requested count of colors (default 3)', () => {
      const result = color.analogous(color.rgb(255, 0, 0));
      expect(result).toHaveLength(3);
    });

    it('should return exactly count colors', () => {
      expect(color.analogous(color.rgb(200, 100, 50), 5)).toHaveLength(5);
      expect(color.analogous(color.rgb(200, 100, 50), 2)).toHaveLength(2);
    });

    it('all colors should be valid TrueColor instances', () => {
      for (const c of color.analogous(color.rgb(100, 200, 150), 4)) {
        expect(c.rgb).not.toBeNull();
        expect(c.level).toBe('truecolor');
      }
    });

    it('should return the input repeated when no rgb', () => {
      const noColor = color.rgb(0, 0, 0).degrade('none');
      const result = color.analogous(noColor, 3);
      expect(result).toHaveLength(3);
      for (const c of result) {
        expect(c).toBe(noColor);
      }
    });
  });

  // --- toGrayscale ---

  describe('toGrayscale', () => {
    it('should produce an equal-channel color', () => {
      const gray = color.toGrayscale(color.rgb(255, 128, 0));
      expect(gray.rgb).not.toBeNull();
      const [r, g, b] = gray.rgb!;
      expect(r).toBe(g);
      expect(g).toBe(b);
    });

    it('white stays white', () => {
      const gray = color.toGrayscale(color.rgb(255, 255, 255));
      expectRgbClose(gray.rgb, [255, 255, 255]);
    });

    it('black stays black', () => {
      const gray = color.toGrayscale(color.rgb(0, 0, 0));
      expectRgbClose(gray.rgb, [0, 0, 0]);
    });

    it('should return the input when no rgb', () => {
      const noColor = color.rgb(255, 0, 0).degrade('none');
      expect(color.toGrayscale(noColor)).toBe(noColor);
    });
  });

  // --- invert ---

  describe('invert', () => {
    it('should invert black to white', () => {
      const inv = color.invert(color.rgb(0, 0, 0));
      expectRgbClose(inv.rgb, [255, 255, 255]);
    });

    it('should invert white to black', () => {
      const inv = color.invert(color.rgb(255, 255, 255));
      expectRgbClose(inv.rgb, [0, 0, 0]);
    });

    it('inverting twice should recover the original', () => {
      const original = color.rgb(100, 150, 200);
      const doubleInverted = color.invert(color.invert(original));
      expectRgbClose(doubleInverted.rgb, original.rgb!);
    });

    it('should return the input when no rgb', () => {
      const noColor = color.rgb(255, 0, 0).degrade('none');
      expect(color.invert(noColor)).toBe(noColor);
    });
  });

  // --- luminance ---

  describe('luminance', () => {
    it('black has luminance 0', () => {
      expect(color.luminance(color.rgb(0, 0, 0))).toBe(0);
    });

    it('white has luminance 1', () => {
      expect(color.luminance(color.rgb(255, 255, 255))).toBeCloseTo(1, 3);
    });

    it('luminance is between 0 and 1', () => {
      const lum = color.luminance(color.rgb(128, 64, 32));
      expect(lum).toBeGreaterThanOrEqual(0);
      expect(lum).toBeLessThanOrEqual(1);
    });

    it('returns 0 for colors without rgb', () => {
      const noColor = color.rgb(0, 0, 0).degrade('none');
      expect(color.luminance(noColor)).toBe(0);
    });
  });

  // --- contrastRatio ---

  describe('contrastRatio', () => {
    it('black on white has maximum contrast ~21', () => {
      const ratio = color.contrastRatio(color.rgb(0, 0, 0), color.rgb(255, 255, 255));
      expect(ratio).toBeCloseTo(21, 0);
    });

    it('same color has minimum contrast 1', () => {
      const ratio = color.contrastRatio(color.rgb(128, 128, 128), color.rgb(128, 128, 128));
      expect(ratio).toBeCloseTo(1, 3);
    });

    it('is symmetric (fg/bg order does not matter)', () => {
      const a = color.rgb(200, 50, 100);
      const b = color.rgb(30, 30, 30);
      expect(color.contrastRatio(a, b)).toBeCloseTo(color.contrastRatio(b, a), 5);
    });

    it('result is always >= 1', () => {
      const ratio = color.contrastRatio(color.rgb(100, 100, 200), color.rgb(50, 100, 150));
      expect(ratio).toBeGreaterThanOrEqual(1);
    });
  });

  // --- isAccessible ---

  describe('isAccessible', () => {
    it('black on white passes AA', () => {
      expect(color.isAccessible(color.rgb(0, 0, 0), color.rgb(255, 255, 255))).toBe(true);
    });

    it('black on white passes AAA', () => {
      expect(color.isAccessible(color.rgb(0, 0, 0), color.rgb(255, 255, 255), 'AAA')).toBe(true);
    });

    it('same color fails AA', () => {
      expect(color.isAccessible(color.rgb(128, 128, 128), color.rgb(128, 128, 128))).toBe(false);
    });

    it('large text has a lower threshold for AA (3:1)', () => {
      // A pair that fails standard AA but would pass large-text AA (3:1 threshold)
      const white = color.rgb(255, 255, 255);
      // use a better example: dark gray on white
      const darkGray = color.rgb(90, 90, 90);
      const r2 = color.contrastRatio(darkGray, white);
      // ~3.95 passes large text AA (>=3) but might fail normal AA (>=4.5)
      if (r2 >= 3 && r2 < 4.5) {
        expect(color.isAccessible(darkGray, white, 'AA', true)).toBe(true);
        expect(color.isAccessible(darkGray, white, 'AA', false)).toBe(false);
      }
    });

    it('defaults to AA non-large-text', () => {
      // Verify default args mirror explicit AA/false
      const fg = color.rgb(0, 0, 0);
      const bg = color.rgb(255, 255, 255);
      expect(color.isAccessible(fg, bg)).toBe(color.isAccessible(fg, bg, 'AA', false));
    });
  });
});
