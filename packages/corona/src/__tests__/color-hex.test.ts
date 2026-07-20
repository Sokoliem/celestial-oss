import { describe, expect, it } from 'vitest';
import { type Color, color, colorToHex } from '../color.js';

describe('colorToHex', () => {
  it('formats a basic hex color as #rrggbb lowercase', () => {
    expect(colorToHex(color.hex('#ff8040'))).toBe('#ff8040');
    expect(colorToHex(color.hex('#000000'))).toBe('#000000');
    expect(colorToHex(color.hex('#ffffff'))).toBe('#ffffff');
  });

  it('round-trips RGB constructors', () => {
    expect(colorToHex(color.rgb(255, 128, 64))).toBe('#ff8040');
    expect(colorToHex(color.rgb(0, 0, 0))).toBe('#000000');
    expect(colorToHex(color.rgb(255, 255, 255))).toBe('#ffffff');
  });

  it('zero-pads single-digit hex values', () => {
    expect(colorToHex(color.rgb(1, 2, 3))).toBe('#010203');
    expect(colorToHex(color.rgb(15, 16, 17))).toBe('#0f1011');
  });

  it('produces a valid hex string for OKLCh colors', () => {
    const c = color.oklch(0.6, 0.15, 200);
    expect(colorToHex(c)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('returns #000000 when the color has no rgb projection', () => {
    const stub: Color = {
      fg: () => '',
      bg: () => '',
      degrade: () => stub,
      equals: () => false,
      rgb: null,
      oklab: null,
      oklch: null,
      level: 'none',
    };
    expect(colorToHex(stub)).toBe('#000000');
  });
});
