/**
 * Heatmap chart — 2D grid colored by value.
 *
 * Renders a matrix of values as colored cells using the ColorMap
 * infrastructure. Supports row/column labels and configurable color
 * gradients.
 */
import type { Color } from '@celestial/corona';
import { color, gradient as coronaGradient, sanitizeTerminalText, sliceCells, stripAnsi, cellWidth as terminalCellWidth } from '@celestial/corona';
import type { VNode } from '@celestial/nebula';
import { column, text as textNode } from '@celestial/nebula';
import { safeMax } from './math-utils.js';
import { boundedPositiveInteger, clamp, finiteNumber, finiteValues, rangeRatio } from './validation.js';

// ── Types ────────────────────────────────────────────────────────────────

/** A color stop in the heatmap gradient. */
export interface HeatmapColorStop {
  /** Normalized position (0-1). */
  at: number;
  /** Color at this stop. */
  color: Color;
}

/** Options for rendering a heatmap. */
export interface HeatmapOpts {
  /** 2D array of numeric values (rows × columns). */
  data: number[][];
  /** Optional row labels (displayed on the left). */
  rowLabels?: string[];
  /** Optional column labels (displayed at the top). */
  colLabels?: string[];
  /** Minimum value for color mapping (default: auto from data). */
  min?: number;
  /** Maximum value for color mapping (default: auto from data). */
  max?: number;
  /** Color gradient stops (default: blue → yellow → red). */
  colorStops?: HeatmapColorStop[];
  /** Character to use for each cell (default: '\u2588' FULL BLOCK). */
  cellChar?: string;
  /** Width of each cell in characters (default: 2). */
  cellWidth?: number;
}

/** Result of rendering a heatmap. */
export interface HeatmapResult {
  /** Render to ANSI string. */
  toString(): string;
  /** Convert to a Nebula VNode. */
  toVNode(): VNode;
}

// ── Default Gradient ─────────────────────────────────────────────────────

const DEFAULT_STOPS: HeatmapColorStop[] = [
  { at: 0, color: color.blue },
  { at: 0.5, color: color.yellow },
  { at: 1, color: color.red },
];

// ── Implementation ───────────────────────────────────────────────────────

/**
 * Render a heatmap chart.
 *
 * Each cell in the 2D data matrix is mapped to a color based on its
 * value relative to the min/max range. Colors are interpolated between
 * the configured gradient stops.
 *
 * @param opts - Heatmap options.
 * @returns A HeatmapResult with render methods.
 */
export function heatmap(opts: HeatmapOpts): HeatmapResult {
  const data = opts.data.map((row) => finiteValues(row));
  if (data.length === 0) {
    return { toString: () => '', toVNode: () => textNode('') };
  }

  const rows = data.length;
  const cols = safeMax(data.map((r) => r.length));
  const requestedCellChar = safePlainText(opts.cellChar ?? '\u2588');
  const requestedGlyph = sliceCells(requestedCellChar, 1, { trusted: true })[0];
  const cellChar = terminalCellWidth(requestedGlyph) === 1 ? requestedGlyph : '\u2588';
  const cellWidth = boundedPositiveInteger(opts.cellWidth, 2, 256);
  const requestedStops = opts.colorStops?.length && opts.colorStops.length >= 2 ? opts.colorStops : DEFAULT_STOPS;
  const stops = requestedStops.map((stop) => ({ ...stop, at: clamp(stop.at, 0, 1, 0) })).sort((a, b) => a.at - b.at);

  // Compute min/max
  const hasMin = opts.min !== undefined && Number.isFinite(opts.min);
  const hasMax = opts.max !== undefined && Number.isFinite(opts.max);
  let dMin = hasMin ? opts.min! : Infinity;
  let dMax = hasMax ? opts.max! : -Infinity;
  if (!hasMin || !hasMax) {
    for (const row of data) {
      for (const v of row) {
        if (!hasMin && v < dMin) dMin = v;
        if (!hasMax && v > dMax) dMax = v;
      }
    }
  }
  if (!Number.isFinite(dMin)) dMin = 0;
  if (!Number.isFinite(dMax)) dMax = 1;
  if (dMin > dMax) [dMin, dMax] = [dMax, dMin];
  if (dMin === dMax) {
    dMin -= 0.5;
    dMax += 0.5;
  }

  const RESET = '\x1b[0m';

  // Build column labels line
  const rowLabels = opts.rowLabels?.map(safePlainText);
  const colLabels = opts.colLabels?.map(safePlainText);
  const labelWidth = rowLabels ? safeMax(rowLabels.map(terminalCellWidth)) + 1 : 0;

  const lines: string[] = [];

  // Column labels
  if (colLabels) {
    const colLine =
      ' '.repeat(labelWidth) +
      colLabels
        .slice(0, cols)
        .map((label) => fitCells(label, cellWidth))
        .join('');
    lines.push(colLine);
  }

  // Build gradient once for the whole render
  const grad = coronaGradient(stops.map((s) => ({ at: s.at, color: s.color })));

  // Data rows
  for (let r = 0; r < rows; r++) {
    let line = '';
    if (rowLabels?.[r]) {
      line += fitCells(rowLabels[r]!, labelWidth);
    } else if (labelWidth > 0) {
      line += ' '.repeat(labelWidth);
    }

    for (let cIdx = 0; cIdx < cols; cIdx++) {
      const value = finiteNumber(data[r]?.[cIdx], 0);
      const normalized = Math.max(0, Math.min(1, rangeRatio(value, dMin, dMax, 0.5)));
      const cellColor = grad.sample(normalized);
      const colorSeq = cellColor.fg();
      line += colorSeq + cellChar.repeat(cellWidth) + RESET;
    }

    lines.push(line);
  }

  const content = lines.join('\n');
  return {
    toString: () => content,
    toVNode: () => (content.includes('\n') ? column(...content.split('\n').map((line) => textNode(line))) : textNode(content)),
  };
}

function safePlainText(value: string): string {
  return stripAnsi(sanitizeTerminalText(value, { allowSgr: false, allowHyperlinks: false, controlPolicy: 'strip' })).replace(/[\r\n]/g, ' ');
}

function fitCells(value: string, width: number): string {
  const clipped = sliceCells(value, width, { trusted: true })[0];
  return clipped + ' '.repeat(Math.max(0, width - terminalCellWidth(clipped)));
}
