/**
 * Heatmap chart — 2D grid colored by value.
 *
 * Renders a matrix of values as colored cells using the ColorMap
 * infrastructure. Supports row/column labels and configurable color
 * gradients.
 */
import type { Color } from '@celestial/corona';
import { color, gradient as coronaGradient } from '@celestial/corona';
import type { VNode } from '@celestial/nebula';
import { text as textNode } from '@celestial/nebula';
import { safeMax } from './math-utils.js';

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
  const data = opts.data;
  if (data.length === 0) {
    return { toString: () => '', toVNode: () => textNode('') };
  }

  const rows = data.length;
  const cols = safeMax(data.map((r) => r.length));
  const cellChar = opts.cellChar ?? '\u2588';
  const cellWidth = opts.cellWidth ?? 2;
  const stops = opts.colorStops ?? DEFAULT_STOPS;

  // Compute min/max
  let dMin = opts.min ?? Infinity;
  let dMax = opts.max ?? -Infinity;
  if (opts.min === undefined || opts.max === undefined) {
    for (const row of data) {
      for (const v of row) {
        if (opts.min === undefined && v < dMin) dMin = v;
        if (opts.max === undefined && v > dMax) dMax = v;
      }
    }
  }
  if (dMin === dMax) {
    dMin -= 0.5;
    dMax += 0.5;
  }
  const range = dMax - dMin;

  const RESET = '\x1b[0m';

  // Build column labels line
  const labelWidth = opts.rowLabels ? safeMax(opts.rowLabels.map((l) => l.length)) + 1 : 0;

  const lines: string[] = [];

  // Column labels
  if (opts.colLabels) {
    const colLine =
      ' '.repeat(labelWidth) +
      opts.colLabels
        .slice(0, cols)
        .map((l) => l.slice(0, cellWidth).padEnd(cellWidth))
        .join('');
    lines.push(colLine);
  }

  // Build gradient once for the whole render
  const grad = coronaGradient(stops.map((s) => ({ at: s.at, color: s.color })));

  // Data rows
  for (let r = 0; r < rows; r++) {
    let line = '';
    if (opts.rowLabels?.[r]) {
      line += opts.rowLabels[r]!.padEnd(labelWidth);
    } else if (labelWidth > 0) {
      line += ' '.repeat(labelWidth);
    }

    for (let cIdx = 0; cIdx < cols; cIdx++) {
      const value = data[r]?.[cIdx] ?? 0;
      const normalized = Math.max(0, Math.min(1, (value - dMin) / range));
      const cellColor = grad.sample(normalized);
      const colorSeq = cellColor.fg();
      line += colorSeq + cellChar.repeat(cellWidth) + RESET;
    }

    lines.push(line);
  }

  const content = lines.join('\n');
  return {
    toString: () => content,
    toVNode: () => textNode(content),
  };
}
