/**
 * Chart API for terminal-based data visualization.
 *
 * Provides line, bar, scatter, stacked bar, and sparkline charts
 * rendered via braille-dot pixels on a BrailleCanvas.
 */
import type { Color } from '@celestial/corona';
import type { VNode } from '@celestial/nebula';
import { type CanvasMode, canvas } from './canvas.js';
import { safeMax, safeMin } from './math-utils.js';
import { boundedPositiveInteger, chartSize, finiteNumber, finiteValues, nonNegativeInteger, rangeRatio } from './validation.js';

export interface ChartResult {
  toString(): string;
  toVNode(): VNode;
}

function makeChartResult(c: ReturnType<typeof canvas>): ChartResult {
  return {
    toString(): string {
      return c.render();
    },
    toVNode(): VNode {
      return c.toVNode();
    },
  };
}

export interface LineChartOpts {
  data: number[];
  width?: number;
  height?: number;
  color?: Color;
  axes?: boolean;
  filled?: boolean; // fill area under curve (default: true)
  mode?: CanvasMode;
}

export interface BarChartOpts {
  data: number[] | { label: string; value: number }[];
  width?: number;
  height?: number;
  color?: Color;
  colors?: Color[]; // per-bar colors (overrides single color)
  mode?: CanvasMode;
}

/** Options for a stacked bar chart with multiple series. */
export interface StackedBarChartOpts {
  /** Each series is a named array of values. */
  series: { label?: string; data: number[]; color?: Color }[];
  /** Canvas width in terminal columns (default: 40). */
  width?: number;
  /** Canvas height in terminal rows (default: 10). */
  height?: number;
  /** Canvas rendering mode (default: 'braille'). */
  mode?: CanvasMode;
}

export interface ScatterChartOpts {
  data: [number, number][];
  width?: number;
  height?: number;
  color?: Color;
  axes?: boolean;
  dotRadius?: number; // default 1
  mode?: CanvasMode;
}

function normalizeBarData(data: number[] | { label: string; value: number }[]): number[] {
  if (data.length === 0) return [];
  if (typeof data[0] === 'number') return finiteValues(data as number[]);
  return (data as { label: string; value: number }[]).map((d) => finiteNumber(d.value, 0));
}

