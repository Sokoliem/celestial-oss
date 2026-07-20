import { color } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { breathe, colorCycle, glow, shimmer } from '../effects.js';

/** Strip ANSI escape codes to get visible text */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('shimmer', () => {
  it('should return a string with ANSI codes', () => {
    const result = shimmer('Hello', { tick: 0 });
    expect(result).toMatch(/\x1b\[/);
  });

  it('should produce different output at different ticks', () => {
    const result1 = shimmer('Hello World', { tick: 0 });
    const result2 = shimmer('Hello World', { tick: 5 });
    expect(result1).not.toBe(result2);
  });

  it('should preserve visible character count', () => {
    const text = 'Hello';
    const result = shimmer(text, { tick: 0 });
    expect(stripAnsi(result)).toBe(text);
  });

  it('should accept custom speed and width', () => {
    const result = shimmer('Hello', { tick: 0, speed: 2, width: 5 });
    expect(stripAnsi(result)).toBe('Hello');
  });

  it('should accept custom highlight color', () => {
    const result = shimmer('Hi', { tick: 0, color: color.rgb(255, 255, 0) });
    expect(stripAnsi(result)).toBe('Hi');
  });

  it('should handle empty string', () => {
    const result = shimmer('', { tick: 0 });
    expect(result).toBe('');
  });

  it('should accept a custom baseColor option', () => {
    const baseColor = color.rgb(0, 0, 200);
    const result = shimmer('Hello', { tick: 0, baseColor });
    expect(stripAnsi(result)).toBe('Hello');
    // Should still contain ANSI color codes
    expect(result).toMatch(/\x1b\[/);
  });

  it('should produce different output with baseColor vs without', () => {
    const baseColor = color.rgb(0, 100, 200);
    const withBase = shimmer('Hello World', { tick: 3, baseColor });
    const withoutBase = shimmer('Hello World', { tick: 3 });
    // The ANSI codes should differ since baseColor changes the dim color
    expect(withBase).not.toBe(withoutBase);
  });

  it('saturation at band edge (blend=0) should equal base saturation, not 0', () => {
    // Regression: shimmer uses `s = sh * blend` which drops saturation to 0
    // at the band edge (blend=0). It should interpolate between baseS and sh:
    // `s = baseS + (sh - baseS) * blend` so at blend=0 we get baseS.
    //
    // The band edge is exactly at wrappedDist === halfWidth, where blend = 0.
    // At blend=0, the bug produces s=0 (gray), while the fix produces s=baseS.
    //
    // We test by comparing the color of a character just inside the band edge
    // (blend ~= 0) with a character just outside the band. They should be
    // nearly identical. With the bug, the band-edge character has s=0 (gray)
    // while the outside character has baseS (colored).

    // Use a highly saturated base color for clear detection
    const baseColor = color.rgb(0, 0, 255); // pure blue, high saturation
    const highlightColor = color.rgb(255, 255, 255); // white, no saturation

    // Width=3 means halfWidth=1.5. Band center at pos=tick*speed%len.
    // At tick=0, pos=0. Band covers chars 0 to 1 (within halfWidth=1.5).
    // char at i=1: wrappedDist = 1, blend = 1 - 1/1.5 = 0.333
    // char at i=2: wrappedDist = 2, > halfWidth(1.5), OUTSIDE band
    //
    // To get blend exactly 0, we need wrappedDist = halfWidth.
    // With width=2, halfWidth=1. At tick=0, pos=0.
    // char at i=1: wrappedDist = 1, = halfWidth -> blend = 0
    // char at i=2: wrappedDist = min(2, len-2) = 2, > halfWidth -> OUTSIDE
    const text = 'ABCDEFGHIJ'; // 10 chars
    const result = shimmer(text, {
      tick: 0,
      color: highlightColor,
      baseColor,
      width: 2, // halfWidth = 1
    });

    // Extract all RGB color codes
    const codes = [...result.matchAll(/\x1b\[38;2;(\d+);(\d+);(\d+)m/g)];

    // char at i=0: wrappedDist=0, blend=1 (center of band) -> highlight
    // char at i=1: wrappedDist=1, blend=0 (band EDGE)
    //   Bug: s = sh * 0 = 0 (gray!)
    //   Fix: s = baseS + (sh - baseS) * 0 = baseS (colored)
    // char at i=2: wrappedDist=2, > halfWidth -> OUTSIDE -> uses baseS
    //
    // After fix: char[1] and char[2] should have similar saturation (both baseS).
    // With bug: char[1] has s=0 (gray), char[2] has baseS (colored) -> different.

    // Get the color of character at position 1 (band edge, blend=0)
    const bandEdge = codes[1];
    expect(bandEdge).toBeDefined();
    const [, edgeR, edgeG, edgeB] = bandEdge!;

    // Get the color of character at position 2 (outside band)
    const outside = codes[2];
    expect(outside).toBeDefined();
    const [, outR, outG, outB] = outside!;

    // Both should use the same base saturation. With the bug, the band edge
    // char is gray (R=G=B) while the outside char is colored (R != B).
    // The band edge should NOT be pure gray when baseColor has saturation.
    const edgeIsGray = edgeR === edgeG && edgeG === edgeB;
    expect(edgeIsGray).toBe(false);

    // Assert the outside char has saturation (is not gray)
    const outsideIsGray = outR === outG && outG === outB;
    expect(outsideIsGray).toBe(false);
  });
});

describe('glow', () => {
  it('should produce output wider than input by 2 * intensity', () => {
    const text = 'Test';
    const intensity = 2;
    const result = glow(text, { color: color.rgb(0, 200, 255), intensity });

    const visibleResult = stripAnsi(result);
    expect(visibleResult.length).toBe(text.length + 2 * intensity);
  });

  it('should use default intensity of 2', () => {
    const text = 'Hi';
    const result = glow(text, { color: color.rgb(0, 200, 255) });

    const visibleResult = stripAnsi(result);
    expect(visibleResult.length).toBe(text.length + 4); // 2 * 2 default
  });

  it('should have ANSI color codes on padding chars', () => {
    const result = glow('X', { color: color.rgb(0, 200, 255), intensity: 2 });

    // The result should have ANSI escape codes
    expect(result).toMatch(/\x1b\[38;2;\d+;\d+;\d+m/);
  });

  it('should preserve the original text in the center', () => {
    const text = 'Glow';
    const result = glow(text, { color: color.rgb(255, 100, 50), intensity: 3 });

    const visible = stripAnsi(result);
    // The middle portion should be the original text
    expect(visible.substring(3, 3 + text.length)).toBe(text);
  });

  it('should handle empty string', () => {
    const result = glow('', { color: color.rgb(255, 0, 0), intensity: 2 });
    const visible = stripAnsi(result);
    // Just padding spaces
    expect(visible.length).toBe(4);
  });
});

describe('breathe', () => {
  it('should produce different colors at different ticks', () => {
    const opts = { from: color.rgb(255, 0, 0), to: color.rgb(0, 0, 255), speed: 1 };
    const result1 = breathe('Hello', { ...opts, tick: 0 });
    const result2 = breathe('Hello', { ...opts, tick: 8 });

    // Different tick = different ANSI codes (unless by coincidence)
    // At tick 0 and tick 8, sin values differ significantly
    expect(result1).not.toBe(result2);
  });

  it('should preserve visible text content', () => {
    const text = 'Breathing';
    const result = breathe(text, {
      from: color.rgb(255, 0, 0),
      to: color.rgb(0, 0, 255),
      tick: 0,
    });
    expect(stripAnsi(result)).toBe(text);
  });

  it('should apply a single color to entire text', () => {
    const result = breathe('AB', {
      from: color.rgb(255, 0, 0),
      to: color.rgb(0, 0, 255),
      tick: 0,
    });

    // Should have ANSI codes
    const matches = result.match(/\x1b\[38;2;\d+;\d+;\d+m/g);
    expect(matches).not.toBeNull();
    // Breathe applies one color to the whole text, so 1 color code
    expect(matches!.length).toBe(1);
  });

  it('should handle empty string', () => {
    const result = breathe('', {
      from: color.rgb(255, 0, 0),
      to: color.rgb(0, 0, 255),
      tick: 0,
    });
    expect(result).toBe('');
  });
});

describe('colorCycle', () => {
  it('should produce per-char ANSI codes', () => {
    const result = colorCycle('Hello', { tick: 0 });

    const matches = result.match(/\x1b\[38;2;\d+;\d+;\d+m/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(5);
  });

  it('should produce different output at different ticks', () => {
    const result1 = colorCycle('Hello', { tick: 0 });
    const result2 = colorCycle('Hello', { tick: 5 });
    expect(result1).not.toBe(result2);
  });

  it('should preserve visible text', () => {
    const text = 'Rainbow';
    const result = colorCycle(text, { tick: 0 });
    expect(stripAnsi(result)).toBe(text);
  });

  it('should accept custom saturation and lightness', () => {
    const result = colorCycle('Hi', { tick: 0, saturation: 100, lightness: 50 });
    expect(stripAnsi(result)).toBe('Hi');
  });

  it('should handle empty string', () => {
    const result = colorCycle('', { tick: 0 });
    expect(result).toBe('');
  });
});
