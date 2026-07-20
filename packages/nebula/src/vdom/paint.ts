/**
 * Extracted from ../vdom.ts. Behavior-preserving split.
 */

import { segmentGraphemes } from '@celestial/rosetta';
import type { Cell, CellGrid } from './cells.js';
import type { TextNode } from './nodes.js';
import type { ResolvedStyleAttrs } from './style.js';
import { visualWidth, wrapText } from './visual-width.js';

export function setCellTransparent(grid: CellGrid, row: number, col: number, char: string, style: ResolvedStyleAttrs): void {
  if (row >= 0 && row < grid.height && col >= 0 && col < grid.width) {
    // Skip "empty" overlay cells — allow base content to show through
    if (char === ' ' && !style.bg) return;
    grid.cells[row]![col] = { char, style };
  }
}

export function setCell(grid: CellGrid, row: number, col: number, char: string, style: ResolvedStyleAttrs, href?: string): void {
  if (row >= 0 && row < grid.height && col >= 0 && col < grid.width) {
    const cell: Cell = { char, style };
    if (href) cell.href = href;
    grid.cells[row]![col] = cell;
  }
}

export function writeRenderedCell(
  grid: CellGrid,
  row: number,
  col: number,
  char: string,
  style: ResolvedStyleAttrs,
  transparent: boolean,
  href?: string,
): number {
  const measuredWidth = visualWidth(char);
  if (measuredWidth <= 0) return 0;
  const width = measuredWidth;

  if (transparent) {
    setCellTransparent(grid, row, col, char, style);
  } else {
    setCell(grid, row, col, char, style, href);
  }

  for (let offset = 1; offset < width; offset++) {
    setCell(grid, row, col + offset, ' ', style, href);
  }

  return width;
}

/** Parse ANSI SGR codes from a string and yield chars with accumulated style */
export function parseAnsiLine(line: string, baseStyle: ResolvedStyleAttrs): Array<{ char: string; style: ResolvedStyleAttrs }> {
  const result: Array<{ char: string; style: ResolvedStyleAttrs }> = [];
  let currentStyle: ResolvedStyleAttrs = { ...baseStyle };
  let i = 0;

  while (i < line.length) {
    // Check for ANSI escape sequence
    if (line[i] === '\x1b' && line[i + 1] === '[') {
      // Find the end of the sequence (terminated by 'm')
      let j = i + 2;
      while (j < line.length && line[j] !== 'm') j++;
      if (j < line.length) {
        const codes = line
          .slice(i + 2, j)
          .split(';')
          .map(Number);
        currentStyle = applyAnsiCodes(currentStyle, codes, baseStyle);
        i = j + 1;
        continue;
      }
    }
    // Check for OSC sequence (e.g., OSC 8 hyperlinks: \x1b]8;params;url\x07)
    if (line[i] === '\x1b' && line[i + 1] === ']') {
      let j = i + 2;
      // Scan forward to BEL (\x07) or ST (\x1b\\)
      while (j < line.length) {
        if (line[j] === '\x07') {
          j++; // skip past BEL
          break;
        }
        if (line[j] === '\x1b' && line[j + 1] === '\\') {
          j += 2; // skip past ST (\x1b\\)
          break;
        }
        j++;
      }
      i = j;
      continue;
    }
    const nextEscape = line.indexOf('\x1b', i);
    const plainEnd = nextEscape === -1 ? line.length : nextEscape;
    if (plainEnd === i) {
      // Preserve malformed or unsupported escapes as a zero-width/control
      // unit while guaranteeing progress through the input.
      result.push({ char: line[i]!, style: { ...currentStyle } });
      i++;
      continue;
    }
    for (const grapheme of segmentGraphemes(line.slice(i, plainEnd))) {
      result.push({ char: grapheme, style: { ...currentStyle } });
    }
    i = plainEnd;
  }

  return result;
}

/** Apply ANSI SGR codes to a style, mutating a copy */
// ── ANSI color lookup tables for fgRgb/bgRgb ────────────────────────────

/** Standard ANSI 16-color palette (8 normal + 8 bright) → RGB */
const ANSI_16_FG_RGB: Array<[number, number, number]> = [
  [0, 0, 0], // 30/40 black
  [128, 0, 0], // 31/41 red
  [0, 128, 0], // 32/42 green
  [128, 128, 0], // 33/43 yellow
  [0, 0, 128], // 34/44 blue
  [128, 0, 128], // 35/45 magenta
  [0, 128, 128], // 36/46 cyan
  [192, 192, 192], // 37/47 white
  [128, 128, 128], // 90/100 bright black (gray)
  [255, 0, 0], // 91/101 bright red
  [0, 255, 0], // 92/102 bright green
  [255, 255, 0], // 93/103 bright yellow
  [0, 0, 255], // 94/104 bright blue
  [255, 0, 255], // 95/105 bright magenta
  [0, 255, 255], // 96/106 bright cyan
  [255, 255, 255], // 97/107 bright white
];

