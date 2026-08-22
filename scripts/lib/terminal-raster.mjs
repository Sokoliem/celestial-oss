/**
 * Shared terminal-grid rasterizer: styled cell grids → RGBA pixels using the
 * vendored public-domain unscii-16 bitmap font (regenerate with
 * scripts/vendor-unscii.mjs). Used by record-demo.mjs and social-card.mjs.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fontBin = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'unscii-16-subset.bin'));
const GLYPH_COUNT = fontBin.length / 20;

export function glyphFor(codepoint) {
  let lo = 0;
  let hi = GLYPH_COUNT - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cp = fontBin.readUInt32LE(mid * 20);
    if (cp === codepoint) return fontBin.subarray(mid * 20 + 4, mid * 20 + 20);
    if (cp < codepoint) lo = mid + 1;
    else hi = mid - 1;
  }
  return glyphFor(0x3f); // '?'
}

export const CELL_W = 8;
export const CELL_H = 16;

export const BASE16 = [
  '#000000', '#cc0000', '#4e9a06', '#c4a000', '#3465a4', '#75507b', '#06989a', '#d3d7cf',
  '#555753', '#ef2929', '#8ae234', '#fce94f', '#729fcf', '#ad7fa8', '#34e2e2', '#eeeeec',
].map(hexToRgb);

export function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function xterm256(n) {
  if (n < 16) return BASE16[n];
  if (n < 232) {
    const i = n - 16;
    const steps = [0, 95, 135, 175, 215, 255];
    return [steps[Math.floor(i / 36) % 6], steps[Math.floor(i / 6) % 6], steps[i % 6]];
  }
  const g = 8 + (n - 232) * 10;
  return [g, g, g];
}

/** Parse an SGR color escape ("\x1b[38;5;196m", "\x1b[38;2;R;G;Bm", "\x1b[31m") to RGB. */
export function parseSgrColor(escape) {
  if (!escape) return null;
  const m = /\[(\d+(?:;\d+)*)m/.exec(escape);
  if (!m) return null;
  const parts = m[1].split(';').map(Number);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if ((p === 38 || p === 48) && parts[i + 1] === 5) return xterm256(parts[i + 2]);
    if ((p === 38 || p === 48) && parts[i + 1] === 2) return [parts[i + 2], parts[i + 3], parts[i + 4]];
    if (p >= 30 && p <= 37) return BASE16[p - 30];
    if (p >= 90 && p <= 97) return BASE16[p - 90 + 8];
    if (p >= 40 && p <= 47) return BASE16[p - 40];
    if (p >= 100 && p <= 107) return BASE16[p - 100 + 8];
  }
  return null;
}

export const DEFAULT_BG = hexToRgb('#0b0f14');
export const DEFAULT_FG = hexToRgb('#d3d7cf');

export function shade(rgb, factor) {
  return rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * factor))));
}

export function createCanvas(width, height, bg = DEFAULT_BG) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.set([...bg, 255], i * 4);
  return { rgba, width, height };
}

export function setPixel(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const px = (y * canvas.width + x) * 4;
  canvas.rgba[px] = color[0];
  canvas.rgba[px + 1] = color[1];
  canvas.rgba[px + 2] = color[2];
  canvas.rgba[px + 3] = 255;
}

/** Alpha-blend a solid rectangle over the canvas. */
export function fillRect(canvas, x0, y0, w, h, color, alpha = 1) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
      const px = (y * canvas.width + x) * 4;
      for (let c = 0; c < 3; c++) {
        canvas.rgba[px + c] = Math.round(color[c] * alpha + canvas.rgba[px + c] * (1 - alpha));
      }
      canvas.rgba[px + 3] = 255;
    }
  }
}

/** Draw one glyph at an integer pixel position with integer scale. */
export function drawGlyph(canvas, codepoint, x0, y0, scale, color) {
  const glyph = glyphFor(codepoint);
  for (let gy = 0; gy < CELL_H; gy++) {
    const bits = glyph[gy];
    for (let gx = 0; gx < CELL_W; gx++) {
      if (((bits >> (7 - gx)) & 1) !== 1) continue;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          setPixel(canvas, x0 + gx * scale + sx, y0 + gy * scale + sy, color);
        }
      }
    }
  }
}

/** Draw a string of text. Returns the x position after the last glyph. */
export function drawText(canvas, text, x0, y0, scale, color) {
  let x = x0;
  for (const char of text) {
    drawGlyph(canvas, char.codePointAt(0), x, y0, scale, color);
    x += CELL_W * scale;
  }
  return x;
}

/** Rasterize a styled CellGrid (planLayout + rasterize output) into a canvas. */
export function rasterizeFrame(grid, scale = 2, canvas = createCanvas(grid.width * CELL_W * scale, grid.height * CELL_H * scale)) {
  for (let row = 0; row < grid.height; row++) {
    const line = grid.cells[row] ?? [];
    for (let col = 0; col < grid.width; col++) {
      const cell = line[col];
      if (!cell || cell.opaqueId) continue;
      const style = cell.style ?? {};
      let fg = parseSgrColor(style.fg) ?? DEFAULT_FG;
      let bg = parseSgrColor(style.bg) ?? DEFAULT_BG;
      if (style.reverse) [fg, bg] = [bg, fg];
      if (style.bold) fg = shade(fg, 1.3);
      if (style.dim) fg = shade(fg, 0.68);
      if (style.hidden) fg = bg;

      const glyph = glyphFor(cell.char.codePointAt(0) ?? 0x20);
      const x0 = col * CELL_W * scale;
      const y0 = row * CELL_H * scale;

      for (let gy = 0; gy < CELL_H; gy++) {
        const bits = glyph[gy];
        const isUnderlineRow = style.underline && gy === CELL_H - 1;
        for (let gx = 0; gx < CELL_W; gx++) {
          const on = isUnderlineRow || ((bits >> (7 - gx)) & 1) === 1;
          const color = on ? fg : bg;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              setPixel(canvas, x0 + gx * scale + sx, y0 + gy * scale + sy, color);
            }
          }
        }
      }
    }
  }
  return canvas;
}
