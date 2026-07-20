import { describe, expect, it } from 'vitest';
import { type Color, color } from '../color.js';
import {
  type ClaudeTool,
  classifyToolName,
  resolveDomainTokens,
  resolveFamilyGlyph,
  TOOL_GLYPHS,
  TOOL_TOKEN_VALUES,
  toolFamily,
  toolTokens,
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

describe('toolTokens', () => {
  for (const { name, theme } of VARIANTS) {
    it(`resolves a Color for every tool against ${name}`, () => {
      const resolved = resolveDomainTokens(toolTokens, theme());
      for (const key of TOOL_TOKEN_VALUES) {
        expect(isColor(resolved[key])).toBe(true);
      }
    });
  }

  it('passes overrides through unchanged', () => {
    const t = defaultTheme;
    const override = t.colors.tones.danger;
    const resolved = resolveDomainTokens(toolTokens, t, { read: override });
    expect(resolved.read).toBe(override);
  });

  for (const { name, theme } of VARIANTS) {
    it(`every tool color meets WCAG AA (4.5:1) against surface on ${name}`, () => {
      const t = theme();
      const resolved = resolveDomainTokens(toolTokens, t);
      for (const key of TOOL_TOKEN_VALUES) {
        const ratio = color.contrastRatio(resolved[key], t.colors.surface);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

describe('toolFamily', () => {
  it('declares name "tool" and all canonical tool values', () => {
    expect(toolFamily.name).toBe('tool');
    expect([...toolFamily.values]).toEqual([...TOOL_TOKEN_VALUES]);
  });

  it('every value has a non-empty glyph at level1 and level2', () => {
    for (const value of TOOL_TOKEN_VALUES) {
      const triple = TOOL_GLYPHS[value];
      expect(triple.level1.length).toBeGreaterThan(0);
      expect(triple.level2.length).toBeGreaterThan(0);
      expect(typeof triple.level3).toBe('string');
    }
  });

  it('resolveFamilyGlyph returns level-appropriate string for each tool', () => {
    for (const value of TOOL_TOKEN_VALUES) {
      const v = value as ClaudeTool;
      expect(resolveFamilyGlyph(toolFamily, v, 1)).toBe(TOOL_GLYPHS[v].level1);
      expect(resolveFamilyGlyph(toolFamily, v, 2)).toBe(TOOL_GLYPHS[v].level2);
      expect(resolveFamilyGlyph(toolFamily, v, 3)).toBe(TOOL_GLYPHS[v].level3);
    }
  });
});

describe('classifyToolName', () => {
  const cases: Array<[string, ClaudeTool]> = [
    ['Read', 'read'],
    ['Write', 'write'],
    ['Edit', 'edit'],
    ['MultiEdit', 'edit'],
    ['Bash', 'bash'],
    ['Grep', 'grep'],
    ['Glob', 'glob'],
    ['Agent', 'agent'],
    ['Task', 'agent'],
    ['WebFetch', 'webFetch'],
    ['WebSearch', 'webSearch'],
    ['TodoWrite', 'todo'],
    ['mystery_tool', 'fallback'],
    ['', 'fallback'],
    ['read', 'fallback'],
  ];

  for (const [input, expected] of cases) {
    it(`maps "${input}" -> "${expected}"`, () => {
      expect(classifyToolName(input)).toBe(expected);
    });
  }
});
