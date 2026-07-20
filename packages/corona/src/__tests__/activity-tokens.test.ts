import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Color } from '../color.js';
import {
  ACTIVITY_GLYPHS,
  ACTIVITY_TOKEN_VALUES,
  type ActivityState,
  activityFamily,
  activityTokens,
  resolveActivity,
  resolveDomainTokens,
  resolveFamilyGlyph,
} from '../domain-tokens.js';
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

const STATES: readonly ActivityState[] = ['idle', 'pending', 'streaming', 'working', 'succeeded', 'failed'];

describe('activityTokens', () => {
  for (const { name, theme } of VARIANTS) {
    it(`resolves a descriptor for every activity state against ${name}`, () => {
      const resolved = resolveDomainTokens(activityTokens, theme());
      for (const key of STATES) {
        expect(isColor(resolved[key].color)).toBe(true);
        expect(typeof resolved[key].motion).toBe('string');
        expect(typeof resolved[key].intensity).toBe('number');
      }
    });
  }

  it('has the documented default motions and intensities', () => {
    const resolved = resolveDomainTokens(activityTokens, defaultTheme);
    expect(resolved.idle.motion).toBe('none');
    expect(resolved.idle.intensity).toBe(0.0);
    expect(resolved.pending.motion).toBe('breathe');
    expect(resolved.pending.intensity).toBeCloseTo(0.4);
    expect(resolved.streaming.motion).toBe('shimmer');
    expect(resolved.streaming.intensity).toBeCloseTo(0.7);
    expect(resolved.working.motion).toBe('pulse');
    expect(resolved.working.intensity).toBeCloseTo(0.6);
    expect(resolved.succeeded.motion).toBe('none');
    expect(resolved.succeeded.intensity).toBe(1.0);
    expect(resolved.failed.motion).toBe('none');
    expect(resolved.failed.intensity).toBe(1.0);
  });
});

describe('resolveActivity', () => {
  const originalEnv: Record<string, string | undefined> = {};

  function setEnv(key: string, value: string | undefined) {
    if (!(key in originalEnv)) originalEnv[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  beforeEach(() => {
    setEnv('NO_MOTION', undefined);
    setEnv('REDUCE_MOTION', undefined);
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(originalEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
    Object.keys(originalEnv).forEach((k) => delete originalEnv[k]);
  });

  it('preserves motions when respectReduceMotion is not set', () => {
    const result = resolveActivity(defaultTheme);
    expect(result.streaming.motion).toBe('shimmer');
    expect(result.working.motion).toBe('pulse');
    expect(result.pending.motion).toBe('breathe');
  });

  it('preserves motions when respectReduceMotion is true but env is not set', () => {
    const result = resolveActivity(defaultTheme, { respectReduceMotion: true });
    expect(result.streaming.motion).toBe('shimmer');
    expect(result.working.motion).toBe('pulse');
    expect(result.pending.motion).toBe('breathe');
  });

  it('collapses every motion to "none" when respectReduceMotion is true and REDUCE_MOTION is set', () => {
    setEnv('REDUCE_MOTION', '1');
    const result = resolveActivity(defaultTheme, { respectReduceMotion: true });
    for (const key of STATES) {
      expect(result[key].motion).toBe('none');
    }
  });

  it('still keeps the colour and intensity when motion is collapsed', () => {
    setEnv('REDUCE_MOTION', '1');
    const baseline = resolveDomainTokens(activityTokens, defaultTheme);
    const result = resolveActivity(defaultTheme, { respectReduceMotion: true });
    for (const key of STATES) {
      expect(result[key].color).toEqual(baseline[key].color);
      expect(result[key].intensity).toBe(baseline[key].intensity);
    }
  });

  it('does not collapse motion when respectReduceMotion is false even with env set', () => {
    setEnv('REDUCE_MOTION', '1');
    const result = resolveActivity(defaultTheme, { respectReduceMotion: false });
    expect(result.streaming.motion).toBe('shimmer');
  });

  for (const { name, theme } of VARIANTS) {
    it(`resolves activity descriptors with valid colors against ${name}`, () => {
      const result = resolveActivity(theme());
      for (const key of STATES) {
        expect(isColor(result[key].color)).toBe(true);
      }
    });
  }
});

describe('activityFamily and ACTIVITY_GLYPHS', () => {
  it('declares name "activity" and the canonical value list', () => {
    expect(activityFamily.name).toBe('activity');
    expect([...activityFamily.values]).toEqual([...ACTIVITY_TOKEN_VALUES]);
  });

  it('narrows known/unknown values via isValue', () => {
    expect(activityFamily.isValue('streaming')).toBe(true);
    expect(activityFamily.isValue('garbage')).toBe(false);
    expect(activityFamily.isValue(42)).toBe(false);
  });

  it('exposes a glyph triple in ACTIVITY_GLYPHS for every state', () => {
    for (const value of ACTIVITY_TOKEN_VALUES) {
      const triple = ACTIVITY_GLYPHS[value];
      expect(triple.level1.length).toBeGreaterThan(0);
      expect(triple.level2.length).toBeGreaterThan(0);
      expect(typeof triple.level3).toBe('string');
    }
  });

  it('returns single-character level1 glyphs for tabular layout safety', () => {
    for (const value of ACTIVITY_TOKEN_VALUES) {
      expect(ACTIVITY_GLYPHS[value].level1.length).toBe(1);
    }
  });

  it('resolveFamilyGlyph returns the level1/level2 glyph appropriately', () => {
    expect(resolveFamilyGlyph(activityFamily, 'succeeded', 1)).toBe('+');
    expect(resolveFamilyGlyph(activityFamily, 'succeeded', 2)).toBe('✓');
    expect(resolveFamilyGlyph(activityFamily, 'failed', 1)).toBe('!');
    expect(resolveFamilyGlyph(activityFamily, 'failed', 2)).toBe('✗');
  });

  it('resolveFamilyGlyph at level 3 falls back to level 2 (level3 currently empty)', () => {
    for (const value of ACTIVITY_TOKEN_VALUES) {
      expect(resolveFamilyGlyph(activityFamily, value, 3)).toBe(ACTIVITY_GLYPHS[value].level2);
    }
  });
});
