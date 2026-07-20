/**
 * Sparkline — inline mini-chart using braille dots.
 *
 * Fits in a single terminal row. Provides a braille-based sparkline
 * with higher resolution than the block-character sparkline in chart.ts.
 */
import type { Color } from '@celestial/corona';
import type { VNode } from '@celestial/nebula';
import { column, text as textNode } from '@celestial/nebula';
import { type CanvasMode, canvas } from './canvas.js';
import { safeMax, safeMin } from './math-utils.js';

// ── Types ────────────────────────────────────────────────────────────────

/** Options for rendering a braille sparkline. */
export interface SparklineOpts {
  /** Data values to plot. */
  data: number[];
  /** Width in terminal columns (default: data.length). */
  width?: number;
  /** Height in terminal rows (default: 1). */
  height?: number;
  /** Line color. */
  color?: Color;
  /** Rendering mode (default: 'braille'). */
  mode?: CanvasMode;
  /** Fill area under the line (default: false). */
  filled?: boolean;
  /** Show min/max labels (default: false). */
  showRange?: boolean;
}

/** Result of rendering a sparkline. */
export interface SparklineResult {
  /** Render to ANSI string (may contain newlines if height > 1). */
  toString(): string;
  /**
   * Convert to a Nebula VNode. Multi-line output is automatically split
   * into a column() of text() nodes for correct row() composition.
   */
  toVNode(): VNode;
  /** Min value in the dataset. */
  min: number;
  /** Max value in the dataset. */
  max: number;
}

// ── Implementation ───────────────────────────────────────────────────────

/**
 * Render a braille-dot sparkline.
 *
 * Unlike the block-character sparkline in chart.ts, this version uses
 * the braille canvas for sub-cell pixel resolution, producing smoother
 * mini-charts suitable for dashboards.
 *
 * @param opts - Sparkline options.
 * @returns A SparklineResult with render methods and data range info.
 */
export function sparkline(opts: SparklineOpts): SparklineResult {
  const data = opts.data;
  if (data.length === 0) {
    return { toString: () => '', toVNode: () => textNode(''), min: 0, max: 0 };
  }

  const width = opts.width ?? Math.max(data.length, 1);
  const height = opts.height ?? 1;
  const c = canvas(width, height, opts.mode);

  if (opts.color) c.setColor(opts.color);

  const pxW = c.pixelWidth;
  const pxH = c.pixelHeight;

  const min = safeMin(data);
  const max = safeMax(data);
  const range = max - min || 1;

  if (opts.filled) {
    // Fill area under the curve
    for (let px = 0; px < pxW; px++) {
      const dataProgress = (px / Math.max(pxW - 1, 1)) * (data.length - 1);
      const idx = Math.min(Math.floor(dataProgress), data.length - 1);
      const frac = dataProgress - idx;
      const val = idx + 1 < data.length ? data[idx]! * (1 - frac) + data[idx + 1]! * frac : data[idx]!;
      const y = pxH - 1 - Math.round(((val - min) / range) * (pxH - 1));
      for (let py = y; py < pxH; py++) {
        c.set(px, py);
      }
    }
  } else {
    // Line only
    for (let px = 0; px < pxW - 1; px++) {
      const prog1 = (px / Math.max(pxW - 1, 1)) * (data.length - 1);
      const prog2 = ((px + 1) / Math.max(pxW - 1, 1)) * (data.length - 1);
      const i1 = Math.min(Math.floor(prog1), data.length - 1);
      const f1 = prog1 - i1;
      const v1 = i1 + 1 < data.length ? data[i1]! * (1 - f1) + data[i1 + 1]! * f1 : data[i1]!;
      const i2 = Math.min(Math.floor(prog2), data.length - 1);
      const f2 = prog2 - i2;
      const v2 = i2 + 1 < data.length ? data[i2]! * (1 - f2) + data[i2 + 1]! * f2 : data[i2]!;
      const y1 = pxH - 1 - Math.round(((v1 - min) / range) * (pxH - 1));
      const y2 = pxH - 1 - Math.round(((v2 - min) / range) * (pxH - 1));
      c.line(px, y1, px + 1, y2);
    }

    if (data.length === 1) {
      c.set(Math.floor(pxW / 2), Math.floor(pxH / 2));
    }
  }

  let rendered = c.render();
  if (opts.showRange) {
    rendered += ` [${formatNum(min)}-${formatNum(max)}]`;
  }

  return {
    toString: () => rendered,
    toVNode: () => {
      if (!rendered.includes('\n')) return textNode(rendered);
      return column(...rendered.split('\n').map((line) => textNode(line)));
    },
    min,
    max,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatNum(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
