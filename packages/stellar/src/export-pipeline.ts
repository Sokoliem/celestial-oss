/**
 * Export Pipeline — convert BrailleCanvas output to various formats.
 *
 * Supported formats:
 *   - ANSI:      Terminal-ready string with ANSI escape sequences (canvas.render())
 *   - PlainText: Unicode characters with all ANSI styling stripped
 *   - HTML:      <pre> block with <span style="color:..."> for each color run
 *   - SVG:       Vector graphic with <rect> elements for each lit sub-pixel
 *   - PixelData: Raw boolean grid of sub-pixel state for external image libs
 *
 * Uses corona's stripAllStyles() for ANSI removal — no duplication.
 */
import type { Color } from '@celestial/corona';
import { stripAllStyles } from '@celestial/corona';
import type { BrailleCanvas } from './canvas.js';
import type { CellCodec } from './codec.js';
import { cssStyleToString, escapeHtml, parseAnsiString } from './html-export.js';

// ── Types ───────────────────────────────────────────────────────────────────

/** Options for SVG export. */
export interface SvgExportOpts {
  /** Width of a single sub-pixel in SVG units. Default: 4 */
  pixelSize?: number;
  /** Gap between sub-pixels in SVG units. Default: 0.5 */
  pixelGap?: number;
  /** Background fill for the SVG. Default: '#1e1e2e' (dark terminal bg) */
  background?: string;
  /** Default foreground color (CSS) when a cell has no color set. Default: '#cdd6f4' */
  defaultForeground?: string;
  /** Include XML declaration. Default: false */
  xmlDeclaration?: boolean;
  /** Additional CSS class on the root <svg> element */
  className?: string;
}

/** Options for HTML export. */
export interface HtmlExportOpts {
  /** Wrap in a full HTML document (<!DOCTYPE> + <html>). Default: false */
  fullDocument?: boolean;
  /** Font family for the <pre> block. Default: monospace */
  fontFamily?: string;
  /** Font size. Default: '14px' */
  fontSize?: string;
  /** Background color (CSS). Default: '#1e1e2e' */
  background?: string;
  /** Default foreground color (CSS). Default: '#cdd6f4' */
  defaultForeground?: string;
  /** Additional CSS class on the <pre> element */
  className?: string;
  /** Line height. Default: '1.2' */
  lineHeight?: string;
}

/** Options for plain text export. */
export interface PlainTextExportOpts {
  /** Include trailing newline. Default: true */
  trailingNewline?: boolean;
}

/** Sub-pixel data grid — rows of columns, true = lit pixel. */
export interface PixelGrid {
  /** Width in sub-pixels */
  width: number;
  /** Height in sub-pixels */
  height: number;
  /** Row-major boolean grid: data[y][x] */
  data: boolean[][];
}

/** Options for pixel data export. */
export interface PixelDataExportOpts {
  /** Also include per-pixel color info. Default: false */
  includeColors?: boolean;
}

/** Extended pixel grid with optional color information. */
export interface ColorPixelGrid extends PixelGrid {
  /** Per-pixel RGB colors (if includeColors was true). colors[y][x] or null if unlit. */
  colors?: ([number, number, number] | null)[][];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract RGB tuple from a Color, falling back to the provided default.
 */
function colorRgb(c: Color | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!c) return fallback;
  return c.rgb ?? fallback;
}

/**
 * Convert an RGB tuple to a CSS rgb() string.
 */
function rgbCss(rgb: [number, number, number]): string {
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

/**
 * Decode which sub-pixels are lit given a cell bitmask and codec.
 * Returns an array of [dx, dy] positions that are set.
 */
function litSubPixels(bitmask: number, codec: CellCodec): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  for (let dy = 0; dy < codec.subRows; dy++) {
    for (let dx = 0; dx < codec.subCols; dx++) {
      if (bitmask & codec.dotBit(dy, dx)) {
        result.push([dx, dy]);
      }
    }
  }
  return result;
}

// ── ANSI Export ─────────────────────────────────────────────────────────────

/**
 * Export as ANSI terminal string. This is simply `canvas.render()` for
 * API completeness — all other exports build on the canvas accessors instead.
 */
export function toAnsi(canvas: BrailleCanvas): string {
  return canvas.render();
}

// ── Plain Text Export ───────────────────────────────────────────────────────

/**
 * Export as plain text with all ANSI escape sequences stripped.
 * Uses corona's `stripAllStyles()` — no duplication.
 */
export function toPlainText(canvas: BrailleCanvas, opts?: PlainTextExportOpts): string {
  const ansi = canvas.render();
  const plain = stripAllStyles(ansi);
  const trailing = opts?.trailingNewline ?? true;
  return trailing ? plain + '\n' : plain;
}

// ── HTML Export ─────────────────────────────────────────────────────────────

/**
 * Export as HTML with inline styles for colors.
 *
 * Generates a <pre> block where each terminal cell is wrapped in a <span>
 * with inline CSS color/background-color when the cell has color. Adjacent
 * cells with the same color are merged into a single span for compactness.
 */
