import { color } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { colorToHSL, interpolateColor, interpolateOKLCH } from '../interpolate.js';

describe('colorToHSL', () => {
  it('should convert pure red to [0, 100, 50]', () => {
    const hsl = colorToHSL(color.rgb(255, 0, 0));
    expect(hsl[0]).toBeCloseTo(0, 0);
    expect(hsl[1]).toBeCloseTo(100, 0);
    expect(hsl[2]).toBeCloseTo(50, 0);
  });

  it('should convert pure green to [120, 100, 50]', () => {
    const hsl = colorToHSL(color.rgb(0, 255, 0));
    expect(hsl[0]).toBeCloseTo(120, 0);
    expect(hsl[1]).toBeCloseTo(100, 0);
    expect(hsl[2]).toBeCloseTo(50, 0);
  });

  it('should convert pure blue to [240, 100, 50]', () => {
    const hsl = colorToHSL(color.rgb(0, 0, 255));
    expect(hsl[0]).toBeCloseTo(240, 0);
    expect(hsl[1]).toBeCloseTo(100, 0);
    expect(hsl[2]).toBeCloseTo(50, 0);
  });

  it('should convert white to [0, 0, 100]', () => {
    const hsl = colorToHSL(color.rgb(255, 255, 255));
    expect(hsl[0]).toBeCloseTo(0, 0);
    expect(hsl[1]).toBeCloseTo(0, 0);
    expect(hsl[2]).toBeCloseTo(100, 0);
  });

  it('should convert black to [0, 0, 0]', () => {
    const hsl = colorToHSL(color.rgb(0, 0, 0));
    expect(hsl[0]).toBeCloseTo(0, 0);
    expect(hsl[1]).toBeCloseTo(0, 0);
    expect(hsl[2]).toBeCloseTo(0, 0);
  });

  it('should handle Color with null rgb (reset) as black', () => {
    const hsl = colorToHSL(color.reset);
    expect(hsl).toEqual([0, 0, 0]);
  });

  it('should convert ANSI 16 named colors using their rgb values', () => {
    // color.brightRed has rgb [255, 0, 0]
    const hsl = colorToHSL(color.brightRed);
    expect(hsl[0]).toBeCloseTo(0, 0);
    expect(hsl[1]).toBeCloseTo(100, 0);
    expect(hsl[2]).toBeCloseTo(50, 0);
  });
});

describe('interpolateOKLCH', () => {
  it('should return first color at ratio 0', () => {
    const result = interpolateOKLCH(0.5, 0.1, 0, 0.6, 0.2, 120, 0);
    expect(result).toEqual([0.5, 0.1, 0]);
  });

  it('should return second color at ratio 1', () => {
    const result = interpolateOKLCH(0.5, 0.1, 0, 0.6, 0.2, 120, 1);
    expect(result).toEqual([0.6, 0.2, 120]);
  });

  it('should return midpoint at ratio 0.5', () => {
    const result = interpolateOKLCH(0.5, 0.1, 0, 0.6, 0.2, 120, 0.5);
    expect(result[0]).toBeCloseTo(0.55, 2);
    expect(result[1]).toBeCloseTo(0.15, 2);
    expect(result[2]).toBeCloseTo(60, 0);
  });

  it('should take shortest path for hue wrapping (350 to 10)', () => {
    // 350 -> 10 should go through 0 (delta of 20), not through 180 (delta of 340)
    const result = interpolateOKLCH(0.5, 0.1, 350, 0.5, 0.1, 10, 0.5);
    // Midpoint should be 0 (or 360)
    expect(result[2]).toBeCloseTo(0, 0);
  });

  it('should take shortest path for hue wrapping (10 to 350)', () => {
    // 10 -> 350 should go through 0, not through 180
    const result = interpolateOKLCH(0.5, 0.1, 10, 0.5, 0.1, 350, 0.5);
    expect(result[2]).toBeCloseTo(0, 0);
  });

  it('should handle same hue at any ratio', () => {
    const result = interpolateOKLCH(0.5, 0.1, 120, 0.5, 0.1, 120, 0.7);
    expect(result).toEqual([0.5, 0.1, 120]);
  });

  it('should clamp ratio below 0 to 0', () => {
    const result = interpolateOKLCH(0.5, 0.1, 0, 0.6, 0.2, 120, -0.5);
    expect(result).toEqual([0.5, 0.1, 0]);
  });

  it('should clamp ratio above 1 to 1', () => {
    const result = interpolateOKLCH(0.5, 0.1, 0, 0.6, 0.2, 120, 1.5);
    expect(result).toEqual([0.6, 0.2, 120]);
  });
});

describe('interpolateColor', () => {
  it('should return a Color with correct fg() output', () => {
    const from = color.rgb(255, 0, 0);
    const to = color.rgb(0, 0, 255);
    const mid = interpolateColor(from, to, 0.5);

    // Should have an fg() method that returns an ANSI escape
    expect(mid.fg()).toMatch(/\x1b\[38;2;\d+;\d+;\d+m/);
  });

  it('should return from color at ratio 0', () => {
    const from = color.rgb(255, 0, 0);
    const to = color.rgb(0, 0, 255);
    const result = interpolateColor(from, to, 0);

    // Should match the from color's rgb
    expect(result.rgb).not.toBeNull();
    expect(result.rgb![0]).toBeCloseTo(255, -1);
    expect(result.rgb![1]).toBeCloseTo(0, -1);
    expect(result.rgb![2]).toBeCloseTo(0, -1);
  });

  it('should return to color at ratio 1', () => {
    const from = color.rgb(255, 0, 0);
    const to = color.rgb(0, 0, 255);
    const result = interpolateColor(from, to, 1);

    expect(result.rgb).not.toBeNull();
    expect(result.rgb![0]).toBeCloseTo(0, -1);
    expect(result.rgb![1]).toBeCloseTo(0, -1);
    expect(result.rgb![2]).toBeCloseTo(255, -1);
  });

  it('should produce a midpoint color at ratio 0.5', () => {
    const from = color.rgb(255, 0, 0);
    const to = color.rgb(0, 0, 255);
    const mid = interpolateColor(from, to, 0.5);

    // Midpoint of red-blue in HSL should be somewhere in the magenta range
    expect(mid.rgb).not.toBeNull();
    // The exact values depend on HSL interpolation, but r and b should both be > 0
    expect(mid.rgb![0]).toBeGreaterThan(0);
    expect(mid.rgb![2]).toBeGreaterThan(0);
  });

  it('should handle reset color (null rgb) as black', () => {
    const from = color.reset;
    const to = color.rgb(255, 255, 255);
    const mid = interpolateColor(from, to, 1);

    expect(mid.rgb).not.toBeNull();
    expect(mid.rgb![0]).toBeCloseTo(255, -1);
    expect(mid.rgb![1]).toBeCloseTo(255, -1);
    expect(mid.rgb![2]).toBeCloseTo(255, -1);
  });
});
