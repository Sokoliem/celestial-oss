/**
 * Drawing Primitives for BrailleCanvas
 *
 * Provides Bresenham's line algorithm, midpoint circle algorithm,
 * and rectangle/fill operations on the braille pixel grid.
 */
import type { BrailleCanvas } from './canvas.js';
import { GLYPH_SPACING, getGlyph } from './font.js';
import { GLYPH_HD_SPACING, getGlyphHD } from './font-hd.js';

const MAX_DRAW_COORDINATE = 1_000_000_000;

function coordinate(value: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  return Math.round(Math.max(-MAX_DRAW_COORDINATE, Math.min(MAX_DRAW_COORDINATE, value)));
}

function nonNegativeRadius(value: number): number | undefined {
  const resolved = coordinate(value);
  return resolved !== undefined && resolved >= 0 ? resolved : undefined;
}

function positiveExtent(value: number): number | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.max(1, Math.floor(Math.min(MAX_DRAW_COORDINATE, value)));
}

const INSIDE = 0;
const LEFT = 1;
const RIGHT = 2;
const TOP = 4;
const BOTTOM = 8;

function outCode(x: number, y: number, maxX: number, maxY: number): number {
  let code = INSIDE;
  if (x < 0) code |= LEFT;
  else if (x > maxX) code |= RIGHT;
  if (y < 0) code |= TOP;
  else if (y > maxY) code |= BOTTOM;
  return code;
}

/** Clip a segment to the drawable pixel rectangle before Bresenham traversal. */
function clipLine(c: BrailleCanvas, x1: number, y1: number, x2: number, y2: number): [number, number, number, number] | undefined {
  const maxX = c.pixelWidth - 1;
  const maxY = c.pixelHeight - 1;
  if (maxX < 0 || maxY < 0) return undefined;
  let ax = x1;
  let ay = y1;
  let bx = x2;
  let by = y2;

  for (let attempts = 0; attempts < 8; attempts++) {
    const aCode = outCode(ax, ay, maxX, maxY);
    const bCode = outCode(bx, by, maxX, maxY);
    if ((aCode | bCode) === 0) return [Math.round(ax), Math.round(ay), Math.round(bx), Math.round(by)];
    if ((aCode & bCode) !== 0) return undefined;

    const code = aCode || bCode;
    let x: number;
    let y: number;
    if (code & TOP) {
      if (by === ay) return undefined;
      x = ax + ((bx - ax) * -ay) / (by - ay);
      y = 0;
    } else if (code & BOTTOM) {
      if (by === ay) return undefined;
      x = ax + ((bx - ax) * (maxY - ay)) / (by - ay);
      y = maxY;
    } else if (code & RIGHT) {
      if (bx === ax) return undefined;
      y = ay + ((by - ay) * (maxX - ax)) / (bx - ax);
      x = maxX;
    } else {
      if (bx === ax) return undefined;
      y = ay + ((by - ay) * -ax) / (bx - ax);
      x = 0;
    }

    if (code === aCode) {
      ax = x;
      ay = y;
    } else {
      bx = x;
      by = y;
    }
  }
  return undefined;
}

/**
 * Draw a line using Bresenham's algorithm.
 */
