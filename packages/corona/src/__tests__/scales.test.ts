import { describe, expect, it } from 'vitest';
import { color } from '../color.js';
import { createTheme, defaultTheme, generateScale, resolveScale, SCALE_STEPS } from '../theme.js';

describe('generateScale', () => {
  it('produces all 10 scale steps', () => {
    const scale = generateScale(color.hex('#60a5fa'));
    expect(SCALE_STEPS).toHaveLength(10);
    for (const step of SCALE_STEPS) {
      expect(scale[step]).toBeDefined();
      expect(typeof scale[step].fg).toBe('function');
    }
  });

  it('SCALE_STEPS contains 50,100,200,300,400,500,600,700,800,900', () => {
    expect([...SCALE_STEPS]).toEqual([50, 100, 200, 300, 400, 500, 600, 700, 800, 900]);
  });

  it('step 400 is the base color (anchor)', () => {
    const base = color.hex('#60a5fa');
    const scale = generateScale(base);
    // Step 400 should be the input color unchanged
    expect(scale[400].rgb).toEqual(base.rgb);
  });

  it('new steps 300, 500, 700 are valid Color objects', () => {
    const scale = generateScale(color.hex('#60a5fa'));
    expect(scale[300]).toBeDefined();
    expect(typeof scale[300].fg).toBe('function');
    expect(scale[500]).toBeDefined();
    expect(typeof scale[500].fg).toBe('function');
    expect(scale[700]).toBeDefined();
    expect(typeof scale[700].fg).toBe('function');
  });

  it('step 300 lightness is between step 200 and step 400', () => {
    const scale = generateScale(color.hex('#60a5fa'));
    const lum200 = color.luminance(scale[200]);
    const lum300 = color.luminance(scale[300]);
    const lum400 = color.luminance(scale[400]);
    expect(lum300).toBeLessThanOrEqual(lum200 + 0.001);
    expect(lum300).toBeGreaterThanOrEqual(lum400 - 0.001);
  });

  it('step 500 lightness is between step 400 and step 600', () => {
    const scale = generateScale(color.hex('#60a5fa'));
    const lum400 = color.luminance(scale[400]);
    const lum500 = color.luminance(scale[500]);
    const lum600 = color.luminance(scale[600]);
    expect(lum500).toBeLessThanOrEqual(lum400 + 0.001);
    expect(lum500).toBeGreaterThanOrEqual(lum600 - 0.001);
  });

  it('step 700 lightness is between step 600 and step 800', () => {
    const scale = generateScale(color.hex('#60a5fa'));
    const lum600 = color.luminance(scale[600]);
    const lum700 = color.luminance(scale[700]);
    const lum800 = color.luminance(scale[800]);
    expect(lum700).toBeLessThanOrEqual(lum600 + 0.001);
    expect(lum700).toBeGreaterThanOrEqual(lum800 - 0.001);
  });

  it('lightness monotonically decreases from step 50 to step 900', () => {
    const scale = generateScale(color.hex('#60a5fa'));
    const luminances = SCALE_STEPS.map((step) => color.luminance(scale[step]));
    for (let i = 1; i < luminances.length; i++) {
      expect(luminances[i]!).toBeLessThanOrEqual(luminances[i - 1]! + 0.001);
    }
  });

  it('works with a warm color (red-family)', () => {
    const scale = generateScale(color.hex('#f87171'));
    const luminances = SCALE_STEPS.map((step) => color.luminance(scale[step]));
    for (let i = 1; i < luminances.length; i++) {
      expect(luminances[i]!).toBeLessThanOrEqual(luminances[i - 1]! + 0.001);
    }
  });

  it('works with a cool color (green-family)', () => {
    const scale = generateScale(color.hex('#34d399'));
    const luminances = SCALE_STEPS.map((step) => color.luminance(scale[step]));
    for (let i = 1; i < luminances.length; i++) {
      expect(luminances[i]!).toBeLessThanOrEqual(luminances[i - 1]! + 0.001);
    }
  });

  it('handles very light base color (L > 0.85)', () => {
    const lightBase = color.hex('#e0e7ff');
    const scale = generateScale(lightBase);
    // Should still produce valid colors for all steps
    for (const step of SCALE_STEPS) {
      expect(scale[step].rgb).not.toBeNull();
    }
    // Lightness should still be monotonically decreasing
    const luminances = SCALE_STEPS.map((step) => color.luminance(scale[step]));
    for (let i = 1; i < luminances.length; i++) {
      expect(luminances[i]!).toBeLessThanOrEqual(luminances[i - 1]! + 0.001);
    }
  });

  it('handles very dark base color (L < 0.25)', () => {
    const darkBase = color.hex('#1e1b4b');
    const scale = generateScale(darkBase);
    for (const step of SCALE_STEPS) {
      expect(scale[step].rgb).not.toBeNull();
    }
    const luminances = SCALE_STEPS.map((step) => color.luminance(scale[step]));
    for (let i = 1; i < luminances.length; i++) {
      expect(luminances[i]!).toBeLessThanOrEqual(luminances[i - 1]! + 0.001);
    }
  });

  it('handles achromatic (gray) color', () => {
    const gray = color.hex('#808080');
    const scale = generateScale(gray);
    for (const step of SCALE_STEPS) {
      expect(scale[step].rgb).not.toBeNull();
    }
  });

  it('falls back gracefully for ANSI-16 colors', () => {
    // ANSI-16 colors have rgb but might have less precision
    const scale = generateScale(color.cyan);
    for (const step of SCALE_STEPS) {
      expect(scale[step]).toBeDefined();
      expect(typeof scale[step].fg).toBe('function');
    }
  });

  it('new steps work correctly for all color families', () => {
    const bases = [
      color.hex('#60a5fa'), // blue
      color.hex('#f87171'), // red
      color.hex('#34d399'), // green
      color.hex('#fbbf24'), // yellow
      color.hex('#a78bfa'), // purple
    ];
    for (const base of bases) {
      const scale = generateScale(base);
      // All 10 steps should exist
      expect(scale[300]).toBeDefined();
      expect(scale[500]).toBeDefined();
      expect(scale[700]).toBeDefined();
      // Monotonic lightness
      const luminances = SCALE_STEPS.map((step) => color.luminance(scale[step]));
      for (let i = 1; i < luminances.length; i++) {
        expect(luminances[i]!).toBeLessThanOrEqual(luminances[i - 1]! + 0.001);
      }
    }
  });

  it('sample(0) returns step 50 color', () => {
    const scale = generateScale(color.hex('#60a5fa'));
    const sampled = scale.sample(0);
    expect(sampled.rgb).toEqual(scale[50].rgb);
  });

  it('sample(1) returns step 900 color', () => {
    const scale = generateScale(color.hex('#60a5fa'));
    const sampled = scale.sample(1);
    expect(sampled.rgb).toEqual(scale[900].rgb);
  });

  it('sample(0.5) returns a color between lightest and darkest', () => {
    const scale = generateScale(color.hex('#60a5fa'));
    const sampled = scale.sample(0.5);
    const lum = color.luminance(sampled);
    const lum50 = color.luminance(scale[50]);
    const lum900 = color.luminance(scale[900]);
    expect(lum).toBeLessThanOrEqual(lum50 + 0.001);
    expect(lum).toBeGreaterThanOrEqual(lum900 - 0.001);
  });

  it('sample clamps t to [0, 1]', () => {
    const scale = generateScale(color.hex('#60a5fa'));
    expect(scale.sample(-1).rgb).toEqual(scale[50].rgb);
    expect(scale.sample(2).rgb).toEqual(scale[900].rgb);
  });

  it('sample interpolates smoothly across 10 steps', () => {
    const scale = generateScale(color.hex('#60a5fa'));
    // With 10 steps, each step boundary is at t = n/9
    // t=0 → step 50, t=1/9 → step 100, ..., t=9/9 → step 900
    const step100Color = scale.sample(1 / 9);
    expect(step100Color.rgb).toEqual(scale[100].rgb);
    const step900Color = scale.sample(9 / 9);
    expect(step900Color.rgb).toEqual(scale[900].rgb);
  });
});

