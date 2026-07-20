import { describe, expect, it } from 'vitest';
import { resolveGlyph } from '../glyphs.js';
import { type TooltipVariantKind, tooltipVariantGlyphs } from '../tokens/tooltip.js';

const VARIANTS: TooltipVariantKind[] = ['default', 'success', 'warning', 'danger', 'info'];

describe('tooltipVariantGlyphs', () => {
  it('defines a token for every variant', () => {
    for (const variant of VARIANTS) {
      expect(tooltipVariantGlyphs[variant]).toBeDefined();
      expect(tooltipVariantGlyphs[variant].wide).toBeTruthy();
    }
  });

  it('renders DISTINCT wide-level glyphs across variants (regression of B2)', () => {
    const wideGlyphs = VARIANTS.map((v) => tooltipVariantGlyphs[v].wide);
    expect(new Set(wideGlyphs).size).toBe(VARIANTS.length);
  });

  it('keeps default variant on the legacy corner glyph for visual continuity', () => {
    expect(tooltipVariantGlyphs.default.wide).toBe('┌');
  });

  it('resolves at every unicode level for every variant', () => {
    for (const variant of VARIANTS) {
      for (const level of ['full', 'wide', 'basic', 'none'] as const) {
        expect(typeof resolveGlyph(tooltipVariantGlyphs[variant], level)).toBe('string');
      }
    }
  });
});
