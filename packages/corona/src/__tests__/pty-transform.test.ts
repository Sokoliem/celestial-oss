import { describe, expect, it } from 'vitest';
import {
  createAnsi16Remap,
  createPtyThemeTransform,
  createPtyTransform,
  hexToRgb,
  lightTransform,
  monoTransform,
  type PtyColorTransform,
  type PtyThemeConfig,
  rgbToHex,
  sepiaTransform,
} from '../pty-transform.js';

// ─── hexToRgb ───────────────────────────────────────────────────────────────

describe('hexToRgb', () => {
  it('parses 6-digit hex with #', () => {
    expect(hexToRgb('#ff8040')).toEqual([255, 128, 64]);
  });

  it('parses 6-digit hex without #', () => {
    expect(hexToRgb('ff8040')).toEqual([255, 128, 64]);
  });

  it('parses 3-digit shorthand hex', () => {
    expect(hexToRgb('#f80')).toEqual([255, 136, 0]);
  });

  it('parses black', () => {
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
  });

  it('parses white', () => {
    expect(hexToRgb('#ffffff')).toEqual([255, 255, 255]);
  });

  it('is case-insensitive', () => {
    expect(hexToRgb('#FF8040')).toEqual([255, 128, 64]);
  });
});

// ─── rgbToHex ───────────────────────────────────────────────────────────────

describe('rgbToHex', () => {
  it('converts RGB to lowercase hex with #', () => {
    expect(rgbToHex(255, 128, 64)).toBe('#ff8040');
  });

  it('converts black', () => {
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
  });

  it('converts white', () => {
    expect(rgbToHex(255, 255, 255)).toBe('#ffffff');
  });

  it('clamps values above 255', () => {
    expect(rgbToHex(300, 128, 64)).toBe('#ff8040');
  });

  it('clamps values below 0', () => {
    expect(rgbToHex(-10, 128, 64)).toBe('#008040');
  });

  it('rounds fractional values', () => {
    // 127.6 rounds to 128 (0x80), 0.4 rounds to 0 (0x00), 64 stays 64 (0x40)
    expect(rgbToHex(127.6, 0.4, 64)).toBe('#800040');
  });
});

// ─── hexToRgb + rgbToHex roundtrip ──────────────────────────────────────────

describe('hexToRgb + rgbToHex roundtrip', () => {
  it('roundtrips standard colors', () => {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#000000', '#ffffff', '#808080'];
    for (const hex of colors) {
      const [r, g, b] = hexToRgb(hex);
      expect(rgbToHex(r, g, b)).toBe(hex);
    }
  });
});

// ─── sepiaTransform ─────────────────────────────────────────────────────────