export function toHtml(canvas: BrailleCanvas, opts?: HtmlExportOpts): string {
  const {
    fullDocument = false,
    fontFamily = 'monospace',
    fontSize = '14px',
    background = '#1e1e2e',
    defaultForeground = '#cdd6f4',
    className,
    lineHeight = '1.2',
  } = opts ?? {};

  const codec = canvas.getCodec();
  const defaultFgRgb: [number, number, number] = parseHexColor(defaultForeground);
  const lines: string[] = [];

  for (let row = 0; row < canvas.height; row++) {
    let line = '';
    let runFg: string | undefined;
    let runBg: string | undefined;
    let runChars = '';

    for (let col = 0; col < canvas.width; col++) {
      const bitmask = canvas.getCellBitmask(row, col);
      const ch = codec.toChar(bitmask);
      const cellColor = canvas.getCellColor(row, col);

      const fgRgb = colorRgb(cellColor?.fg, defaultFgRgb);
      const bgRgb = cellColor?.bg ? colorRgb(cellColor.bg, [0, 0, 0]) : undefined;

      const fgCss = rgbCss(fgRgb);
      const bgCss = bgRgb ? rgbCss(bgRgb) : undefined;

      // If same style as current run, append
      if (fgCss === runFg && bgCss === runBg) {
        runChars += escapeHtml(ch);
      } else {
        // Flush previous run
        if (runChars) {
          line += buildSpan(runChars, runFg, runBg, defaultForeground);
        }
        runFg = fgCss;
        runBg = bgCss;
        runChars = escapeHtml(ch);
      }
    }

    // Flush final run
    if (runChars) {
      line += buildSpan(runChars, runFg, runBg, defaultForeground);
    }

    lines.push(line);
  }

  const classAttr = className ? ` class="${escapeHtml(className)}"` : '';
  const preStyle = `font-family:${fontFamily};font-size:${fontSize};line-height:${lineHeight};background:${background};color:${defaultForeground};padding:8px;overflow-x:auto;`;
  const preBlock = `<pre${classAttr} style="${escapeHtml(preStyle)}">${lines.join('\n')}</pre>`;

  if (!fullDocument) return preBlock;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chart Export</title>
<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:${escapeHtml(background)}}</style>
</head>
<body>
${preBlock}
</body>
</html>`;
}

function buildSpan(chars: string, fg: string | undefined, bg: string | undefined, defaultFg: string): string {
  // If both fg and bg are defaults, just emit raw chars
  if (!bg && fg === rgbCss(parseHexColor(defaultFg))) {
    return chars;
  }

  let style = '';
  if (fg) style += `color:${fg};`;
  if (bg) style += `background-color:${bg};`;

  if (!style) return chars;
  return `<span style="${style}">${chars}</span>`;
}

// ── SVG Export ──────────────────────────────────────────────────────────────

/**
 * Export as SVG with sub-pixel rectangles.
 *
 * Each lit sub-pixel in the canvas becomes a colored <rect> element.
 * Cells are grouped by row for readability. Colors come from the canvas
 * color map; cells without explicit color use `defaultForeground`.
 */
export function toSvg(canvas: BrailleCanvas, opts?: SvgExportOpts): string {
  const { pixelSize = 4, pixelGap = 0.5, background = '#1e1e2e', defaultForeground = '#cdd6f4', xmlDeclaration = false, className } = opts ?? {};

  const codec = canvas.getCodec();
  const defaultFgRgb = parseHexColor(defaultForeground);

  // Cell size in SVG units = subCols * pixelSize + (subCols-1) * pixelGap
  const cellW = codec.subCols * pixelSize + Math.max(0, codec.subCols - 1) * pixelGap;
  const cellH = codec.subRows * pixelSize + Math.max(0, codec.subRows - 1) * pixelGap;

  // Inter-cell gap matches pixel gap
  const totalW = canvas.width * (cellW + pixelGap) - pixelGap;
  const totalH = canvas.height * (cellH + pixelGap) - pixelGap;

  const rects: string[] = [];

  for (let row = 0; row < canvas.height; row++) {
    for (let col = 0; col < canvas.width; col++) {
      const bitmask = canvas.getCellBitmask(row, col);
      if (bitmask === 0) continue;

      const cellColor = canvas.getCellColor(row, col);
      const fgRgb = colorRgb(cellColor?.fg, defaultFgRgb);
      const fill = rgbCss(fgRgb);

      // Origin of this terminal cell in SVG coordinates
      const cellX = col * (cellW + pixelGap);
      const cellY = row * (cellH + pixelGap);

      const lit = litSubPixels(bitmask, codec);
      for (const [dx, dy] of lit) {
        const x = cellX + dx * (pixelSize + pixelGap);
        const y = cellY + dy * (pixelSize + pixelGap);
        rects.push(`<rect x="${x}" y="${y}" width="${pixelSize}" height="${pixelSize}" fill="${fill}"/>`);
      }
    }
  }

  const classAttr = className ? ` class="${escapeHtml(className)}"` : '';
  const lines: string[] = [];

  if (xmlDeclaration) {
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  }

  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}"${classAttr}>`,
    `<rect width="${totalW}" height="${totalH}" fill="${escapeHtml(background)}" rx="2"/>`,
    ...rects,
    '</svg>',
  );

  return lines.join('\n');
}

