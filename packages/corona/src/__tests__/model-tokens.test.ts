import { describe, expect, it } from 'vitest';
import { type Color, color } from '../color.js';
import {
  type ClaudeModel,
  classifyModelName,
  MODEL_GLYPHS,
  MODEL_TOKEN_VALUES,
  modelFamily,
  modelTokens,
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

describe('modelTokens', () => {
  for (const { name, theme } of VARIANTS) {
    it(`resolves a Color for every model against ${name}`, () => {
      const resolved = resolveDomainTokens(modelTokens, theme());
      for (const key of MODEL_TOKEN_VALUES) {
        expect(isColor(resolved[key])).toBe(true);
      }
    });
  }

  it('passes overrides through unchanged', () => {
    const t = defaultTheme;
    const override = t.colors.tones.danger;
    const resolved = resolveDomainTokens(modelTokens, t, { opus: override });
    expect(resolved.opus).toBe(override);
  });

  for (const { name, theme } of VARIANTS) {
    it(`every model color meets WCAG AA (4.5:1) against surface on ${name}`, () => {
      const t = theme();
      const resolved = resolveDomainTokens(modelTokens, t);
      for (const key of MODEL_TOKEN_VALUES) {
        const ratio = color.contrastRatio(resolved[key], t.colors.surface);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

describe('modelFamily', () => {
  it('declares name "model" and all canonical model values', () => {
    expect(modelFamily.name).toBe('model');
    expect([...modelFamily.values]).toEqual([...MODEL_TOKEN_VALUES]);
  });

  it('every value has a non-empty glyph at level1 and level2', () => {
    for (const value of MODEL_TOKEN_VALUES) {
      const triple = MODEL_GLYPHS[value];
      expect(triple.level1.length).toBeGreaterThan(0);
      expect(triple.level2.length).toBeGreaterThan(0);
    }
  });

  it('resolveFamilyGlyph returns level-appropriate strings', () => {
    expect(resolveFamilyGlyph(modelFamily, 'opus', 1)).toBe(MODEL_GLYPHS.opus.level1);
    expect(resolveFamilyGlyph(modelFamily, 'opus', 2)).toBe(MODEL_GLYPHS.opus.level2);
    expect(resolveFamilyGlyph(modelFamily, 'haiku', 2)).toBe(MODEL_GLYPHS.haiku.level2);
  });
});

describe('classifyModelName', () => {
  const cases: Array<[string, ClaudeModel]> = [
    ['claude-3-5-sonnet-20241022', 'sonnet'],
    ['claude-opus-4-7', 'opus'],
    ['claude-haiku-4-5', 'haiku'],
    ['gpt-4o', 'unknown'],
    ['', 'unknown'],
    ['Claude-Opus-4-1', 'opus'],
    ['SONNET', 'sonnet'],
  ];

  for (const [input, expected] of cases) {
    it(`maps "${input}" -> "${expected}"`, () => {
      expect(classifyModelName(input)).toBe(expected);
    });
  }

  it('checks opus first when both opus and haiku appear in id', () => {
    expect(classifyModelName('claude-opus-and-haiku-mix')).toBe('opus');
  });
});