describe('sepiaTransform', () => {
  it('applies sepia matrix (70% sepia + 30% original)', () => {
    const [r, g, b] = sepiaTransform(128, 128, 128);
    // Sepia should warm the color — red/green > blue
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
  });

  it('returns whole numbers', () => {
    const [r, g, b] = sepiaTransform(100, 200, 50);
    expect(Number.isInteger(r)).toBe(true);
    expect(Number.isInteger(g)).toBe(true);
    expect(Number.isInteger(b)).toBe(true);
  });

  it('does not exceed 255', () => {
    const [r, g, b] = sepiaTransform(255, 255, 255);
    expect(r).toBeLessThanOrEqual(255);
    expect(g).toBeLessThanOrEqual(255);
    expect(b).toBeLessThanOrEqual(255);
  });

  it('preserves black', () => {
    const [r, g, b] = sepiaTransform(0, 0, 0);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('produces expected sepia tone for gray', () => {
    // 128, 128, 128 through sepia matrix
    const [r, g, b] = sepiaTransform(128, 128, 128);
    // Verify the specific math: sepia matrix + 70/30 blend
    const tr = Math.min(255, 128 * 0.393 + 128 * 0.769 + 128 * 0.189);
    const tg = Math.min(255, 128 * 0.349 + 128 * 0.686 + 128 * 0.168);
    const tb = Math.min(255, 128 * 0.272 + 128 * 0.534 + 128 * 0.131);
    expect(r).toBe(Math.round(128 * 0.3 + tr * 0.7));
    expect(g).toBe(Math.round(128 * 0.3 + tg * 0.7));
    expect(b).toBe(Math.round(128 * 0.3 + tb * 0.7));
  });
});

// ─── monoTransform ──────────────────────────────────────────────────────────

describe('monoTransform', () => {
  it('desaturates with luminance weighting (85% lum + 15% original)', () => {
    const [r, g, b] = monoTransform(255, 0, 0);
    // Red → grayscale: luminance ≈ 76, blended with 15% original red
    const lum = 255 * 0.299 + 0 * 0.587 + 0 * 0.114;
    expect(r).toBe(Math.round(lum * 0.85 + 255 * 0.15));
    expect(g).toBe(Math.round(lum * 0.85 + 0 * 0.15));
    expect(b).toBe(Math.round(lum * 0.85 + 0 * 0.15));
  });

  it('preserves pure gray unchanged (within rounding)', () => {
    const [r, g, b] = monoTransform(128, 128, 128);
    // For gray, lum = 128, so 85% of 128 + 15% of 128 = 128
    expect(r).toBe(128);
    expect(g).toBe(128);
    expect(b).toBe(128);
  });

  it('returns whole numbers', () => {
    const [r, g, b] = monoTransform(100, 200, 50);
    expect(Number.isInteger(r)).toBe(true);
    expect(Number.isInteger(g)).toBe(true);
    expect(Number.isInteger(b)).toBe(true);
  });

  it('preserves black', () => {
    const [r, g, b] = monoTransform(0, 0, 0);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });
});

// ─── lightTransform ─────────────────────────────────────────────────────────

describe('lightTransform', () => {
  it('darkens near-black colors (lum < 30) for readability on light bg', () => {
    const [r, g, b] = lightTransform(10, 10, 10);
    // Near-black: multiply by 0.25
    expect(r).toBe(Math.round(10 * 0.25));
    expect(g).toBe(Math.round(10 * 0.25));
    expect(b).toBe(Math.round(10 * 0.25));
  });

  it('darkens near-white colors for readability on light bg', () => {
    const [r, g, b] = lightTransform(250, 250, 250);
    // Near-white: multiply by 0.3 + 20
    expect(r).toBe(Math.round(250 * 0.3 + 20));
    expect(g).toBe(Math.round(250 * 0.3 + 20));
    expect(b).toBe(Math.round(250 * 0.3 + 20));
  });

  it('desaturates and compresses mid-range colors', () => {
    const [r, g, b] = lightTransform(100, 150, 200);
    // All mid-range values should be darkened and desaturated
    expect(r).toBeLessThan(200);
    expect(g).toBeLessThan(200);
    expect(b).toBeLessThan(200);
    // Red component should be darkened
    expect(r).toBeLessThan(100);
  });

  it('produces all values ≤ 200 for mid-range colors', () => {
    const [r, g, b] = lightTransform(128, 128, 128);
    expect(r).toBeLessThanOrEqual(200);
    expect(g).toBeLessThanOrEqual(200);
    expect(b).toBeLessThanOrEqual(200);
  });

  it('returns whole numbers', () => {
    const [r, g, b] = lightTransform(100, 200, 50);
    expect(Number.isInteger(r)).toBe(true);
    expect(Number.isInteger(g)).toBe(true);
    expect(Number.isInteger(b)).toBe(true);
  });
});

// ─── createPtyTransform ─────────────────────────────────────────────────────

describe('createPtyTransform', () => {
  it('sepia: transforms hex colors through sepia pipeline', () => {
    const transform = createPtyTransform('sepia');
    expect(transform).toBeDefined();

    const result = transform!('#808080');
    // Should be a valid hex string
    expect(result).toMatch(/^#[0-9a-f]{6}$/);

    // Sepia should produce warmer tones: red channel > blue channel
    const [r, , b] = hexToRgb(result);
    expect(r).toBeGreaterThan(b);
  });

  it('mono: transforms hex colors through mono pipeline', () => {
    const transform = createPtyTransform('mono');
    expect(transform).toBeDefined();

    const result = transform!('#ff0000');
    expect(result).toMatch(/^#[0-9a-f]{6}$/);

    // Mono should desaturate: RGB values should be closer together
    const [r, g, b] = hexToRgb(result);
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    expect(spread).toBeLessThan(100); // Much less spread than pure red
  });

  it('light: transforms hex colors through light pipeline', () => {
    const transform = createPtyTransform('light');
    expect(transform).toBeDefined();

    const result = transform!('#ffffff');
    expect(result).toMatch(/^#[0-9a-f]{6}$/);

    // Light transform should darken white for readability
    const [r, g, b] = hexToRgb(result);
    expect(r).toBeLessThan(200);
    expect(g).toBeLessThan(200);
    expect(b).toBeLessThan(200);
  });

  it('identity: returns undefined (no transform needed)', () => {
    const transform = createPtyTransform('identity');
    expect(transform).toBeUndefined();
  });

  it('custom: accepts a custom transform function', () => {
    const invert: PtyColorTransform = (hex) => {
      const [r, g, b] = hexToRgb(hex);
      return rgbToHex(255 - r, 255 - g, 255 - b);
    };
    const transform = createPtyTransform('custom', invert);
    expect(transform).toBeDefined();
    expect(transform!('#000000')).toBe('#ffffff');
    expect(transform!('#ffffff')).toBe('#000000');
  });

  it('custom: throws if no function provided', () => {
    expect(() => createPtyTransform('custom')).toThrow();
  });
});

describe('createPtyThemeTransform', () => {
  it('returns undefined for identity with no ANSI remap', () => {
    expect(createPtyThemeTransform({ variant: 'identity' })).toBeUndefined();
  });

  it('returns an ANSI remap when only a palette is configured', () => {
    const palette = Array.from({ length: 16 }, (_, index) => `#${index.toString(16).repeat(6).slice(0, 6)}`);
    const transform = createPtyThemeTransform({ variant: 'identity', ansi16: palette })!;
    expect(transform('#000000')).toBe('#000000');
    expect(transform('#800000')).toBe('#111111');
  });

  it('runs ANSI remap before variant transform', () => {
    const palette = [
      '#ffffff',
      '#800000',
      '#008000',
      '#808000',
      '#000080',
      '#800080',
      '#008080',
      '#c0c0c0',
      '#808080',
      '#ff0000',
      '#00ff00',
      '#ffff00',
      '#0000ff',
      '#ff00ff',
      '#00ffff',
      '#ffffff',
    ];
    const transform = createPtyThemeTransform({ variant: 'light', ansi16: palette })!;
    expect(transform('#000000')).toBe(createPtyTransform('light')!('#ffffff'));
  });
});

// ─── createAnsi16Remap ──────────────────────────────────────────────────────

describe('createAnsi16Remap', () => {
  const defaultPalette: readonly string[] = [
    '#000000',
    '#cd3131',
    '#0dbc79',
    '#e5e510',
    '#2472c8',
    '#bc3fbc',
    '#11a8cd',
    '#cccccc',
    '#666666',
    '#f14c4c',
    '#23d18b',
    '#f5f543',
    '#3b8eea',
    '#d670d6',
    '#29b8db',
    '#f2f2f2',
  ];

  it('creates a remap function from a 16-color palette', () => {
    const remap = createAnsi16Remap(defaultPalette);
    expect(typeof remap).toBe('function');
  });

  it('maps ANSI black (#000000) to palette[0]', () => {
    const customPalette = [...defaultPalette];
    customPalette[0] = '#1a1a2e'; // Custom black
    const remap = createAnsi16Remap(customPalette);
    expect(remap('#000000')).toBe('#1a1a2e');
  });

  it('maps standard ANSI red (#800000 / #aa0000) to palette[1]', () => {
    const customPalette = [...defaultPalette];
    customPalette[1] = '#ff4444'; // Custom red
    const remap = createAnsi16Remap(customPalette);
    // Standard ANSI red is typically 128,0,0 — should map to index 1
    expect(remap('#800000')).toBe('#ff4444');
  });

  it('passes through colors that do not match any ANSI 16 color', () => {
    const remap = createAnsi16Remap(defaultPalette);
    // Arbitrary color not in ANSI 16 standard
    const result = remap('#a05030');
    // Should return the original color since it's not a standard ANSI color
    expect(result).toBe('#a05030');
  });

  it('maps all 16 standard ANSI colors', () => {
    const standardAnsi16: readonly string[] = [
      '#000000',
      '#800000',
      '#008000',
      '#808000',
      '#000080',
      '#800080',
      '#008080',
      '#c0c0c0',
      '#808080',
      '#ff0000',
      '#00ff00',
      '#ffff00',
      '#0000ff',
      '#ff00ff',
      '#00ffff',
      '#ffffff',
    ];
    const remap = createAnsi16Remap(defaultPalette);
    for (let i = 0; i < 16; i++) {
      expect(remap(standardAnsi16[i]!)).toBe(defaultPalette[i]);
    }
  });

  it('requires exactly 16 colors', () => {
    expect(() => createAnsi16Remap(['#000000'])).toThrow();
    expect(() => createAnsi16Remap(Array(15).fill('#000000'))).toThrow();
    expect(() => createAnsi16Remap(Array(17).fill('#000000'))).toThrow();
  });
});

// ─── PtyThemeConfig integration ─────────────────────────────────────────────

describe('PtyThemeConfig', () => {
  it('can define a full PTY theme config', () => {
    const config: PtyThemeConfig = {
      variant: 'sepia',
      ansi16: [
        '#1a1a2e',
        '#cd3131',
        '#0dbc79',
        '#e5e510',
        '#2472c8',
        '#bc3fbc',
        '#11a8cd',
        '#cccccc',
        '#666666',
        '#f14c4c',
        '#23d18b',
        '#f5f543',
        '#3b8eea',
        '#d670d6',
        '#29b8db',
        '#f2f2f2',
      ],
    };
    expect(config.variant).toBe('sepia');
    expect(config.ansi16).toHaveLength(16);
  });

  it('works with just variant (no ansi16)', () => {
    const config: PtyThemeConfig = { variant: 'mono' };
    expect(config.variant).toBe('mono');
    expect(config.ansi16).toBeUndefined();
  });

  it('works with custom transform function', () => {
    const config: PtyThemeConfig = {
      variant: 'custom',
      colorTransform: (hex) => hex, // identity
    };
    expect(config.variant).toBe('custom');
    expect(config.colorTransform).toBeDefined();
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles empty string gracefully', () => {
    // hexToRgb with empty/invalid should return [0,0,0] (fallback)
    const [r, g, b] = hexToRgb('');
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('sepia transform is idempotent for black', () => {
    const transform = createPtyTransform('sepia')!;
    expect(transform('#000000')).toBe('#000000');
  });

  it('mono transform is idempotent for pure gray', () => {
    const transform = createPtyTransform('mono')!;
    expect(transform('#808080')).toBe('#808080');
  });

  it('transforms handle 3-digit hex shorthand', () => {
    const transform = createPtyTransform('sepia')!;
    const result = transform('#fff');
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });
});
