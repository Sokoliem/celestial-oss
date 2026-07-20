import { describe, expect, it } from 'vitest';
import { canvas } from '../canvas.js';
import { drawCircle, drawLine, drawRect, fillCircle, fillRect } from '../draw.js';

describe('drawLine', () => {
  it('horizontal line sets correct pixels', () => {
    const c = canvas(10, 5);
    drawLine(c, 0, 0, 9, 0);
    for (let x = 0; x <= 9; x++) {
      expect(c.get(x, 0)).toBe(true);
    }
    // Check a pixel NOT on the line
    expect(c.get(0, 1)).toBe(false);
  });

  it('vertical line sets correct pixels', () => {
    const c = canvas(10, 5);
    drawLine(c, 3, 0, 3, 19);
    for (let y = 0; y <= 19; y++) {
      expect(c.get(3, y)).toBe(true);
    }
    // Check a pixel NOT on the line
    expect(c.get(4, 0)).toBe(false);
  });

  it('diagonal line (Bresenham) sets pixels along the path', () => {
    const c = canvas(10, 5);
    drawLine(c, 0, 0, 9, 9);
    // The diagonal should set (0,0), (1,1), ..., (9,9)
    for (let i = 0; i <= 9; i++) {
      expect(c.get(i, i)).toBe(true);
    }
  });
});

describe('drawRect', () => {
  it('rect draws 4 edges', () => {
    const c = canvas(10, 5);
    drawRect(c, 0, 0, 10, 10);
    // Top edge
    for (let x = 0; x < 10; x++) {
      expect(c.get(x, 0)).toBe(true);
    }
    // Bottom edge
    for (let x = 0; x < 10; x++) {
      expect(c.get(x, 9)).toBe(true);
    }
    // Left edge
    for (let y = 0; y < 10; y++) {
      expect(c.get(0, y)).toBe(true);
    }
    // Right edge
    for (let y = 0; y < 10; y++) {
      expect(c.get(9, y)).toBe(true);
    }
    // Interior should be empty
    expect(c.get(5, 5)).toBe(false);
  });
});

describe('fillRect', () => {
  it('fillRect fills all pixels in area', () => {
    const c = canvas(10, 5);
    fillRect(c, 2, 2, 4, 4);
    for (let y = 2; y < 6; y++) {
      for (let x = 2; x < 6; x++) {
        expect(c.get(x, y)).toBe(true);
      }
    }
    // Outside should be empty
    expect(c.get(1, 1)).toBe(false);
    expect(c.get(6, 6)).toBe(false);
  });
});

describe('drawCircle', () => {
  it('circle has symmetric points', () => {
    const c = canvas(20, 10);
    drawCircle(c, 10, 10, 5);
    // Test 4 cardinal points (approximate due to midpoint algorithm)
    expect(c.get(10, 5)).toBe(true); // top
    expect(c.get(10, 15)).toBe(true); // bottom
    expect(c.get(5, 10)).toBe(true); // left
    expect(c.get(15, 10)).toBe(true); // right
  });
});

describe('fillCircle', () => {
  it('fillCircle fills the interior', () => {
    const c = canvas(20, 10);
    fillCircle(c, 10, 10, 5);
    // Center should be filled
    expect(c.get(10, 10)).toBe(true);
    // Points within radius should be filled
    expect(c.get(10, 8)).toBe(true);
    expect(c.get(12, 10)).toBe(true);
    // Points outside radius should not be filled
    expect(c.get(0, 0)).toBe(false);
    expect(c.get(10, 0)).toBe(false);
  });
});
