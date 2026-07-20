import { describe, expect, it } from 'vitest';
import { type Color, color } from '../color.js';
import {
  defineDomainTokens,
  PHASE_GLYPHS,
  PHASE_TOKEN_VALUES,
  phaseFamily,
  phaseTokens,
  resolveDomainTokens,
  resolveFamilyGlyph,
  type SessionPhase,
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

describe('phaseTokens', () => {
  it('exposes the six canonical phase keys via PHASE_TOKEN_VALUES', () => {
    expect([...PHASE_TOKEN_VALUES].sort()).toEqual(['delegating', 'exploring', 'idle', 'implementing', 'planning', 'testing']);
  });

  for (const { name, theme } of VARIANTS) {
    it(`resolves a Color for every phase against ${name}`, () => {
      const resolved = resolveDomainTokens(phaseTokens, theme());
      for (const key of PHASE_TOKEN_VALUES) {
        expect(isColor(resolved[key])).toBe(true);
      }
    });
  }

  it('passes overrides through unchanged', () => {
    const t = defaultTheme;
    const override = t.colors.tones.danger;
    const resolved = resolveDomainTokens(phaseTokens, t, { idle: override });
    expect(resolved.idle).toBe(override);
    expect(isColor(resolved.exploring)).toBe(true);
  });

  for (const { name, theme } of VARIANTS) {
    it(`every phase color meets WCAG AA (4.5:1) against surface on ${name}`, () => {
      const t = theme();
      const resolved = resolveDomainTokens(phaseTokens, t);
      for (const key of PHASE_TOKEN_VALUES) {
        const ratio = color.contrastRatio(resolved[key], t.colors.surface);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

describe('phaseFamily', () => {
  it('declares name "phase" and the canonical value list', () => {
    expect(phaseFamily.name).toBe('phase');
    expect([...phaseFamily.values]).toEqual([...PHASE_TOKEN_VALUES]);
  });

  it('narrows known/unknown values via isValue', () => {
    expect(phaseFamily.isValue('exploring')).toBe(true);
    expect(phaseFamily.isValue('garbage')).toBe(false);
    expect(phaseFamily.isValue(42)).toBe(false);
    expect(phaseFamily.isValue(null)).toBe(false);
  });

  it('resolveFamilyGlyph returns a non-empty string at every level for every phase', () => {
    for (const value of PHASE_TOKEN_VALUES) {
      for (const level of [1, 2] as const) {
        const glyph = resolveFamilyGlyph(phaseFamily, value as SessionPhase, level);
        expect(typeof glyph).toBe('string');
        expect(glyph.length).toBeGreaterThan(0);
      }
    }
  });

  it('exposes a glyph triple in PHASE_GLYPHS for every phase', () => {
    for (const value of PHASE_TOKEN_VALUES) {
      const triple = PHASE_GLYPHS[value];
      expect(triple.level1.length).toBeGreaterThan(0);
      expect(triple.level2.length).toBeGreaterThan(0);
      expect(typeof triple.level3).toBe('string');
    }
  });

  it('resolveFamilyGlyph degrades level 3 → level 2 → level 1 when higher levels are empty', () => {
    // Synthetic family with intentionally-empty level3 and level2 to exercise
    // the fallback chain. (Shipping PHASE_GLYPHS populates level3 with Nerd
    // Font codepoints, so it does not exercise the fallback path itself.)
    const partial = defineDomainTokens({
      name: 'partial',
      values: ['both', 'noLevel3', 'onlyLevel1'] as const,
      glyphs: {
        both: { level1: 'A', level2: '✦', level3: '⚙' },
        noLevel3: { level1: 'B', level2: '✧', level3: '' },
        onlyLevel1: { level1: 'C', level2: '', level3: '' },
      },
    });
    expect(resolveFamilyGlyph(partial, 'both', 3)).toBe('⚙');
    expect(resolveFamilyGlyph(partial, 'noLevel3', 3)).toBe('✧');
    expect(resolveFamilyGlyph(partial, 'noLevel3', 2)).toBe('✧');
    expect(resolveFamilyGlyph(partial, 'onlyLevel1', 3)).toBe('C');
    expect(resolveFamilyGlyph(partial, 'onlyLevel1', 2)).toBe('C');
    expect(resolveFamilyGlyph(partial, 'onlyLevel1', 1)).toBe('C');
  });
});