/** Convert ANSI 256-color index to RGB tuple */
function ansi256ToRgb(n: number): [number, number, number] {
  if (n < 16) return ANSI_16_FG_RGB[n]!;
  if (n < 232) {
    // 6x6x6 color cube (indices 16-231)
    const idx = n - 16;
    const r = Math.floor(idx / 36);
    const g = Math.floor((idx % 36) / 6);
    const b = idx % 6;
    return [r ? r * 40 + 55 : 0, g ? g * 40 + 55 : 0, b ? b * 40 + 55 : 0];
  }
  // Grayscale ramp (indices 232-255)
  const v = (n - 232) * 10 + 8;
  return [v, v, v];
}

function applyAnsiCodes(current: ResolvedStyleAttrs, codes: number[], base: ResolvedStyleAttrs): ResolvedStyleAttrs {
  const s: ResolvedStyleAttrs = { ...current };

  for (let ci = 0; ci < codes.length; ci++) {
    const code = codes[ci]!;
    switch (code) {
      case 0: // reset
        return { ...base };
      case 1:
        s.bold = true;
        break;
      case 2:
        s.dim = true;
        break;
      case 3:
        s.italic = true;
        break;
      case 4:
        s.underline = true;
        break;
      case 9:
        s.strikethrough = true;
        break;
      case 22:
        s.bold = false;
        s.dim = false;
        break;
      case 23:
        s.italic = false;
        break;
      case 24:
        s.underline = false;
        break;
      case 29:
        s.strikethrough = false;
        break;
      // Foreground colors (ANSI 16)
      case 30:
        s.fg = `\x1b[${code}m`;
        s.fgRgb = ANSI_16_FG_RGB[0];
        break;
      case 31:
        s.fg = `\x1b[${code}m`;
        s.fgRgb = ANSI_16_FG_RGB[1];
        break;
      case 32:
        s.fg = `\x1b[${code}m`;
        s.fgRgb = ANSI_16_FG_RGB[2];
        break;
      case 33:
        s.fg = `\x1b[${code}m`;
        s.fgRgb = ANSI_16_FG_RGB[3];
        break;
      case 34:
        s.fg = `\x1b[${code}m`;
        s.fgRgb = ANSI_16_FG_RGB[4];
        break;
      case 35:
        s.fg = `\x1b[${code}m`;
        s.fgRgb = ANSI_16_FG_RGB[5];
        break;
      case 36:
        s.fg = `\x1b[${code}m`;
        s.fgRgb = ANSI_16_FG_RGB[6];
        break;
      case 37:
        s.fg = `\x1b[${code}m`;
        s.fgRgb = ANSI_16_FG_RGB[7];
        break;
      case 39: // reset fg
        s.fg = base.fg;
        s.fgRgb = base.fgRgb;
        break;
      // Bright foreground
      case 90:
        s.fg = `\x1b[${code}m`;
        s.fgRgb = ANSI_16_FG_RGB[8];
        break;
      case 91:
        s.fg = `\x1b[${code}m`;
        s.fgRgb = ANSI_16_FG_RGB[9];
        break;
      case 92:
        s.fg = `\x1b[${code}m`;
        s.fgRgb = ANSI_16_FG_RGB[10];
        break;
      case 93:
        s.fg = `\x1b[${code}m`;
        s.fgRgb = ANSI_16_FG_RGB[11];
        break;
      case 94:
        s.fg = `\x1b[${code}m`;
        s.fgRgb = ANSI_16_FG_RGB[12];
        break;
      case 95:
        s.fg = `\x1b[${code}m`;
        s.fgRgb = ANSI_16_FG_RGB[13];
        break;
      case 96:
        s.fg = `\x1b[${code}m`;
        s.fgRgb = ANSI_16_FG_RGB[14];
        break;
      case 97:
        s.fg = `\x1b[${code}m`;
        s.fgRgb = ANSI_16_FG_RGB[15];
        break;
      // Background colors (ANSI 16)
      case 40:
        s.bg = `\x1b[${code}m`;
        s.bgRgb = ANSI_16_FG_RGB[0];
        break;
      case 41:
        s.bg = `\x1b[${code}m`;
        s.bgRgb = ANSI_16_FG_RGB[1];
        break;
      case 42:
        s.bg = `\x1b[${code}m`;
        s.bgRgb = ANSI_16_FG_RGB[2];
        break;
      case 43:
        s.bg = `\x1b[${code}m`;
        s.bgRgb = ANSI_16_FG_RGB[3];
        break;
      case 44:
        s.bg = `\x1b[${code}m`;
        s.bgRgb = ANSI_16_FG_RGB[4];
        break;
      case 45:
        s.bg = `\x1b[${code}m`;
        s.bgRgb = ANSI_16_FG_RGB[5];
        break;
      case 46:
        s.bg = `\x1b[${code}m`;
        s.bgRgb = ANSI_16_FG_RGB[6];
        break;
      case 47:
        s.bg = `\x1b[${code}m`;
        s.bgRgb = ANSI_16_FG_RGB[7];
        break;
      case 49: // reset bg
        s.bg = base.bg;
        s.bgRgb = base.bgRgb;
        break;
      // Bright background
      case 100:
        s.bg = `\x1b[${code}m`;
        s.bgRgb = ANSI_16_FG_RGB[8];
        break;
      case 101:
        s.bg = `\x1b[${code}m`;
        s.bgRgb = ANSI_16_FG_RGB[9];
        break;
      case 102:
        s.bg = `\x1b[${code}m`;
        s.bgRgb = ANSI_16_FG_RGB[10];
        break;
      case 103:
        s.bg = `\x1b[${code}m`;
        s.bgRgb = ANSI_16_FG_RGB[11];
        break;
      case 104:
        s.bg = `\x1b[${code}m`;
        s.bgRgb = ANSI_16_FG_RGB[12];
        break;
      case 105:
        s.bg = `\x1b[${code}m`;
        s.bgRgb = ANSI_16_FG_RGB[13];
        break;
      case 106:
        s.bg = `\x1b[${code}m`;
        s.bgRgb = ANSI_16_FG_RGB[14];
        break;
      case 107:
        s.bg = `\x1b[${code}m`;
        s.bgRgb = ANSI_16_FG_RGB[15];
        break;
      // 256-color and true color
      case 38: // fg extended
        if (codes[ci + 1] === 5 && ci + 2 < codes.length) {
          const n = codes[ci + 2]!;
          s.fg = `\x1b[38;5;${n}m`;
          s.fgRgb = ansi256ToRgb(n);
          ci += 2;
        } else if (codes[ci + 1] === 2 && ci + 4 < codes.length) {
          const r = codes[ci + 2]!,
            g = codes[ci + 3]!,
            b = codes[ci + 4]!;
          s.fg = `\x1b[38;2;${r};${g};${b}m`;
          s.fgRgb = [r, g, b];
          ci += 4;
        }
        break;
      case 48: // bg extended
        if (codes[ci + 1] === 5 && ci + 2 < codes.length) {
          const n = codes[ci + 2]!;
          s.bg = `\x1b[48;5;${n}m`;
          s.bgRgb = ansi256ToRgb(n);
          ci += 2;
        } else if (codes[ci + 1] === 2 && ci + 4 < codes.length) {
          const r = codes[ci + 2]!,
            g = codes[ci + 3]!,
            b = codes[ci + 4]!;
          s.bg = `\x1b[48;2;${r};${g};${b}m`;
          s.bgRgb = [r, g, b];
          ci += 4;
        }
        break;
    }
  }
  return s;
}

