/**
 * Tests for interpolateTheme — dynamic theme interpolation in OKLAB space.
 */
import { describe, expect, it } from 'vitest';
import { color } from '../color.js';
import { applyVariant, createTheme, darkVariant, defaultTheme, interpolateTheme } from '../theme.js';

describe('interpolateTheme', () => {
  const light = defaultTheme;
  const dark = applyVariant(defaultTheme, darkVariant);

  describe('boundary values', () => {
    it('t=0 returns from theme colors', () => {
      const result = interpolateTheme(light, dark, 0);
      expect(result.colors.text.rgb).toEqual(light.colors.text.rgb);
    });

    it('t=1 returns to theme colors', () => {
      const result = interpolateTheme(light, dark, 1);
      expect(result.colors.text.rgb).toEqual(dark.colors.text.rgb);
    });

    it('t < 0 clamps to 0', () => {
      const result = interpolateTheme(light, dark, -5);
      expect(result.colors.text.rgb).toEqual(light.colors.text.rgb);
    });

    it('t > 1 clamps to 1', () => {
      const result = interpolateTheme(light, dark, 10);
      expect(result.colors.text.rgb).toEqual(dark.colors.text.rgb);
    });
  });

  describe('color interpolation', () => {
    it('midpoint produces a color between from and to', () => {
      const from = createTheme({ colors: { text: color.rgb(0, 0, 0) } });
      const to = createTheme({ colors: { text: color.rgb(255, 255, 255) } });
      const mid = interpolateTheme(from, to, 0.5);
      // Midpoint should be between 0 and 255
      expect(mid.colors.text.rgb![0]).toBeGreaterThan(50);
      expect(mid.colors.text.rgb![0]).toBeLessThan(230);
    });

    it('interpolates in OKLAB (not naive RGB)', () => {
      const from = createTheme({ colors: { text: color.rgb(0, 0, 0) } });
      const to = createTheme({ colors: { text: color.rgb(255, 255, 255) } });
      const mid = interpolateTheme(from, to, 0.5);
      // OKLAB midpoint of black-to-white is NOT 128,128,128
      const r = mid.colors.text.rgb![0];
      expect(r).not.toBe(128);
    });

    it('interpolates tone colors', () => {
      const from = createTheme({ colors: { tones: { accent: color.rgb(0, 0, 0) } } });
      const to = createTheme({ colors: { tones: { accent: color.rgb(255, 255, 255) } } });
      const result = interpolateTheme(from, to, 0.5);
      expect(result.colors.tones.accent.rgb).not.toBeNull();
      // Should differ from both endpoints
      expect(result.colors.tones.accent.rgb![0]).toBeGreaterThan(50);
      expect(result.colors.tones.accent.rgb![0]).toBeLessThan(230);
    });
  });

  describe('number interpolation', () => {
    it('spacing values interpolate linearly', () => {
      const from = createTheme({ spacing: { md: 2 } });
      const to = createTheme({ spacing: { md: 10 } });
      const mid = interpolateTheme(from, to, 0.5);
      expect(mid.spacing.md).toBe(6);
    });

    it('elevation numeric values interpolate linearly', () => {
      const result = interpolateTheme(light, dark, 0.5);
      const fromE = light.elevation.raised.elevation;
      const toE = dark.elevation.raised.elevation;
      expect(result.elevation.raised.elevation).toBe(fromE + (toE - fromE) * 0.5);
    });
  });

  describe('non-interpolatable values', () => {
    it('glyphs snap at t=0.5', () => {
      const from = createTheme({ glyphs: { pointer: '>' } });
      const to = createTheme({ glyphs: { pointer: '\u2192' } });

      const before = interpolateTheme(from, to, 0.4);
      expect(before.glyphs.pointer).toBe('>');

      const after = interpolateTheme(from, to, 0.6);
      expect(after.glyphs.pointer).toBe('\u2192');
    });

    it('typography booleans snap', () => {
      const from = createTheme({});
      const to = createTheme({});
      const mid = interpolateTheme(from, to, 0.5);
      expect(typeof mid.typography.heading.bold).toBe('boolean');
    });
  });

  describe('typography color interpolation', () => {
    it('typography color values are interpolated', () => {
      const result = interpolateTheme(light, dark, 0.5);
      expect(result.typography.heading.color).toBeDefined();
      expect(result.typography.heading.color.rgb).not.toBeNull();
    });
  });

  describe('states interpolation', () => {
    it('state fg colors are interpolated', () => {
      const result = interpolateTheme(light, dark, 0.5);
      expect(result.states.hover.fg.rgb).not.toBeNull();
    });

    it('state fg is between endpoints', () => {
      const from = createTheme({ colors: { text: color.rgb(0, 0, 0) } });
      const to = createTheme({ colors: { text: color.rgb(255, 255, 255) } });
      const result = interpolateTheme(from, to, 0.5);
      // Hover fg derives from text; interpolated should be between endpoints
      expect(result.states.hover.fg.rgb).not.toBeNull();
      expect(result.states.hover.fg.rgb![0]).toBeGreaterThan(50);
      expect(result.states.hover.fg.rgb![0]).toBeLessThan(230);
    });
  });

  describe('scales (ColorScale) handling', () => {
    it('scales snap at t < 0.5 (from theme)', () => {
      const result = interpolateTheme(light, dark, 0.3);
      // ColorScale should snap to from theme
      expect(result.scales.accent[500].rgb).toEqual(light.scales.accent[500].rgb);
    });

    it('scales snap at t >= 0.5 (to theme)', () => {
      const result = interpolateTheme(light, dark, 0.7);
      expect(result.scales.accent[500].rgb).toEqual(dark.scales.accent[500].rgb);
    });
  });

  describe('motion interpolation', () => {
    it('motion duration values interpolate linearly', () => {
      const result = interpolateTheme(light, dark, 0.5);
      const expected = light.motion.duration.fast + (dark.motion.duration.fast - light.motion.duration.fast) * 0.5;
      expect(result.motion.duration.fast).toBe(expected);
    });

    it('easing functions snap at threshold', () => {
      const result = interpolateTheme(light, dark, 0.3);
      // Easing functions are non-interpolatable — snap to from
      expect(typeof result.motion.easing.default).toBe('function');
      expect(result.motion.easing.default).toBe(light.motion.easing.default);
    });

    it('reduceMotion boolean snaps', () => {
      const result = interpolateTheme(light, dark, 0.5);
      expect(typeof result.motion.reduceMotion).toBe('boolean');
    });
  });

  describe('result is a valid SemanticTheme', () => {
    it('has all required top-level keys', () => {
      const result = interpolateTheme(light, dark, 0.5);
      expect(result.colors).toBeDefined();
      expect(result.spacing).toBeDefined();
      expect(result.glyphs).toBeDefined();
      expect(result.scales).toBeDefined();
      expect(result.typography).toBeDefined();
      expect(result.states).toBeDefined();
      expect(result.elevation).toBeDefined();
      expect(result.motion).toBeDefined();
    });
  });
});
