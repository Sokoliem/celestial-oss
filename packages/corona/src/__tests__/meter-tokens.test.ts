import { describe, expect, it } from 'vitest';
import type { Color } from '../color.js';
import { interpolateMeter, meterLevel, meterTokens, resolveDomainTokens } from '../domain-tokens.js';
import { applyVariant, darkVariant, defaultTheme, highContrastVariant, lightVariant, type SemanticTheme } from '../theme.js';

function isColor(c: unknown): c is Color {
  return c !== null && typeof c === 'object' && 'fg' in c && 'bg' in c;
}

const VARIANTS: Array<{ name: string; theme: () => SemanticTheme }> = [
  { name: 'defaultTheme', theme: () => defaultTheme },
  { name: 'lightVariant', theme: () => applyVariant(defaultTheme, lightVariant) },
  { name: 'darkVariant', theme: () => applyVariant(defaultTheme, darkVariant) },
  { name: 'highContrastVariant', theme: () => applyVariant(defaultTheme, highContrastVariant) },
];

function oklchDistance(a: Color, b: Color): number {
  const la = a.oklch ?? [0, 0, 0];
  const lb = b.oklch ?? [0, 0, 0];
  const dl = la[0] - lb[0];
  const dc = la[1] - lb[1];
  let dh = la[2] - lb[2];
  if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  return Math.sqrt(dl * dl + dc * dc + (dh / 360) * (dh / 360));
}

describe('meterLevel', () => {
  it('classifies endpoints', () => {
    expect(meterLevel(0)).toBe('cold');
    expect(meterLevel(1)).toBe('critical');
    expect(meterLevel(0.99)).toBe('critical');
  });

  it('classifies midpoints', () => {
    expect(meterLevel(0.1)).toBe('cold');
    expect(meterLevel(0.3)).toBe('cool');
    expect(meterLevel(0.5)).toBe('warm');
    expect(meterLevel(0.7)).toBe('hot');
    expect(meterLevel(0.9)).toBe('critical');
  });

  it('clamps out-of-range input', () => {
    expect(meterLevel(-1)).toBe('cold');
    expect(meterLevel(2)).toBe('critical');
  });

  it('treats non-finite as cold', () => {
    expect(meterLevel(Number.NaN)).toBe('cold');
  });
});

describe('meterTokens', () => {
  for (const { name, theme } of VARIANTS) {
    it(`resolves a Color for every meter level against ${name}`, () => {
      const resolved = resolveDomainTokens(meterTokens, theme());
      for (const key of ['cold', 'cool', 'warm', 'hot', 'critical'] as const) {
        expect(isColor(resolved[key])).toBe(true);
      }
    });
  }
});

describe('interpolateMeter', () => {
  it('returns the cold stop at t=0', () => {
    const resolved = resolveDomainTokens(meterTokens, defaultTheme);
    const sample = interpolateMeter(0, defaultTheme);
    expect(sample.rgb).toEqual(resolved.cold.rgb);
  });

  it('returns the critical stop at t=1', () => {
    const resolved = resolveDomainTokens(meterTokens, defaultTheme);
    const sample = interpolateMeter(1, defaultTheme);
    expect(sample.rgb).toEqual(resolved.critical.rgb);
  });

  it('clamps out-of-range t to endpoints', () => {
    const resolved = resolveDomainTokens(meterTokens, defaultTheme);
    expect(interpolateMeter(-0.5, defaultTheme).rgb).toEqual(resolved.cold.rgb);
    expect(interpolateMeter(1.5, defaultTheme).rgb).toEqual(resolved.critical.rgb);
  });

  it('mid-band sample sits between adjacent stops in OKLCh distance', () => {
    const resolved = resolveDomainTokens(meterTokens, defaultTheme);
    const t = 0.375;
    const sample = interpolateMeter(t, defaultTheme);
    const dToCool = oklchDistance(sample, resolved.cool);
    const dToWarm = oklchDistance(sample, resolved.warm);
    const dColdCritical = oklchDistance(resolved.cold, resolved.critical);
    expect(dToCool).toBeLessThan(dColdCritical);
    expect(dToWarm).toBeLessThan(dColdCritical);
  });

  it('respects overrides on the resolved palette', () => {
    const override = defaultTheme.colors.tones.danger;
    const sample = interpolateMeter(0, defaultTheme, { cold: override });
    expect(sample.rgb).toEqual(override.rgb);
  });

  it('produces colors at intermediate stops', () => {
    const sampleAtCool = interpolateMeter(0.25, defaultTheme);
    const resolved = resolveDomainTokens(meterTokens, defaultTheme);
    expect(sampleAtCool.rgb).toEqual(resolved.cool.rgb);
  });
});
