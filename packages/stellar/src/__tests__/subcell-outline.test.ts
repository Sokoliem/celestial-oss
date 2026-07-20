import { describe, expect, it } from 'vitest';
import { subcellOutline } from '../subcell-outline.js';

describe('subcellOutline — aggregation', () => {
  it('returns one row per terminal cell', () => {
    const result = subcellOutline({ density: [0.1, 0.5, 0.9, 0.3], height: 4 });
    expect(result.rows.length).toBe(4);
  });

  it('aggregates source lines proportionally to height', () => {
    // 12 source lines into 4 rows -> 3 lines per row
    const density = Array.from({ length: 12 }, (_, i) => i / 11);
    const result = subcellOutline({ density, height: 4, reducer: 'max' });
    expect(result.rows.length).toBe(4);
    expect(result.rows[0]?.lineStart).toBe(0);
    expect(result.rows[0]?.lineEnd).toBe(3);
    expect(result.rows[1]?.lineStart).toBe(3);
    expect(result.rows[3]?.lineEnd).toBe(12);
  });

  it('reduces by max by default', () => {
    const result = subcellOutline({ density: [0.1, 0.9, 0.2, 0.4], height: 1 });
    expect(result.rows[0]?.primary).toBeCloseTo(0.9);
  });

  it('reduces by mean when requested', () => {
    const result = subcellOutline({ density: [0.2, 0.4, 0.6, 0.8], height: 1, reducer: 'mean' });
    expect(result.rows[0]?.primary).toBeCloseTo(0.5);
  });

  it('reduces by sum when requested (clamped to 1)', () => {
    const result = subcellOutline({ density: [0.5, 0.5, 0.5], height: 1, reducer: 'sum' });
    expect(result.rows[0]?.primary).toBe(1);
  });

  it('clamps out-of-range values', () => {
    const result = subcellOutline({ density: [-0.5, 1.5, 0.4], height: 1, reducer: 'max' });
    expect(result.rows[0]?.primary).toBe(1);

    const minOnly = subcellOutline({ density: [-1, -0.2], height: 1, reducer: 'max' });
    expect(minOnly.rows[0]?.primary).toBe(0);
  });

  it('throws when secondaryDensity length mismatches', () => {
    expect(() => subcellOutline({ density: [0.5, 0.5], secondaryDensity: [0.5], height: 1 })).toThrow();
  });

  it('exposes both channels in row aggregates when secondaryDensity is given', () => {
    const result = subcellOutline({ density: [0.2, 0.8], secondaryDensity: [0.6, 0.4], height: 1 });
    expect(result.rows[0]?.primary).toBeCloseTo(0.8);
    expect(result.rows[0]?.secondary).toBeCloseTo(0.6);
  });

  it('returns an empty result for height 0', () => {
    const result = subcellOutline({ density: [0.5], height: 0 });
    expect(result.rows.length).toBe(0);
    expect(result.toString()).toBe('');
  });

  it('handles empty density gracefully', () => {
    const result = subcellOutline({ density: [], height: 3 });
    expect(result.rows.length).toBe(3);
    for (const row of result.rows) {
      expect(row.primary).toBe(0);
      expect(row.lineStart).toBe(0);
      expect(row.lineEnd).toBe(0);
    }
  });
});

describe('subcellOutline — mode selection', () => {
  it('defaults to auto, which falls back to sextant when no caps are given', () => {
    const result = subcellOutline({ density: [1, 1, 1], height: 3 });
    // Sextant glyphs live in U+1FB00..U+1FB3B + U+2580/U+258C/U+2588/U+2590.
    expect(/[\u{1FB00}-\u{1FB3F}▀-▟█]/u.test(result.toString())).toBe(true);
  });

  it('renders empty in auto mode (sextant) when all density is zero', () => {
    const result = subcellOutline({ density: [0, 0, 0, 0], height: 4 });
    expect(/[\u{1FB00}-\u{1FB3F}▀-▞]/u.test(result.toString())).toBe(false);
  });

  it('renders octant glyphs when caps.unicodeOctant is true', () => {
    const result = subcellOutline({ density: [1, 1, 1, 1], height: 4, caps: { unicodeOctant: true } });
    const rendered = result.toString();
    // Octant block is U+1CD00..U+1CDEF; legacy fallbacks (U+2580..U+259F)
    // for the 16 reused patterns are also acceptable.
    const hasOctantOrLegacy = /[\u{1CD00}-\u{1CDEF}\u{2580}-\u{259F}]/u.test(rendered);
    expect(hasOctantOrLegacy).toBe(true);
  });

  it('renders braille glyphs when explicitly requested', () => {
    const result = subcellOutline({ density: [1, 1, 1], height: 3, mode: 'braille' });
    expect(/[\u{2800}-\u{28FF}]/u.test(result.toString())).toBe(true);
  });

  it('renders sextant glyphs when explicitly requested', () => {
    const result = subcellOutline({ density: [1, 1, 1], height: 3, mode: 'sextant' });
    expect(/[\u{1FB00}-\u{1FB3F}▀-▟█]/u.test(result.toString())).toBe(true);
  });

  it('explicit mode overrides caps even if caps suggest a different choice', () => {
    // Caps say octant is fine, but caller explicitly wants braille.
    const result = subcellOutline({ density: [1, 1, 1], height: 3, mode: 'braille', caps: { unicodeOctant: true } });
    expect(/[\u{2800}-\u{28FF}]/u.test(result.toString())).toBe(true);
    // No octant codepoints leaked into the output.
    expect(/[\u{1CD00}-\u{1CDEF}]/u.test(result.toString())).toBe(false);
  });

  it('octant mode produces 4 sub-rows per cell vs sextant 3', () => {
    const sext = subcellOutline({ density: [0.5], height: 1, mode: 'sextant' });
    const oct = subcellOutline({ density: [0.5], height: 1, mode: 'octant' });
    // Both produce exactly one rendered row of 1 cell.
    // Their internal sub-row count differs but the public row API is the same.
    expect(sext.rows.length).toBe(1);
    expect(oct.rows.length).toBe(1);
    // Outputs should differ — the chosen glyph differs by codec.
    expect(sext.toString()).not.toBe(oct.toString());
  });
});