export function drawLine(c: BrailleCanvas, x1: number, y1: number, x2: number, y2: number): void {
  const startX = coordinate(x1);
  const startY = coordinate(y1);
  const endX = coordinate(x2);
  const endY = coordinate(y2);
  if (startX === undefined || startY === undefined || endX === undefined || endY === undefined) return;
  const clipped = clipLine(c, startX, startY, endX, endY);
  if (!clipped) return;
  let [cx, cy, targetX, targetY] = clipped;
  const dx = Math.abs(targetX - cx);
  const dy = -Math.abs(targetY - cy);
  const sx = cx < targetX ? 1 : -1;
  const sy = cy < targetY ? 1 : -1;
  let err = dx + dy;

  for (;;) {
    c.set(cx, cy);
    if (cx === targetX && cy === targetY) break;
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
  const left = coordinate(x);
  const top = coordinate(y);
  const width = positiveExtent(w);
  const height = positiveExtent(h);
  if (left === undefined || top === undefined || width === undefined || height === undefined) return;
  const x2 = left + width - 1;
  const y2 = top + height - 1;
  drawLine(c, left, top, x2, top); // top
  drawLine(c, left, y2, x2, y2); // bottom
  drawLine(c, left, top, left, y2); // left
  drawLine(c, x2, top, x2, y2); // right
}

/**
 * Fill a rectangle with pixels (scanline fill).
 */
export function fillRect(c: BrailleCanvas, x: number, y: number, w: number, h: number): void {
  const left = coordinate(x);
  const top = coordinate(y);
  const width = positiveExtent(w);
  const height = positiveExtent(h);
  if (left === undefined || top === undefined || width === undefined || height === undefined) return;
  const startX = Math.max(0, left);
  const startY = Math.max(0, top);
  const endX = Math.min(c.pixelWidth, left + width);
  const endY = Math.min(c.pixelHeight, top + height);
  for (let py = startY; py < endY; py++) {
    for (let px = startX; px < endX; px++) {
      c.set(px, py);
    }
  }
}

/**
 * Draw a circle outline using the midpoint circle algorithm with 8-way symmetry.
 */
export function drawCircle(c: BrailleCanvas, cx: number, cy: number, r: number): void {
  const centerX = coordinate(cx);
  const centerY = coordinate(cy);
  const radius = nonNegativeRadius(r);
  if (centerX === undefined || centerY === undefined || radius === undefined) return;
  if (radius === 0) {
    c.set(centerX, centerY);
    return;
  }
  if (centerX + radius < 0 || centerX - radius >= c.pixelWidth || centerY + radius < 0 || centerY - radius >= c.pixelHeight) return;
  if (radius > Math.max(c.pixelWidth, c.pixelHeight) * 2 + 2) {
    const startX = Math.max(0, centerX - radius);
    const endX = Math.min(c.pixelWidth - 1, centerX + radius);
    const startY = Math.max(0, centerY - radius);
    const endY = Math.min(c.pixelHeight - 1, centerY + radius);
    for (let py = startY; py <= endY; py++) {
      for (let px = startX; px <= endX; px++) {
        const distance = Math.hypot(px - centerX, py - centerY);
        if (Math.abs(distance - radius) <= 0.75) c.set(px, py);
      }
    }
    return;
  }
  let x = radius;
  let y = 0;
  let d = 1 - radius;

  while (x >= y) {
    // 8-way symmetry
    c.set(centerX + x, centerY + y);
    c.set(centerX - x, centerY + y);
    c.set(centerX + x, centerY - y);
    c.set(centerX - x, centerY - y);
    c.set(centerX + y, centerY + x);
    c.set(centerX - y, centerY + x);
    c.set(centerX + y, centerY - x);
    c.set(centerX - y, centerY - x);

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
  const centerX = coordinate(cx);
  const centerY = coordinate(cy);
  const radius = nonNegativeRadius(r);
  if (centerX === undefined || centerY === undefined || radius === undefined) return;
  const startX = Math.max(0, centerX - radius);
  const endX = Math.min(c.pixelWidth - 1, centerX + radius);
  const startY = Math.max(0, centerY - radius);
  const endY = Math.min(c.pixelHeight - 1, centerY + radius);
  const squaredRadius = radius * radius;
  for (let py = startY; py <= endY; py++) {
    for (let px = startX; px <= endX; px++) {
      const dx = px - centerX;
      const dy = py - centerY;
      if (dx * dx + dy * dy <= squaredRadius) {
        c.set(px, py);
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
  const centerX = coordinate(cx);
  const centerY = coordinate(cy);
  const radius = nonNegativeRadius(r);
  if (centerX === undefined || centerY === undefined || radius === undefined || !Number.isFinite(aspect) || aspect <= 0) return;
  if (aspect === 1.0) {
    drawCircle(c, centerX, centerY, radius);
    return;
  }
  if (radius === 0) {
    c.set(centerX, centerY);
    return;
  }

  // To make a circle appear circular on screen, we need to stretch the
  // pixel-space shape along the axis where pixels are smaller. With
  // aspect < 1 (pixels wider than tall), we stretch vertically.
  // The effective Y radius in pixel space is r / aspect.
  const ry = Math.max(1, Math.min(MAX_DRAW_COORDINATE, Math.round(radius / aspect)));
  const rx = radius;
  const startX = Math.max(0, centerX - rx);
  const endX = Math.min(c.pixelWidth - 1, centerX + rx);
  const startY = Math.max(0, centerY - ry);
  const endY = Math.min(c.pixelHeight - 1, centerY + ry);

  // Scan bounding box and test ellipse equation: (dx/rx)^2 + (dy/ry)^2 <= 1
  // But only set pixels on the approximate boundary (within 1 pixel of edge)
  for (let py = startY; py <= endY; py++) {
    for (let px = startX; px <= endX; px++) {
      const dx = px - centerX;
      const dy = py - centerY;
      const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
      // Approximate outline: 1 pixel thick ring around the boundary
      if (d >= 0.85 && d <= 1.15) {
        c.set(px, py);
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
  const centerX = coordinate(cx);
  const centerY = coordinate(cy);
  const radius = nonNegativeRadius(r);
  if (centerX === undefined || centerY === undefined || radius === undefined || !Number.isFinite(aspect) || aspect <= 0) return;
  if (aspect === 1.0) {
    fillCircle(c, centerX, centerY, radius);
    return;
  }
  if (radius === 0) {
    c.set(centerX, centerY);
    return;
  }

  const ry = Math.max(1, Math.min(MAX_DRAW_COORDINATE, Math.round(radius / aspect)));
  const rx = radius;
  const startX = Math.max(0, centerX - rx);
  const endX = Math.min(c.pixelWidth - 1, centerX + rx);
  const startY = Math.max(0, centerY - ry);
  const endY = Math.min(c.pixelHeight - 1, centerY + ry);

  for (let py = startY; py <= endY; py++) {
    for (let px = startX; px <= endX; px++) {
      const dx = px - centerX;
      const dy = py - centerY;
      if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1.0) {
        c.set(px, py);
      }
    }
  }
}

/**
 * Draw text using the bitmap font.
 * Each character is rendered as a 3x5 pixel glyph with GLYPH_SPACING pixels between.
 */
export function drawText(c: BrailleCanvas, x: number, y: number, str: string): void {
  const startX = coordinate(x);
  const startY = coordinate(y);
  if (startX === undefined || startY === undefined) return;
  let curX = startX;

  let glyphCount = 0;
  for (const ch of str) {
    if (glyphCount++ >= 1_000_000 || curX >= c.pixelWidth) break;
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
          c.set(curX + gx, startY + gy);
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
  const startX = coordinate(x);
  const startY = coordinate(y);
  if (startX === undefined || startY === undefined) return;
  let curX = startX;

  let glyphCount = 0;
  for (const ch of str) {
    if (glyphCount++ >= 1_000_000 || curX >= c.pixelWidth) break;
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
          c.set(curX + gx, startY + gy);
        }
      }
    }

    curX += glyph.width + GLYPH_HD_SPACING;
  }
}
