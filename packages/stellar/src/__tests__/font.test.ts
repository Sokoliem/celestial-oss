import { describe, expect, it } from 'vitest';
import { GLYPH_SPACING, getGlyph } from '../font.js';

describe('font', () => {
  it("getGlyph('A') returns defined data", () => {
    const glyph = getGlyph('A');
    expect(glyph).toBeDefined();
    expect(glyph!.width).toBe(3);
    expect(glyph!.height).toBe(5);
    expect(glyph!.rows).toHaveLength(5);
  });

  it('all printable ASCII (32-126) have glyphs', () => {
    for (let code = 32; code <= 126; code++) {
      const ch = String.fromCharCode(code);
      const glyph = getGlyph(ch);
      expect(glyph, `Missing glyph for char code ${code} ('${ch}')`).toBeDefined();
    }
  });

  it('glyph dimensions are 3x5', () => {
    // Check a sample of glyphs
    for (const ch of ['A', 'z', '0', '9', ' ', '.', '!', '~']) {
      const glyph = getGlyph(ch);
      expect(glyph, `Missing glyph for '${ch}'`).toBeDefined();
      expect(glyph!.width).toBe(3);
      expect(glyph!.height).toBe(5);
      expect(glyph!.rows).toHaveLength(5);
    }
  });

  it('glyph rows are valid 3-bit masks (0-7)', () => {
    for (let code = 32; code <= 126; code++) {
      const ch = String.fromCharCode(code);
      const glyph = getGlyph(ch)!;
      for (const row of glyph.rows) {
        expect(row).toBeGreaterThanOrEqual(0);
        expect(row).toBeLessThanOrEqual(7);
      }
    }
  });

  it('GLYPH_SPACING is 1', () => {
    expect(GLYPH_SPACING).toBe(1);
  });

  it('M and N glyphs should have distinct bit patterns', () => {
    const glyphM = getGlyph('M');
    const glyphN = getGlyph('N');
    expect(glyphM).toBeDefined();
    expect(glyphN).toBeDefined();
    // The row arrays must differ in at least one position
    const same = glyphM!.rows.every((row, i) => row === glyphN!.rows[i]);
    expect(same, 'M and N glyphs must not be identical').toBe(false);
  });

  it('all unique printable glyphs produce distinct bit patterns (no accidental duplicates among letters)', () => {
    // Check uppercase letters specifically -- no two should share the same pattern
    const patterns = new Map<string, string>();
    for (let code = 65; code <= 90; code++) {
      const ch = String.fromCharCode(code);
      const glyph = getGlyph(ch)!;
      const key = glyph.rows.join(',');
      const existing = patterns.get(key);
      expect(existing, `Glyph '${ch}' has the same bit pattern as '${existing}'`).toBeUndefined();
      patterns.set(key, ch);
    }
  });
});