export function renderText(node: TextNode, resolvedStyle: ResolvedStyleAttrs, grid: CellGrid, x: number, y: number, availW: number, availH: number): void {
  const lines = node.wrap ? wrapText(node.content, availW) : node.content.split('\n');
  const baseStyle = resolvedStyle ?? {};
  const gradientFg = baseStyle.gradientFg;
  const maxLines = Math.min(lines.length, availH);

  let globalCharIdx = 0;
  for (let lineIdx = 0; lineIdx < maxLines; lineIdx++) {
    const parsed = parseAnsiLine(lines[lineIdx]!, baseStyle);
    let colOffset = 0;
    for (let charIdx = 0; charIdx < parsed.length; charIdx++) {
      if (colOffset >= availW) break;
      const cell = parsed[charIdx]!;
      const w = visualWidth(cell.char);
      if (w === 0) continue; // skip zero-width chars (combining marks, ZWJ, etc.)
      if (colOffset + w > availW) break; // wide char would overflow
      // Apply per-character gradient foreground if available
      const cellStyle = gradientFg && globalCharIdx < gradientFg.length ? { ...cell.style, fg: gradientFg[globalCharIdx] } : cell.style;
      colOffset += writeRenderedCell(grid, y + lineIdx, x + colOffset, cell.char, cellStyle, false, node.href);
      globalCharIdx++;
    }
  }
}

export function renderTextTransparent(
  node: TextNode,
  resolvedStyle: ResolvedStyleAttrs,
  grid: CellGrid,
  x: number,
  y: number,
  availW: number,
  availH: number,
): void {
  const lines = node.wrap ? wrapText(node.content, availW) : node.content.split('\n');
  const baseStyle = resolvedStyle ?? {};
  const maxLines = Math.min(lines.length, availH);

  for (let lineIdx = 0; lineIdx < maxLines; lineIdx++) {
    const parsed = parseAnsiLine(lines[lineIdx]!, baseStyle);
    let colOffset = 0;
    for (let charIdx = 0; charIdx < parsed.length; charIdx++) {
      if (colOffset >= availW) break;
      const cell = parsed[charIdx]!;
      const w = visualWidth(cell.char);
      if (w === 0) continue; // skip zero-width chars (combining marks, ZWJ, etc.)
      if (colOffset + w > availW) break;
      colOffset += writeRenderedCell(grid, y + lineIdx, x + colOffset, cell.char, cell.style, true);
    }
  }
}
