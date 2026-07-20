import { describe, expect, it } from 'vitest';
import { canvas } from '../canvas.js';

describe('sextant mode', () => {
  it('has correct pixel dimensions (2x3 per cell)', () => {
    const c = canvas(10, 5, 'sextant');
    expect(c.pixelWidth).toBe(20); // 10 * 2
    expect(c.pixelHeight).toBe(15); // 5 * 3
  });

  it('defaults to braille when no mode specified', () => {
    const c = canvas(10, 5);
    expect(c.pixelHeight).toBe(20); // 5 * 4 = 20
  });

  it('explicit braille mode matches default', () => {
    const c = canvas(10, 5, 'braille');
    expect(c.pixelHeight).toBe(20); // 5 * 4 = 20
  });

  it('set and get pixels', () => {
    const c = canvas(1, 1, 'sextant');
    expect(c.get(0, 0)).toBe(false);
    c.set(0, 0);
    expect(c.get(0, 0)).toBe(true);
    expect(c.get(1, 0)).toBe(false);
  });

  it('renders single top-left pixel as first sextant character', () => {
    const c = canvas(1, 1, 'sextant');
    c.set(0, 0); // bit 0x01 = pattern 1 = U+1FB00
    const rendered = c.render();
    expect(rendered).toBe('\u{1FB00}');
  });

  it('renders single top-right pixel', () => {
    const c = canvas(1, 1, 'sextant');
    c.set(1, 0); // bit 0x02 = pattern 2 = U+1FB01
    const rendered = c.render();
    expect(rendered).toBe('\u{1FB01}');
  });

  it('renders all 6 sub-pixels as FULL BLOCK', () => {
    const c = canvas(1, 1, 'sextant');
    c.set(0, 0);
    c.set(1, 0);
    c.set(0, 1);
    c.set(1, 1);
    c.set(0, 2);
    c.set(1, 2);
    const rendered = c.render();
    expect(rendered).toBe('\u2588'); // FULL BLOCK
  });

  it('renders empty cell as space', () => {
    const c = canvas(1, 1, 'sextant');
    const rendered = c.render();
    expect(rendered).toBe(' ');
  });

  it('renders left column as LEFT HALF BLOCK', () => {
    const c = canvas(1, 1, 'sextant');
    c.set(0, 0); // bit 0
    c.set(0, 1); // bit 2
    c.set(0, 2); // bit 4
    // pattern = 0x01 | 0x04 | 0x10 = 21
    const rendered = c.render();
    expect(rendered).toBe('\u258C'); // LEFT HALF BLOCK
  });

  it('renders right column as RIGHT HALF BLOCK', () => {
    const c = canvas(1, 1, 'sextant');
    c.set(1, 0); // bit 1
    c.set(1, 1); // bit 3
    c.set(1, 2); // bit 5
    // pattern = 0x02 | 0x08 | 0x20 = 42
    const rendered = c.render();
    expect(rendered).toBe('\u2590'); // RIGHT HALF BLOCK
  });

  it('clear removes a pixel', () => {
    const c = canvas(1, 1, 'sextant');
    c.set(0, 0);
    c.set(1, 0);
    expect(c.get(0, 0)).toBe(true);
    c.clear(0, 0);
    expect(c.get(0, 0)).toBe(false);
    expect(c.get(1, 0)).toBe(true);
  });

  it('toggle flips a pixel', () => {
    const c = canvas(1, 1, 'sextant');
    c.toggle(0, 0);
    expect(c.get(0, 0)).toBe(true);
    c.toggle(0, 0);
    expect(c.get(0, 0)).toBe(false);
  });

  it('renders multiple rows', () => {
    const c = canvas(2, 2, 'sextant');
    c.set(0, 0); // top-left cell, top-left pixel
    c.set(2, 3); // bottom-right cell (col 1), row 0 of cell row 1
    const lines = c.render().split('\n');
    expect(lines.length).toBe(2);
  });

  it('out-of-bounds set is no-op', () => {
    const c = canvas(1, 1, 'sextant');
    c.set(-1, 0);
    c.set(0, -1);
    c.set(2, 0);
    c.set(0, 3);
    expect(c.render()).toBe(' ');
  });

  it('reset clears everything', () => {
    const c = canvas(2, 2, 'sextant');
    c.set(0, 0);
    c.set(1, 1);
    c.reset();
    expect(c.get(0, 0)).toBe(false);
    expect(c.get(1, 1)).toBe(false);
  });

  it('drawing primitives work in sextant mode', () => {
    const c = canvas(5, 3, 'sextant');
    c.line(0, 0, 9, 8);
    // Should have set some pixels along the diagonal
    expect(c.get(0, 0)).toBe(true);
    expect(c.get(9, 8)).toBe(true);
  });

  it('fillRect works in sextant mode', () => {
    const c = canvas(3, 2, 'sextant');
    c.fillRect(0, 0, 6, 6); // fill entire canvas
    const rendered = c.render();
    // Every cell should be FULL BLOCK
    const lines = rendered.split('\n');
    expect(lines.length).toBe(2);
    for (const line of lines) {
      for (const ch of line) {
        expect(ch).toBe('\u2588');
      }
    }
  });
});
