import { describe, expect, it } from 'vitest';
import { canvas } from '../canvas.js';

describe('quarter-block mode', () => {
  it('has correct pixel dimensions (2x2 per cell)', () => {
    const c = canvas(10, 5, 'quarter');
    expect(c.pixelWidth).toBe(20); // 10 * 2
    expect(c.pixelHeight).toBe(10); // 5 * 2
  });

  it('set and get pixels', () => {
    const c = canvas(1, 1, 'quarter');
    expect(c.get(0, 0)).toBe(false);
    c.set(0, 0);
    expect(c.get(0, 0)).toBe(true);
    expect(c.get(1, 0)).toBe(false);
  });

  it('renders empty cell as space', () => {
    const c = canvas(1, 1, 'quarter');
    expect(c.render()).toBe(' ');
  });

  it('renders all 4 sub-pixels as FULL BLOCK', () => {
    const c = canvas(1, 1, 'quarter');
    c.set(0, 0);
    c.set(1, 0);
    c.set(0, 1);
    c.set(1, 1);
    expect(c.render()).toBe('\u2588'); // █
  });

  it('renders top-left pixel as ▘', () => {
    const c = canvas(1, 1, 'quarter');
    c.set(0, 0); // bit 0x01 = pattern 1
    expect(c.render()).toBe('\u2598');
  });

  it('renders top-right pixel as ▝', () => {
    const c = canvas(1, 1, 'quarter');
    c.set(1, 0); // bit 0x02 = pattern 2
    expect(c.render()).toBe('\u259D');
  });

  it('renders bottom-left pixel as ▖', () => {
    const c = canvas(1, 1, 'quarter');
    c.set(0, 1); // bit 0x04 = pattern 4
    expect(c.render()).toBe('\u2596');
  });

  it('renders bottom-right pixel as ▗', () => {
    const c = canvas(1, 1, 'quarter');
    c.set(1, 1); // bit 0x08 = pattern 8
    expect(c.render()).toBe('\u2597');
  });

  it('renders upper half (top row)', () => {
    const c = canvas(1, 1, 'quarter');
    c.set(0, 0);
    c.set(1, 0); // pattern 3 = ▀
    expect(c.render()).toBe('\u2580');
  });

  it('renders lower half (bottom row)', () => {
    const c = canvas(1, 1, 'quarter');
    c.set(0, 1);
    c.set(1, 1); // pattern 12 = ▄
    expect(c.render()).toBe('\u2584');
  });

  it('renders left half (left column)', () => {
    const c = canvas(1, 1, 'quarter');
    c.set(0, 0);
    c.set(0, 1); // pattern 5 = ▌
    expect(c.render()).toBe('\u258C');
  });

  it('renders right half (right column)', () => {
    const c = canvas(1, 1, 'quarter');
    c.set(1, 0);
    c.set(1, 1); // pattern 10 = ▐
    expect(c.render()).toBe('\u2590');
  });

  it('renders diagonal pattern', () => {
    const c = canvas(1, 1, 'quarter');
    c.set(0, 0);
    c.set(1, 1); // pattern 9 = ▚
    expect(c.render()).toBe('\u259A');
  });

  it('renders anti-diagonal pattern', () => {
    const c = canvas(1, 1, 'quarter');
    c.set(1, 0);
    c.set(0, 1); // pattern 6 = ▞
    expect(c.render()).toBe('\u259E');
  });

  it('draws a line across multiple cells', () => {
    const c = canvas(5, 3, 'quarter');
    c.line(0, 0, 9, 5);
    const rendered = c.render();
    // Should produce non-empty output with block characters
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered).not.toBe('               '); // not all spaces
  });

  it('multi-cell grid renders correctly', () => {
    const c = canvas(3, 2, 'quarter');
    // Set one pixel in each cell
    c.set(0, 0); // cell (0,0) top-left
    c.set(3, 1); // cell (1,0) bottom-left
    c.set(5, 3); // cell (2,1) bottom-right
    const lines = c.render().split('\n');
    expect(lines.length).toBe(2); // 2 rows of cells
  });
});
