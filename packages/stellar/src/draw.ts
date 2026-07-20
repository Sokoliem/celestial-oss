/**
 * Drawing Primitives for BrailleCanvas
 *
 * Provides Bresenham's line algorithm, midpoint circle algorithm,
 * and rectangle/fill operations on the braille pixel grid.
 */
import type { BrailleCanvas } from './canvas.js';
import { GLYPH_SPACING, getGlyph } from './font.js';
import { GLYPH_HD_SPACING, getGlyphHD } from './font-hd.js';

/**
 * Draw a line using Bresenham's algorithm.
 */
export function drawLine(c: BrailleCanvas, x1: number, y1: number, x2: number, y2: number): void {
  let cx = x1;
  let cy = y1;
  const dx = Math.abs(x2 - x1);
  const dy = -Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx + dy;

  for (;;) {
    c.set(cx, cy);
    if (cx === x2 && cy === y2) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      cx += sx;
    }
    if (e2 <= dx) {
      err += dx;
      cy += sy;
    }
  }
}

/**
 * Draw a rectangle outline (4 lines).
 */
export function drawRect(c: BrailleCanvas, x: number, y: number, w: number, h: number): void {
  const x2 = x + w - 1;
  const y2 = y + h - 1;
  drawLine(c, x, y, x2, y); // top
  drawLine(c, x, y2, x2, y2); // bottom
  drawLine(c, x, y, x, y2); // left
  drawLine(c, x2, y, x2, y2); // right
}

/**
 * Fill a rectangle with pixels (scanline fill).
 */
export function fillRect(c: BrailleCanvas, x: number, y: number, w: number, h: number): void {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      c.set(px, py);
    }
  }
}

/**
 * Draw a circle outline using the midpoint circle algorithm with 8-way symmetry.
 */
export function drawCircle(c: BrailleCanvas, cx: number, cy: number, r: number): void {
  let x = r;
  let y = 0;
  let d = 1 - r;

  while (x >= y) {
    // 8-way symmetry
    c.set(cx + x, cy + y);
    c.set(cx - x, cy + y);
    c.set(cx + x, cy - y);
    c.set(cx - x, cy - y);
    c.set(cx + y, cy + x);
    c.set(cx - y, cy + x);
    c.set(cx + y, cy - x);
    c.set(cx - y, cy - x);

    y++;
    if (d <= 0) {
      d += 2 * y + 1;
    } else {
      x--;
      d += 2 * (y - x) + 1;
    }
  }
}

/**
 * Fill a circle (set all pixels where x^2 + y^2 <= r^2).
 */
export function fillCircle(c: BrailleCanvas, cx: number, cy: number, r: number): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) {
        c.set(cx + dx, cy + dy);
      }
    }
  }
}

/**
 * Draw a circle outline corrected for pixel aspect ratio.
 *
 * When pixelAspect !== 1.0, sub-pixels are non-square and a naive circle
 * appears as an ellipse on screen. This function scales the Y distance by
 * 1/pixelAspect when testing the circle equation, producing an ellipse in
 * pixel space that appears circular on screen.
 *
 * @param aspect - pixelAspect ratio (width/height of a sub-pixel). 1.0 = square pixels.
 */
export function drawCircleCorrect(c: BrailleCanvas, cx: number, cy: number, r: number, aspect: number): void {
  if (aspect === 1.0) {
    drawCircle(c, cx, cy, r);
    return;
  }

  // To make a circle appear circular on screen, we need to stretch the
  // pixel-space shape along the axis where pixels are smaller. With
  // aspect < 1 (pixels wider than tall), we stretch vertically.
  // The effective Y radius in pixel space is r / aspect.
  const ry = Math.round(r / aspect);
  const rx = r;

  // Scan bounding box and test ellipse equation: (dx/rx)^2 + (dy/ry)^2 <= 1
  // But only set pixels on the approximate boundary (within 1 pixel of edge)
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
      // Approximate outline: 1 pixel thick ring around the boundary
      if (d >= 0.85 && d <= 1.15) {
        c.set(cx + dx, cy + dy);
      }
    }
  }
}

/**
 * Fill a circle corrected for pixel aspect ratio.
 *
 * Fills an ellipse in pixel space that appears as a filled circle on screen.
 * See drawCircleCorrect for the aspect ratio correction logic.
 *
 * @param aspect - pixelAspect ratio (width/height of a sub-pixel). 1.0 = square pixels.
 */
export function fillCircleCorrect(c: BrailleCanvas, cx: number, cy: number, r: number, aspect: number): void {
  if (aspect === 1.0) {
    fillCircle(c, cx, cy, r);
    return;
  }

  const ry = Math.round(r / aspect);
  const rx = r;

  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1.0) {
        c.set(cx + dx, cy + dy);
      }
    }
  }
}

/**
 * Draw text using the bitmap font.
 * Each character is rendered as a 3x5 pixel glyph with GLYPH_SPACING pixels between.
 */
export function drawText(c: BrailleCanvas, x: number, y: number, str: string): void {
  let curX = x;

  for (const ch of str) {
    const glyph = getGlyph(ch);
    if (!glyph) {
      curX += 3 + GLYPH_SPACING;
      continue;
    }

    for (let gy = 0; gy < glyph.height; gy++) {
      const row = glyph.rows[gy]!;
      for (let gx = 0; gx < glyph.width; gx++) {
        // bit2=left, bit1=center, bit0=right
        const bit = glyph.width - 1 - gx;
        if ((row >> bit) & 1) {
          c.set(curX + gx, y + gy);
        }
      }
    }

    curX += glyph.width + GLYPH_SPACING;
  }
}

/**
 * Draw text using the HD bitmap font.
 * Each character is rendered as an 8x14 pixel glyph with GLYPH_HD_SPACING pixels between.
 */
export function drawTextHD(c: BrailleCanvas, x: number, y: number, str: string): void {
  let curX = x;

  for (const ch of str) {
    const glyph = getGlyphHD(ch);
    if (!glyph) {
      curX += 8 + GLYPH_HD_SPACING;
      continue;
    }

    for (let gy = 0; gy < glyph.height; gy++) {
      const row = glyph.rows[gy]!;
      for (let gx = 0; gx < glyph.width; gx++) {
        const bit = glyph.width - 1 - gx;
        if ((row >> bit) & 1) {
          c.set(curX + gx, y + gy);
        }
      }
    }

    curX += glyph.width + GLYPH_HD_SPACING;
  }
}
