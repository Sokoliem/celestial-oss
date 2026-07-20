import { describe, expect, it } from 'vitest';
import { accentMix, type Color, color, HUE_ANCHORS, type HueName } from '../color.js';
import { applyVariant, defaultTheme, lightVariant } from '../theme.js';

function oklchDistance(a: Color, b: Color): number {
  const la = a.oklch ?? [0, 0, 0];
  const lb = b.oklch ?? [0, 0, 0];
  let dh = la[2] - lb[2];
  if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  return Math.sqrt((la[0] - lb[0]) ** 2 + (la[1] - lb[1]) ** 2 + (dh / 360) ** 2);
}

describe('accentMix', () => {
  it('ratio 0 returns the theme accent', () => {
    const result = accentMix(defaultTheme, 'blue', 0);
    expect(oklchDistance(result, defaultTheme.colors.tones.accent)).toBeLessThan(0.01);
  });

  it('ratio 1 returns the named hue anchor', () => {
    const result = accentMix(defaultTheme, 'blue', 1);
    expect(oklchDistance(result, HUE_ANCHORS.blue)).toBeLessThan(0.01);
  });

  it('default ratio is 0.3 (between accent and anchor)', () => {
    const result = accentMix(defaultTheme, 'blue');
    const accent = defaultTheme.colors.tones.accent;
    expect(oklchDistance(result, accent)).toBeGreaterThan(0);
    expect(oklchDistance(result, HUE_ANCHORS.blue)).toBeGreaterThan(0);
  });

  it('produces a contrast-AA color against the light surface for amber footer-tile case', () => {
    const lightTheme = applyVariant(defaultTheme, lightVariant);
    const tinted = accentMix(lightTheme, 'amber', 0.3);
    expect(color.contrastRatio(tinted, lightTheme.colors.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('returns a Color for every hue × ratio smoke combination', () => {
    const hues: HueName[] = ['red', 'amber', 'green', 'cyan', 'blue', 'violet', 'pink'];
    const ratios = [0, 0.5, 1];
    for (const hue of hues) {
      for (const ratio of ratios) {
        const result = accentMix(defaultTheme, hue, ratio);
        expect(result).toBeDefined();
        expect(typeof result.fg).toBe('function');
        expect(result.rgb).not.toBeNull();
      }
    }
  });
});

describe('HUE_ANCHORS', () => {
  it('exposes the seven named hues', () => {
    const keys = Object.keys(HUE_ANCHORS).sort();
    expect(keys).toEqual(['amber', 'blue', 'cyan', 'green', 'pink', 'red', 'violet']);
  });

  it('every anchor has a valid OKLCh representation', () => {
    for (const key of Object.keys(HUE_ANCHORS) as HueName[]) {
      const anchor = HUE_ANCHORS[key];
      expect(anchor.oklch).not.toBeNull();
    }
  });
});