describe('createTheme scales integration', () => {
  it('createTheme() output includes scales for all 6 tones with 10 steps each', () => {
    const t = createTheme();
    const tones = ['neutral', 'accent', 'info', 'success', 'warning', 'danger'] as const;
    for (const tone of tones) {
      expect(t.scales[tone]).toBeDefined();
      for (const step of SCALE_STEPS) {
        expect(t.scales[tone][step]).toBeDefined();
      }
    }
  });

  it('scale step 400 matches the tone color', () => {
    const t = createTheme();
    const tones = ['neutral', 'accent', 'info', 'success', 'warning', 'danger'] as const;
    for (const tone of tones) {
      expect(t.scales[tone][400].rgb).toEqual(t.colors.tones[tone].rgb);
    }
  });

  it('overriding a tone cascades into its scale (including new steps)', () => {
    const customAccent = color.hex('#a78bfa');
    const t = createTheme({ colors: { tones: { accent: customAccent } } });
    expect(t.scales.accent[400].rgb).toEqual(customAccent.rgb);
    // New steps should also be derived from custom accent
    expect(t.scales.accent[300]).toBeDefined();
    expect(t.scales.accent[500]).toBeDefined();
    expect(t.scales.accent[700]).toBeDefined();
    // Other tone scales unchanged
    expect(t.scales.danger[400].rgb).toEqual(defaultTheme.colors.tones.danger.rgb);
  });

  it('scales are readonly (frozen)', () => {
    const t = createTheme();
    expect(() => {
      (t.scales as any).accent = null;
    }).toThrow();
  });
});

describe('resolveScale', () => {
  it('resolves a scale step from a SemanticTheme', () => {
    const t = createTheme();
    const resolved = resolveScale(t, 'accent', 400);
    expect(resolved.rgb).toEqual(t.colors.tones.accent.rgb);
  });

  it('resolves new steps (300, 500, 700) from a SemanticTheme', () => {
    const t = createTheme();
    const r300 = resolveScale(t, 'accent', 300);
    const r500 = resolveScale(t, 'accent', 500);
    const r700 = resolveScale(t, 'accent', 700);
    expect(r300).toBeDefined();
    expect(r500).toBeDefined();
    expect(r700).toBeDefined();
    // Lightness ordering: 300 > 500 > 700
    expect(color.luminance(r300)).toBeGreaterThan(color.luminance(r500));
    expect(color.luminance(r500)).toBeGreaterThan(color.luminance(r700));
  });

  it('resolves a scale step from a ThemeInput', () => {
    const customAccent = color.hex('#a78bfa');
    const input = { colors: { tones: { accent: customAccent } } };
    const resolved = resolveScale(input, 'accent', 400);
    expect(resolved.rgb).toEqual(customAccent.rgb);
  });

  it('resolves from undefined uses default theme', () => {
    const resolved = resolveScale(undefined, 'accent', 400);
    expect(resolved.rgb).toEqual(defaultTheme.colors.tones.accent.rgb);
  });

  it('resolves different steps correctly', () => {
    const t = createTheme();
    const light = resolveScale(t, 'accent', 50);
    const dark = resolveScale(t, 'accent', 900);
    expect(color.luminance(light)).toBeGreaterThan(color.luminance(dark));
  });
});
