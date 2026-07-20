import { describe, expect, it } from 'vitest';
import { canvas } from '../canvas.js';

describe('canvas — octant mode', () => {
  it('reports 2×4 sub-pixels per cell with aspect 1.0', () => {
    const c = canvas(3, 2, 'octant');
    expect(c.pixelWidth).toBe(6); // 3 × 2
    expect(c.pixelHeight).toBe(8); // 2 × 4
    expect(c.pixelAspect).toBe(1.0);
  });

  it('renders an empty canvas as spaces (cell = 0x00)', () => {
    const c = canvas(2, 1, 'octant');
    const rendered = c.render();
    expect(rendered).toMatch(/^[ {2}]+$/);
  });

  it('lighting all 8 sub-pixels in one cell renders as full block U+2588', () => {
    const c = canvas(1, 1, 'octant');
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        c.set(dx, dy);
      }
    }
    expect(c.render()).toContain('█');
  });

  it('lighting the top two sub-rows renders as U+2580 ▀ (upper half)', () => {
    const c = canvas(1, 1, 'octant');
    // Upper half = bits 0,1,2,3 = top two sub-rows in 2×4 grid.
    c.set(0, 0);
    c.set(1, 0);
    c.set(0, 1);
    c.set(1, 1);
    expect(c.render()).toContain('▀');
  });

  it('lighting the bottom two sub-rows renders as U+2584 ▄ (lower half)', () => {
    const c = canvas(1, 1, 'octant');
    // Lower half = bits 4,5,6,7 = bottom two sub-rows.
    c.set(0, 2);
    c.set(1, 2);
    c.set(0, 3);
    c.set(1, 3);
    expect(c.render()).toContain('▄');
  });

  it('lighting only the top-left sub-pixel maps into the new octant range', () => {
    const c = canvas(1, 1, 'octant');
    c.set(0, 0); // bit 0x01
    const cp = c.render().codePointAt(0)!;
    expect(cp).toBeGreaterThanOrEqual(0x1cd00);
    expect(cp).toBeLessThanOrEqual(0x1cdef);
  });

  it('quadrant-equivalent patterns reuse legacy block elements', () => {
    // Light bits 0 (top-L) + 2 (row1-L) = 0x05 — quadrant upper-left ▘
    const c = canvas(1, 1, 'octant');
    c.set(0, 0);
    c.set(0, 1);
    expect(c.render()).toContain('▘');
  });

  it('a 3×2 canvas paints distinct cells independently', () => {
    const c = canvas(3, 2, 'octant');
    c.set(0, 0); // cell (0,0) top-left
    c.set(5, 7); // cell (2,1) bottom-right
    const rendered = c.render();
    // Should contain at least two distinct non-space glyphs.
    const stripped = rendered.replace(/\s/g, '');
    expect(stripped.length).toBeGreaterThanOrEqual(2);
  });
});