export const chart = {
  line(opts: LineChartOpts): ChartResult {
    const { width, height } = chartSize(opts.width, opts.height, 40, 10);
    const c = canvas(width, height, opts.mode);

    if (opts.color) c.setColor(opts.color);

    const data = finiteValues(opts.data);
    if (data.length === 0) return makeChartResult(c);

    const pxW = c.pixelWidth;
    const pxH = c.pixelHeight;

    const min = safeMin(data);
    const max = safeMax(data);

    const filled = opts.filled !== false; // default true

    if (filled) {
      // Fill area under the curve — interpolate for every pixel column
      for (let px = 0; px < pxW; px++) {
        const dataProgress = (px / Math.max(pxW - 1, 1)) * (data.length - 1);
        const i = Math.min(Math.floor(dataProgress), data.length - 1);
        const frac = dataProgress - i;
        const val = i + 1 < data.length ? data[i]! * (1 - frac) + data[i + 1]! * frac : data[i]!;
        const y = pxH - 1 - Math.round(rangeRatio(val, min, max) * (pxH - 1));
        for (let py = y; py < pxH; py++) {
          c.set(px, py);
        }
      }
    } else {
      // Line-only mode: draw connected Bresenham lines
      for (let i = 0; i < data.length - 1; i++) {
        const x1 = Math.round((i / Math.max(data.length - 1, 1)) * (pxW - 1));
        const y1 = pxH - 1 - Math.round(rangeRatio(data[i]!, min, max) * (pxH - 1));
        const x2 = Math.round(((i + 1) / Math.max(data.length - 1, 1)) * (pxW - 1));
        const y2 = pxH - 1 - Math.round(rangeRatio(data[i + 1]!, min, max) * (pxH - 1));
        c.line(x1, y1, x2, y2);
      }

      if (data.length === 1) {
        c.set(Math.round((pxW - 1) / 2), Math.round((pxH - 1) / 2));
      }
    }

    return makeChartResult(c);
  },

  bar(opts: BarChartOpts): ChartResult {
    const { width, height } = chartSize(opts.width, opts.height, 40, 10);
    const c = canvas(width, height, opts.mode);

    const values = normalizeBarData(opts.data);
    if (values.length === 0) return makeChartResult(c);

    const pxW = c.pixelWidth;
    const pxH = c.pixelHeight;

    const min = safeMin(values);
    const max = safeMax(values);
    if (min === 0 && max === 0) return makeChartResult(c);

    const barWidth = Math.max(1, Math.floor(pxW / values.length));
    const gap = Math.max(0, Math.floor(barWidth * 0.2));
    const effectiveBarWidth = Math.max(1, barWidth - gap);

    // Compute zero line position for mixed positive/negative values
    const effectiveMin = Math.min(min, 0);
    const effectiveMax = Math.max(max, 0);
    const zeroProgress = rangeRatio(0, effectiveMin, effectiveMax);
    const zeroY = Math.round((1 - zeroProgress) * (pxH - 1));

    for (let i = 0; i < values.length; i++) {
      // Per-bar color or fallback to single color
      const barColor = opts.colors?.[i] ?? opts.color;
      if (barColor) c.setColor(barColor);

      const val = values[i]!;
      const x = i * barWidth;

      if (val >= 0) {
        // Positive bar: draw upward from zero line
        const barHeight = Math.round(Math.abs(rangeRatio(val, effectiveMin, effectiveMax) - zeroProgress) * (pxH - 1));
        const y = zeroY - barHeight;
        for (let py = Math.max(0, y); py <= zeroY && py < pxH; py++) {
          for (let px = x; px < x + effectiveBarWidth; px++) {
            if (px < pxW) {
              c.set(px, py);
            }
          }
        }
      } else {
        // Negative bar: draw downward from zero line
        const barHeight = Math.round(Math.abs(rangeRatio(val, effectiveMin, effectiveMax) - zeroProgress) * (pxH - 1));
        const yEnd = zeroY + barHeight;
        for (let py = zeroY; py <= Math.min(yEnd, pxH - 1); py++) {
          for (let px = x; px < x + effectiveBarWidth; px++) {
            if (px < pxW) {
              c.set(px, py);
            }
          }
        }
      }
    }

    return makeChartResult(c);
  },

  scatter(opts: ScatterChartOpts): ChartResult {
    const { width, height } = chartSize(opts.width, opts.height, 40, 10);
    const c = canvas(width, height, opts.mode);

    if (opts.color) c.setColor(opts.color);

    const data = opts.data.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    if (data.length === 0) return makeChartResult(c);

    const pxW = c.pixelWidth;
    const pxH = c.pixelHeight;

    const xs = data.map((d) => d[0]);
    const ys = data.map((d) => d[1]);
    const minX = safeMin(xs);
    const maxX = safeMax(xs);
    const minY = safeMin(ys);
    const maxY = safeMax(ys);

    for (const [dx, dy] of data) {
      const px = Math.round(rangeRatio(dx, minX, maxX) * (pxW - 1));
      const py = pxH - 1 - Math.round(rangeRatio(dy, minY, maxY) * (pxH - 1));
      const r = nonNegativeInteger(opts.dotRadius, 1);
      if (r <= 0) {
        c.set(px, py);
      } else {
        c.fillCircle(px, py, r);
      }
    }

    return makeChartResult(c);
  },

  /**
   * Render a stacked bar chart with multiple series.
   *
   * Each bar position shows segments stacked on top of each other,
   * one per series. Series are drawn bottom-to-top.
   *
   * @param opts - Stacked bar chart options.
   * @returns A ChartResult with render methods.
   */
  stackedBar(opts: StackedBarChartOpts): ChartResult {
    const { width, height } = chartSize(opts.width, opts.height, 40, 10);
    const c = canvas(width, height, opts.mode);
    const series = opts.series;

    if (series.length === 0) return makeChartResult(c);

    const barCount = safeMax(series.map((s) => s.data.length));
    if (barCount === 0) return makeChartResult(c);

    const pxW = c.pixelWidth;
    const pxH = c.pixelHeight;

    // Compute per-bar totals relative to the largest segment. Scaling before
    // summing avoids overflow for otherwise-valid values near Number.MAX_VALUE.
    let valueScale = 0;
    for (const item of series) {
      for (const rawValue of item.data) valueScale = Math.max(valueScale, Math.max(0, finiteNumber(rawValue, 0)));
    }
    if (valueScale === 0) return makeChartResult(c);

    const totals: number[] = [];
    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      for (const s of series) {
        sum += Math.max(0, finiteNumber(s.data[i], 0)) / valueScale;
      }
      totals.push(sum);
    }
    const maxTotal = safeMax(totals);
    if (maxTotal === 0) return makeChartResult(c);

    const barWidth = Math.max(1, Math.floor(pxW / barCount));
    const gap = Math.max(0, Math.floor(barWidth * 0.2));
    const effectiveBarWidth = Math.max(1, barWidth - gap);

    // Render bottom-to-top for each bar position
    for (let i = 0; i < barCount; i++) {
      let cumHeight = 0;

      // Collect non-zero segments for this bar position
      const segments: { series: (typeof series)[0]; val: number; scaledValue: number }[] = [];
      for (const s of series) {
        const val = Math.max(0, finiteNumber(s.data[i], 0));
        if (val > 0) segments.push({ series: s, val, scaledValue: val / valueScale });
      }

      for (let si = 0; si < segments.length; si++) {
        const { series: s, val, scaledValue } = segments[si]!;

        // Use Math.floor for all segments except the last.
        // Compute the last segment's height as the remaining space
        // to avoid rounding accumulation exceeding pxH-1.
        let segHeight: number;
        if (si === segments.length - 1) {
          const totalHeight = Math.round((totals[i]! / maxTotal) * (pxH - 1));
          segHeight = totalHeight - cumHeight;
          // Guarantee at least 1 pixel for non-zero values in the last segment.
          // When totalHeight rounds to 0 for a tiny value, the bar becomes
          // invisible despite having a non-zero value.
          if (segHeight <= 0 && val > 0) segHeight = 1;
        } else {
          segHeight = Math.floor((scaledValue / maxTotal) * (pxH - 1));
        }

        if (segHeight <= 0) continue;

        const startY = Math.max(0, pxH - cumHeight - segHeight);
        const endY = Math.max(0, pxH - cumHeight);
        const x = i * barWidth;

        if (s.color) c.setColor(s.color);

        for (let py = startY; py < endY; py++) {
          for (let px = x; px < x + effectiveBarWidth; px++) {
            if (px < pxW) {
              c.set(px, py);
            }
          }
        }

        cumHeight += segHeight;
      }
    }

    return makeChartResult(c);
  },

  sparkline(data: number[], width?: number): string {
    if (data.length === 0) return '';

    const BLOCKS = [' ', '\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588'];
    const values = finiteValues(data);
    const w = boundedPositiveInteger(width, values.length, 1_000_000);
    const min = safeMin(values);
    const max = safeMax(values);

    let result = '';
    for (let i = 0; i < w; i++) {
      const dataIdx = Math.round((i / Math.max(w - 1, 1)) * (values.length - 1));
      const value = values[dataIdx]!;
      const normalized = rangeRatio(value, min, max);
      const blockIdx = Math.min(8, Math.round(normalized * 8));
      result += BLOCKS[blockIdx]!;
    }

    return result;
  },
};
