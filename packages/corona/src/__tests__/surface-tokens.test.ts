import { describe, expect, it } from 'vitest';
import { createTheme } from '../theme/create.js';
import { defaultTheme } from '../theme/defaults.js';
import {
  annotationHighlightSwatches,
  annotationHighlightTokens,
  caretGlyph,
  checkboxGlyphs,
  railGlyph,
  rangeIndicatorGlyphs,
  resolveAnnotationHighlight,
  resolveSurfaceZ,
  scrollbarGlyphs,
  selectionPrefixGlyphs,
  surfaceGlyphTokens,
  surfaceZTokens,
  toggleTrackGlyphs,
  trackGlyphs,
} from '../surface-tokens.js';

describe('surface-tokens (P0-11)', () => {
  describe('surfaceZTokens', () => {
    it('orders kinds by ascending z so panic wins every contest', () => {
      const order = [surfaceZTokens.backdrop, surfaceZTokens.overlay, surfaceZTokens.menu, surfaceZTokens.tooltip, surfaceZTokens.toast, surfaceZTokens.panic];
      const sorted = [...order].sort((a, b) => a - b);
      expect(order).toEqual(sorted);
      expect(surfaceZTokens.panic).toBeGreaterThan(surfaceZTokens.toast);
    });

    it('spaces values by 10 so consumers can interleave new layers', () => {
      const gaps = [surfaceZTokens.overlay - surfaceZTokens.backdrop, surfaceZTokens.menu - surfaceZTokens.overlay, surfaceZTokens.tooltip - surfaceZTokens.menu, surfaceZTokens.toast - surfaceZTokens.tooltip, surfaceZTokens.panic - surfaceZTokens.toast];
      for (const gap of gaps) expect(gap).toBe(10);
    });

    it('resolveSurfaceZ falls back to overlay when given undefined or unknown', () => {
      expect(resolveSurfaceZ('overlay')).toBe(surfaceZTokens.overlay);
      expect(resolveSurfaceZ(undefined)).toBe(surfaceZTokens.overlay);
      expect(resolveSurfaceZ('not-a-kind')).toBe(surfaceZTokens.overlay);
    });
  });

  describe('glyph constants', () => {
    it('scrollbarGlyphs exposes track / thumbIdle / thumbHover / thumbActive', () => {
      expect(scrollbarGlyphs).toEqual({ track: '░', thumbIdle: '▒', thumbHover: '▓', thumbActive: '█' });
    });

    it('trackGlyphs are aligned with scrollbar full/empty so consumers can mix', () => {
      expect(trackGlyphs.filled).toBe('█');
      expect(trackGlyphs.empty).toBe('░');
      expect(trackGlyphs.filled).toBe(scrollbarGlyphs.thumbActive);
      expect(trackGlyphs.empty).toBe(scrollbarGlyphs.track);
    });

    it('caretGlyph and railGlyph share the same visual cell', () => {
      expect(caretGlyph).toBe('▌');
      expect(railGlyph).toBe('▌');
    });

    it('rangeIndicatorGlyphs / toggleTrackGlyphs / checkboxGlyphs / selectionPrefixGlyphs are immutable shapes', () => {
      expect(rangeIndicatorGlyphs).toEqual({ low: '◄', high: '►' });
      expect(toggleTrackGlyphs.on).toMatch(/●/);
      expect(toggleTrackGlyphs.off).toMatch(/○/);
      expect(checkboxGlyphs).toEqual({ checked: '[✓]', unchecked: '[ ]' });
      expect(selectionPrefixGlyphs).toEqual({ selected: '▸', active: '●', muted: '·' });
    });

    it('surfaceGlyphTokens provides full/wide/basic/none fallbacks for each surface glyph', () => {
      expect(surfaceGlyphTokens.rail.basic).toBe('|');
      expect(surfaceGlyphTokens.rail.none).toBe('|');
      expect(surfaceGlyphTokens.trackFilled.basic).toBe('#');
      expect(surfaceGlyphTokens.scrollbarThumbActive.full).toBe('█');
    });
  });

  describe('annotationHighlightTokens', () => {
    it('ships exactly 8 swatches', () => {
      expect(annotationHighlightSwatches).toHaveLength(8);
    });

    it('resolveAnnotationHighlight cycles by index', () => {
      expect(resolveAnnotationHighlight(0)).toBe(annotationHighlightSwatches[0]);
      expect(resolveAnnotationHighlight(7)).toBe(annotationHighlightSwatches[7]);
      expect(resolveAnnotationHighlight(8)).toBe(annotationHighlightSwatches[0]);
      expect(resolveAnnotationHighlight(15)).toBe(annotationHighlightSwatches[7]);
      expect(resolveAnnotationHighlight(2000)).toBe(annotationHighlightSwatches[0]);
    });

    it('resolveAnnotationHighlight clamps negatives to 0', () => {
      expect(resolveAnnotationHighlight(-1)).toBe(annotationHighlightSwatches[0]);
      expect(resolveAnnotationHighlight(-9999)).toBe(annotationHighlightSwatches[0]);
    });

    it('annotationHighlightTokens resolves through corona theme', () => {
      const theme = createTheme();
      expect(annotationHighlightTokens.slot1(theme)).toBe(annotationHighlightSwatches[0]);
      expect(annotationHighlightTokens.slot8(theme)).toBe(annotationHighlightSwatches[7]);
    });

    it('swatch labels are short kebabable strings', () => {
      for (const swatch of annotationHighlightSwatches) {
        expect(swatch.label.length).toBeGreaterThan(0);
        expect(swatch.label.length).toBeLessThan(16);
        expect(swatch.label).toMatch(/^[a-z]+$/);
      }
    });
  });

  describe('Q-T2 motion.duration.backdrop', () => {
    it('default theme exposes a backdrop duration (240ms)', () => {
      expect(defaultTheme.motion.duration.backdrop).toBe(240);
    });

    it('createTheme honors a custom backdrop duration', () => {
      const t = createTheme({ motion: { duration: { backdrop: 160 } } });
      expect(t.motion.duration.backdrop).toBe(160);
    });
  });
});
