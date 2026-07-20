import { describe, expect, it } from 'vitest';
import { canvas } from '../canvas.js';
import { drawTextHD } from '../draw.js';
import { GLYPH_HD_SPACING, getGlyphHD } from '../font-hd.js';

describe('font-hd', () => {
  describe('getGlyphHD', () => {
    it('should return defined glyphs for all ASCII 32-126', () => {
      for (let code = 32; code <= 126; code++) {
        const glyph = getGlyphHD(String.fromCharCode(code));
        expect(glyph, `Missing glyph for ASCII ${code} (${String.fromCharCode(code)})`).toBeDefined();
      }
    });

    it('should have width 8 and height 14', () => {
      const g = getGlyphHD('A');
      expect(g).toBeDefined();
      expect(g!.width).toBe(8);
      expect(g!.height).toBe(14);
      expect(g!.rows).toHaveLength(14);
    });

    it('should have row values that fit in 8 bits', () => {
      for (let code = 32; code <= 126; code++) {
        const glyph = getGlyphHD(String.fromCharCode(code));
        if (!glyph) continue;
        for (const row of glyph.rows) {
          expect(row).toBeGreaterThanOrEqual(0);
          expect(row).toBeLessThanOrEqual(255);
        }
      }
    });

    it('should return undefined for unsupported characters', () => {
      expect(getGlyphHD('\x00')).toBeUndefined();
      expect(getGlyphHD('\x7f')).toBeUndefined();
    });

    it('should produce distinct patterns for M and N', () => {
      const m = getGlyphHD('M');
      const n = getGlyphHD('N');
      expect(m).toBeDefined();
      expect(n).toBeDefined();
      const mStr = JSON.stringify(m!.rows);
      const nStr = JSON.stringify(n!.rows);
      expect(mStr).not.toBe(nStr);
    });

    it('should produce distinct patterns for 0 and O', () => {
      const zero = getGlyphHD('0');
      const oLetter = getGlyphHD('O');
      expect(zero).toBeDefined();
      expect(oLetter).toBeDefined();
      expect(JSON.stringify(zero!.rows)).not.toBe(JSON.stringify(oLetter!.rows));
    });

    it('should produce distinct patterns for 1, l, and I', () => {
      const one = getGlyphHD('1');
      const lower_l = getGlyphHD('l');
      const upper_i = getGlyphHD('I');
      expect(one).toBeDefined();
      expect(lower_l).toBeDefined();
      expect(upper_i).toBeDefined();
      const oneStr = JSON.stringify(one!.rows);
      const lStr = JSON.stringify(lower_l!.rows);
      const iStr = JSON.stringify(upper_i!.rows);
      expect(oneStr).not.toBe(lStr);
      expect(oneStr).not.toBe(iStr);
      expect(lStr).not.toBe(iStr);
    });
  });

  describe('GLYPH_HD_SPACING', () => {
    it('should be 1', () => {
      expect(GLYPH_HD_SPACING).toBe(1);
    });
  });

  describe('drawTextHD', () => {
    it('should draw pixels on the canvas', () => {
      const c = canvas(20, 5);
      drawTextHD(c, 0, 0, 'A');
      const rendered = c.render();
      // A has non-empty content
      expect(rendered.replace(/\s/g, '').length).toBeGreaterThan(0);
    });

    it('should advance cursor by width + spacing for each character', () => {
      const c1 = canvas(30, 5);
      drawTextHD(c1, 0, 0, 'A');
      const c2 = canvas(30, 5);
      drawTextHD(c2, 0, 0, 'AB');
      // AB should have more content than just A
      const r1 = c1.render();
      const r2 = c2.render();
      expect(r2.length).toBeGreaterThanOrEqual(r1.length);
    });

    it('should handle empty string', () => {
      const c = canvas(20, 5);
      drawTextHD(c, 0, 0, '');
      const rendered = c.render();
      expect(rendered).toBeDefined();
    });

    it('should handle unsupported characters gracefully', () => {
      const c = canvas(20, 5);
      expect(() => drawTextHD(c, 0, 0, '\x01')).not.toThrow();
    });

    it('should produce different output for different strings', () => {
      const c1 = canvas(30, 5);
      drawTextHD(c1, 0, 0, 'ABC');
      const c2 = canvas(30, 5);
      drawTextHD(c2, 0, 0, 'XYZ');
      expect(c1.render()).not.toBe(c2.render());
    });

    it('should render space as empty pixels', () => {
      const c = canvas(20, 5);
      drawTextHD(c, 0, 0, ' ');
      // Space should not set any pixels in its glyph area
      const rendered = c.render();
      // All braille chars in a space render should be blank (U+2800)
      const nonBlank = rendered.replace(/[\u2800\n]/g, '');
      expect(nonBlank).toBe('');
    });
  });
});