// ── Pixel Data Export ───────────────────────────────────────────────────────

/**
 * Export as a raw boolean pixel grid suitable for image library consumption.
 *
 * Each sub-pixel position is represented as a boolean in a row-major 2D array.
 * Optionally includes per-pixel RGB color data.
 */
export function toPixelData(canvas: BrailleCanvas, opts?: PixelDataExportOpts): ColorPixelGrid {
  const includeColors = opts?.includeColors ?? false;
  const codec = canvas.getCodec();

  const data: boolean[][] = [];
  const colors: ([number, number, number] | null)[][] | undefined = includeColors ? [] : undefined;

  for (let py = 0; py < canvas.pixelHeight; py++) {
    const row: boolean[] = [];
    const colorRow: ([number, number, number] | null)[] | undefined = includeColors ? [] : undefined;

    for (let px = 0; px < canvas.pixelWidth; px++) {
      const lit = canvas.get(px, py);
      row.push(lit);

      if (colorRow) {
        if (lit) {
          // Map pixel position back to terminal cell
          const cellCol = Math.floor(px / codec.subCols);
          const cellRow = Math.floor(py / codec.subRows);
          const cellColor = canvas.getCellColor(cellRow, cellCol);
          colorRow.push(cellColor?.fg?.rgb ?? null);
        } else {
          colorRow.push(null);
        }
      }
    }

    data.push(row);
    if (colors && colorRow) colors.push(colorRow);
  }

  const result: ColorPixelGrid = {
    width: canvas.pixelWidth,
    height: canvas.pixelHeight,
    data,
  };

  if (colors) result.colors = colors;
  return result;
}

// ── Chrome Wrapping ─────────────────────────────────────────────────────────

/**
 * Export a ChartResult (or any object with toString()) through the pipeline.
 * Convenience for: chart → composeChartChrome → export format.
 *
 * Works with any object that has a toString() method, including ChartResult
 * and StatsChartResult from the chart modules.
 */
export function exportChartAsPlainText(chartOutput: { toString(): string }, opts?: PlainTextExportOpts): string {
  const ansi = chartOutput.toString();
  const plain = stripAllStyles(ansi);
  const trailing = opts?.trailingNewline ?? true;
  return trailing ? plain + '\n' : plain;
}

/**
 * Export a pre-rendered ANSI chart string as HTML.
 * Parses ANSI sequences to produce styled <span> elements.
 */
export function exportChartAsHtml(chartOutput: { toString(): string }, opts?: HtmlExportOpts): string {
  const {
    fullDocument = false,
    fontFamily = 'monospace',
    fontSize = '14px',
    background = '#1e1e2e',
    defaultForeground = '#cdd6f4',
    className,
    lineHeight = '1.2',
  } = opts ?? {};

  const ansi = chartOutput.toString();
  const htmlContent = ansiToHtml(ansi, defaultForeground);

  const classAttr = className ? ` class="${escapeHtml(className)}"` : '';
  const preStyle = `font-family:${fontFamily};font-size:${fontSize};line-height:${lineHeight};background:${background};color:${defaultForeground};padding:8px;overflow-x:auto;`;
  const preBlock = `<pre${classAttr} style="${escapeHtml(preStyle)}">${htmlContent}</pre>`;

  if (!fullDocument) return preBlock;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chart Export</title>
<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:${escapeHtml(background)}}</style>
</head>
<body>
${preBlock}
</body>
</html>`;
}

// ── ANSI → HTML converter ───────────────────────────────────────────────────

/**
 * Parse ANSI escape sequences and convert to HTML spans with inline styles.
 *
 * Uses Stellar's dependency-free ANSI adapter so static exports do not pull
 * a browser renderer into terminal applications.
 */
function ansiToHtml(input: string, _defaultFg: string): string {
  const segments = parseAnsiString(input);
  return segments
    .map((seg) => {
      const escaped = escapeHtml(seg.text);
      const css = cssStyleToString(seg.style);
      if (!css) return escaped;
      return `<span style="${css}">${escaped}</span>`;
    })
    .join('');
}

/**
 * Parse a hex color string to an RGB tuple.
 * Supports #RGB, #RRGGBB.
 */
function parseHexColor(hex: string): [number, number, number] {
  const match = hex.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (!match) return [205, 214, 244];
  const h = match[1]!;
  if (h.length === 3) {
    return [parseInt(h[0]! + h[0]!, 16), parseInt(h[1]! + h[1]!, 16), parseInt(h[2]! + h[2]!, 16)];
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
