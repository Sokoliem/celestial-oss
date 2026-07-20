import { color } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { canvas } from '../canvas.js';

describe('BrailleCanvas', () => {
  describe('dimensions', () => {
    it('canvas(10,5) has pixelWidth=20, pixelHeight=20', () => {
      const c = canvas(10, 5);
      expect(c.width).toBe(10);
      expect(c.height).toBe(5);
      expect(c.pixelWidth).toBe(20);
      expect(c.pixelHeight).toBe(20);
    });
  });

  describe('set/get pixel', () => {
    it('set(0,0) then render() produces char with dot 1 (U+2801)', () => {
      const c = canvas(1, 1);
      c.set(0, 0);
      const rendered = c.render();
      // Cell at (0,0): dot 0,0 = bit 0x01 => U+2801
      expect(rendered).toContain('\u2801');
    });

    it('set(1,0) adds dot 4 to cell (0,0) => bit 0x08', () => {
      const c = canvas(1, 1);
      c.set(1, 0);
      const rendered = c.render();
      // dot at dx=1, dy=0 => bit 0x08 => U+2808
      expect(rendered).toContain('\u2808');
    });

    it('set(0,0) and set(1,0) combined produces U+2809', () => {
      const c = canvas(1, 1);
      c.set(0, 0);
      c.set(1, 0);
      const rendered = c.render();
      // 0x01 | 0x08 = 0x09 => U+2809
      expect(rendered).toContain('\u2809');
    });

    it('get returns pixel state', () => {
      const c = canvas(5, 5);
      expect(c.get(3, 7)).toBe(false);
      c.set(3, 7);
      expect(c.get(3, 7)).toBe(true);
    });
  });

  describe('clear', () => {
    it('clear removes a dot', () => {
      const c = canvas(1, 1);
      c.set(0, 0);
      c.set(1, 0);
      c.clear(0, 0);
      // Only dot at (1,0) remains => 0x08 => U+2808
      const rendered = c.render();
      expect(rendered).toContain('\u2808');
      expect(rendered).not.toContain('\u2809');
    });
  });

  describe('toggle', () => {
    it('toggle flips a pixel on and off', () => {
      const c = canvas(1, 1);
      expect(c.get(0, 0)).toBe(false);
      c.toggle(0, 0);
      expect(c.get(0, 0)).toBe(true);
      c.toggle(0, 0);
      expect(c.get(0, 0)).toBe(false);
    });
  });

  describe('out-of-bounds', () => {
    it('out-of-bounds set/get silently ignored', () => {
      const c = canvas(1, 1);
      // pixel coords out of range (pixelWidth=2, pixelHeight=4)
      expect(() => c.set(-1, 0)).not.toThrow();
      expect(() => c.set(0, -1)).not.toThrow();
      expect(() => c.set(2, 0)).not.toThrow();
      expect(() => c.set(0, 4)).not.toThrow();
      expect(c.get(-1, 0)).toBe(false);
      expect(c.get(100, 100)).toBe(false);
    });
  });

  describe('reset', () => {
    it('reset clears everything', () => {
      const c = canvas(5, 5);
      c.set(0, 0);
      c.set(3, 7);
      c.set(9, 19);
      c.reset();
      const rendered = c.render();
      // After reset, all cells should render as blank braille (U+2800)
      for (const ch of rendered.replace(/\n/g, '')) {
        expect(ch).toBe('\u2800');
      }
    });
  });

  describe('render', () => {
    it('render produces correct number of lines', () => {
      const c = canvas(10, 5);
      const lines = c.render().split('\n');
      expect(lines.length).toBe(5);
    });

    it('each line has correct number of characters (ignoring ANSI)', () => {
      const c = canvas(10, 5);
      const rendered = c.render();
      // Strip ANSI
      // eslint-disable-next-line no-control-regex
      const stripped = rendered.replace(/\x1b\[[0-9;]*m/g, '');
      const lines = stripped.split('\n');
      for (const line of lines) {
        expect(line.length).toBe(10);
      }
    });
  });

  describe('toVNode', () => {
    it('returns TextNode', () => {
      const c = canvas(5, 3);
      const vnode = c.toVNode();
      expect(['text', 'column']).toContain(vnode.kind);
    });
  });

  describe('color support', () => {
    it('setColor makes render include ANSI fg codes', () => {
      const c = canvas(2, 1);
      c.setColor(color.red);
      c.set(0, 0);
      const rendered = c.render();
      // Should contain red fg escape
      expect(rendered).toContain('\x1b[31m');
    });

    it('setBackground makes render include ANSI bg codes', () => {
      const c = canvas(2, 1);
      c.setBackground(color.blue);
      c.set(0, 0);
      const rendered = c.render();
      // Should contain blue bg escape
      expect(rendered).toContain('\x1b[44m');
    });
  });
});
