/**
 * Area chart — filled line chart using braille dots.
 *
 * Supports single series and stacked series with per-series colors.
 */
import type { Color } from '@celestial/corona';
import type { VNode } from '@celestial/nebula';
import { type CanvasMode, canvas } from './canvas.js';
import { safeMax } from './math-utils.js';
import { chartSize, finiteNumber, finiteValues, rangeRatio } from './validation.js';

// ── Types ────────────────────────────────────────────────────────────────

/** A single data series for the area chart. */
export interface AreaSeries {
  /** Data values for this series. */
  data: number[];
  /** Series color. */
  color?: Color;
  /** Series label for legends. */
  label?: string;
}

/** Options for rendering an area chart. */
export interface AreaChartOpts {
  /** One or more data series. */
  series: AreaSeries[];
  /** Canvas width in terminal columns (default: 40). */
  width?: number;
  /** Canvas height in terminal rows (default: 10). */
  height?: number;
  /** Rendering mode (default: 'braille'). */
  mode?: CanvasMode;
  /** Stack series on top of each other (default: false). */
  stacked?: boolean;
}

/** Result of rendering an area chart. */
export interface AreaChartResult {
  /** Render to ANSI string. */
  toString(): string;
  /** Convert to a Nebula VNode. */
  toVNode(): VNode;
}

// ── Implementation ───────────────────────────────────────────────────────

/**
 * Render an area chart.
 *
 * Each series is drawn as a filled region between its line and the
 * baseline (or the previous series when stacked). Series are rendered
 * back-to-front so that earlier series appear behind later ones.
 *
 * @param opts - Area chart options.
 * @returns An AreaChartResult with render methods.
 */
export function areaChart(opts: AreaChartOpts): AreaChartResult {
  const { width, height } = chartSize(opts.width, opts.height, 40, 10);
  const c = canvas(width, height, opts.mode);
  const series = opts.series;

  if (series.length === 0) {
    return { toString: () => c.render(), toVNode: () => c.toVNode() };
  }

  const maxLen = safeMax(series.map((s) => s.data.length));
  if (maxLen === 0) {
    return { toString: () => c.render(), toVNode: () => c.toVNode() };
  }

  const pxW = c.pixelWidth;
  const pxH = c.pixelHeight;

  // Compute stacked data if needed
  const stackedData: number[][] = [];
  if (opts.stacked) {
    let valueScale = 0;
    for (const item of series) {
      for (const value of item.data) valueScale = Math.max(valueScale, Math.abs(finiteNumber(value, 0)));
    }
    if (valueScale === 0) valueScale = 1;
    const baseline = new Array(maxLen).fill(0) as number[];
    for (const s of series) {
      const accumulated: number[] = [];
      for (let i = 0; i < maxLen; i++) {
        // Hold the last value for shorter series instead of dropping to zero
        const val = finiteNumber(i < s.data.length ? s.data[i] : s.data[s.data.length - 1], 0) / valueScale;
        accumulated.push(baseline[i]! + val);
        baseline[i] = accumulated[i]!;
      }
      stackedData.push(accumulated);
    }
  } else {
    for (const s of series) {
      stackedData.push(finiteValues(s.data));
    }
  }

  // Compute global min/max across all (stacked) series
  let globalMin = Infinity;
  let globalMax = -Infinity;
  for (const sd of stackedData) {
    for (const v of sd) {
      if (v < globalMin) globalMin = v;
      if (v > globalMax) globalMax = v;
    }
  }
  // Render series back-to-front (first series is bottommost)
  for (let si = 0; si < series.length; si++) {
    const data = stackedData[si]!;
    const seriesColor = series[si]!.color;
    if (seriesColor) c.setColor(seriesColor);

    // Compute baseline for this series
    const baselineData = opts.stacked && si > 0 ? stackedData[si - 1]! : null;

    for (let px = 0; px < pxW; px++) {
      const dataProgress = (px / Math.max(pxW - 1, 1)) * (maxLen - 1);
      const idx = Math.min(Math.floor(dataProgress), maxLen - 1);
      const frac = dataProgress - idx;

      // Interpolate top value — hold the last value for shorter series
      const v0 = idx < data.length ? data[idx]! : (data[data.length - 1] ?? 0);
      const v1 = idx + 1 < data.length ? data[idx + 1]! : v0;
      const topVal = v0 * (1 - frac) + v1 * frac;
      const topPy = pxH - 1 - Math.round(rangeRatio(topVal, globalMin, globalMax, 0.5) * (pxH - 1));

      // Interpolate bottom value (baseline or chart floor)
      let bottomPy: number;
      if (baselineData) {
        const b0 = idx < baselineData.length ? baselineData[idx]! : (baselineData[baselineData.length - 1] ?? 0);
        const b1 = idx + 1 < baselineData.length ? baselineData[idx + 1]! : b0;
        const baseVal = b0 * (1 - frac) + b1 * frac;
        bottomPy = pxH - 1 - Math.round(rangeRatio(baseVal, globalMin, globalMax, 0.5) * (pxH - 1));
      } else {
        bottomPy = pxH - 1;
      }

      // Fill column from top to bottom
      for (let py = topPy; py <= bottomPy; py++) {
        c.set(px, py);
      }
    }
  }

  return { toString: () => c.render(), toVNode: () => c.toVNode() };
}
