/**
 * Statistical Chart Types
 *
 * Five specialised chart types for statistical and financial data:
 *
 *  - **Box plot** -- shows distribution via quartiles, whiskers, outliers.
 *  - **Candlestick** -- OHLC financial chart (open/high/low/close).
 *  - **Histogram** -- frequency distribution with binning.
 *  - **Bullet** -- compact bar with value, target, and qualitative ranges.
 *  - **Waterfall** -- sequential deltas with running total.
 *
 * All functions return a `ChartResult` (`toString` / `toVNode`).
 * Follow the same canvas/color/sizing conventions as the core charts.
 */

import type { Color } from '@celestial/corona';
import type { VNode } from '@celestial/nebula';
import { type CanvasMode, canvas } from './canvas.js';
import { safeMax, safeMin } from './math-utils.js';
import { boundedPositiveInteger, chartSize, finiteNumber, finiteValues, interpolateRange, rangeRatio } from './validation.js';

function saturatingAdd(left: number, right: number): number {
  const result = left + right;
  if (Number.isFinite(result)) return result;
  return result < 0 ? -Number.MAX_VALUE : Number.MAX_VALUE;
}

// ── Shared Result ────────────────────────────────────────────────────────

export interface StatsChartResult {
  toString(): string;
  toVNode(): VNode;
}

function makeResult(c: ReturnType<typeof canvas>): StatsChartResult {
  return {
    toString: () => c.render(),
    toVNode: () => c.toVNode(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. BOX PLOT
// ═══════════════════════════════════════════════════════════════════════════

/** A single box-plot datum (five-number summary + optional outliers). */
export interface BoxPlotDatum {
  /** Minimum (lower whisker). */
  min: number;
  /** First quartile (bottom of box). */
  q1: number;
  /** Median (line inside box). */
  median: number;
  /** Third quartile (top of box). */
  q3: number;
  /** Maximum (upper whisker). */
  max: number;
  /** Optional outlier values (drawn as dots). */
  outliers?: number[];
  /** Optional colour for this box. */
  color?: Color;
}

export interface BoxPlotOpts {
  /** One or more box-plot data. */
  data: BoxPlotDatum[];
  width?: number;
  height?: number;
  color?: Color;
  mode?: CanvasMode;
  /** Whether to draw whiskers (default true). */
  whiskers?: boolean;
}

/**
 * Render a box plot.
 *
 * Each datum produces a vertical box (Q1..Q3) with a median line,
 * whiskers extending to min/max, and optional outlier dots.
 */
export function boxPlot(opts: BoxPlotOpts): StatsChartResult {
  const { width, height } = chartSize(opts.width, opts.height, 40, 10);
  const c = canvas(width, height, opts.mode);
  const showWhiskers = opts.whiskers ?? true;
  const data = opts.data.map((datum) => ({
    ...datum,
    min: finiteNumber(datum.min, 0),
    q1: finiteNumber(datum.q1, 0),
    median: finiteNumber(datum.median, 0),
    q3: finiteNumber(datum.q3, 0),
    max: finiteNumber(datum.max, 0),
    outliers: datum.outliers ? finiteValues(datum.outliers) : undefined,
  }));

  if (data.length === 0) return makeResult(c);

  const pxW = c.pixelWidth;
  const pxH = c.pixelHeight;

  // Global Y range across all data + outliers
  let globalMin = Infinity;
  let globalMax = -Infinity;
  for (const d of data) {
    for (const value of [d.min, d.q1, d.median, d.q3, d.max]) {
      globalMin = Math.min(globalMin, value);
      globalMax = Math.max(globalMax, value);
    }
    if (d.outliers) {
      for (const o of d.outliers) {
        globalMin = Math.min(globalMin, o);
        globalMax = Math.max(globalMax, o);
      }
    }
  }

  // Horizontal layout (even spacing per box)
  const n = data.length;
  const slotWidth = Math.floor(pxW / n);
  const boxWidth = Math.max(2, Math.floor(slotWidth * 0.6));
  const halfBox = Math.floor(boxWidth / 2);

  function mapY(val: number): number {
    return pxH - 1 - Math.round(rangeRatio(val, globalMin, globalMax, 0.5) * (pxH - 1));
  }

  for (let i = 0; i < n; i++) {
    const d = data[i]!;
    const cx = Math.floor(slotWidth * i + slotWidth / 2);

    // Apply colour
    const boxColor = d.color ?? opts.color;
    if (boxColor) c.setColor(boxColor);

    const yMin = mapY(d.min);
    const yMax = mapY(d.max);
    const yQ1 = mapY(d.q1);
    const yQ3 = mapY(d.q3);
    const yMed = mapY(d.median);

    // Whiskers (vertical lines from min to Q1 and Q3 to max)
    if (showWhiskers) {
      c.line(cx, yMax, cx, yQ3);
      c.line(cx, yQ1, cx, yMin);
      // Horizontal whisker caps
      const capW = Math.max(1, Math.floor(halfBox / 2));
      c.line(cx - capW, yMax, cx + capW, yMax);
      c.line(cx - capW, yMin, cx + capW, yMin);
    }

    // Box (Q1 to Q3)
    const boxLeft = cx - halfBox;
    const boxRight = cx + halfBox;
    // Draw as a filled rectangle from yQ3 (top) to yQ1 (bottom)
    c.fillRect(boxLeft, Math.min(yQ1, yQ3), boxRight - boxLeft + 1, Math.abs(yQ1 - yQ3) + 1);

    // Median line (bright horizontal)
    c.line(boxLeft, yMed, boxRight, yMed);

    // Outliers
    if (d.outliers) {
      for (const o of d.outliers) {
        const oy = mapY(o);
        c.set(cx, oy);
        if (cx > 0) c.set(cx - 1, oy);
        if (cx < pxW - 1) c.set(cx + 1, oy);
      }
    }
  }

  return makeResult(c);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. CANDLESTICK
// ═══════════════════════════════════════════════════════════════════════════

/** A single candlestick datum (OHLC). */
export interface CandleDatum {
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface CandlestickOpts {
  data: CandleDatum[];
  width?: number;
  height?: number;
  /** Colour for bullish candles (close > open). Default: green-ish. */
  bullColor?: Color;
  /** Colour for bearish candles (close <= open). Default: red-ish. */
  bearColor?: Color;
  mode?: CanvasMode;
}

/**
 * Render a candlestick (OHLC) chart.
 *
 * Each datum draws:
 *  - A vertical wick from low to high.
 *  - A filled body from open to close.
 *  - Bullish (close > open) vs. bearish (close <= open) colouring.
 */
export function candlestick(opts: CandlestickOpts): StatsChartResult {
  const { width, height } = chartSize(opts.width, opts.height, 40, 10);
  const c = canvas(width, height, opts.mode);
  const data = opts.data.map((datum) => ({
    open: finiteNumber(datum.open, 0),
    high: finiteNumber(datum.high, 0),
    low: finiteNumber(datum.low, 0),
    close: finiteNumber(datum.close, 0),
  }));

  if (data.length === 0) return makeResult(c);

  const pxW = c.pixelWidth;
  const pxH = c.pixelHeight;

  // Global Y range
  let globalMin = Infinity;
  let globalMax = -Infinity;
  for (const d of data) {
    for (const value of [d.open, d.high, d.low, d.close]) {
      globalMin = Math.min(globalMin, value);
      globalMax = Math.max(globalMax, value);
    }
  }

  const n = data.length;
  const slotWidth = Math.max(1, Math.floor(pxW / n));
  const bodyWidth = Math.max(2, Math.floor(slotWidth * 0.6));
  const halfBody = Math.floor(bodyWidth / 2);

  function mapY(val: number): number {
    return pxH - 1 - Math.round(rangeRatio(val, globalMin, globalMax, 0.5) * (pxH - 1));
  }

  for (let i = 0; i < n; i++) {
    const d = data[i]!;
    const cx = Math.floor(slotWidth * i + slotWidth / 2);
    const bull = d.close > d.open;

    // Set colour
    const candleColor = bull ? opts.bullColor : opts.bearColor;
    if (candleColor) c.setColor(candleColor);

    // Wick (high to low)
    const yHigh = mapY(d.high);
    const yLow = mapY(d.low);
    c.line(cx, yHigh, cx, yLow);

    // Body (open to close)
    const yOpen = mapY(d.open);
    const yClose = mapY(d.close);
    const bodyTop = Math.min(yOpen, yClose);
    const bodyBot = Math.max(yOpen, yClose);
    const bodyH = Math.max(1, bodyBot - bodyTop + 1);
    const bodyLeft = cx - halfBody;

    c.fillRect(bodyLeft, bodyTop, bodyWidth, bodyH);
  }

  return makeResult(c);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. HISTOGRAM
// ═══════════════════════════════════════════════════════════════════════════

export interface HistogramOpts {
  /** Raw data values to bin, OR pre-binned counts. */
  data: number[];
  width?: number;
  height?: number;
  /** Number of bins (default: auto based on data size). */
  bins?: number;
  /** If true, `data` is already binned counts (skip binning). */
  preBinned?: boolean;
  color?: Color;
  mode?: CanvasMode;
}

export interface HistogramResult extends StatsChartResult {
  /** The bin counts (computed or provided). */
  counts: number[];
  /** Bin edges (only when data was auto-binned). */
  edges: number[];
}

/**
 * Render a histogram.
 *
 * Accepts raw data (auto-binned) or pre-binned counts.
 * Bars are drawn edge-to-edge (no gaps) as is conventional for histograms.
 */
export function histogram(opts: HistogramOpts): HistogramResult {
  const { width, height } = chartSize(opts.width, opts.height, 40, 10);
  const c = canvas(width, height, opts.mode);

  if (opts.color) c.setColor(opts.color);

  let counts: number[];
  let edges: number[];

  if (opts.preBinned) {
    counts = finiteValues(opts.data).map((value) => Math.max(0, value));
    edges = counts.map((_, i) => i);
    edges.push(counts.length);
  } else {
    // Auto-binning
    const data = finiteValues(opts.data);
    if (data.length === 0) {
      counts = [];
      edges = [];
      return { toString: () => c.render(), toVNode: () => c.toVNode(), counts, edges };
    }

    const numBins = boundedPositiveInteger(opts.bins, Math.max(1, Math.ceil(Math.sqrt(data.length))), 10_000);
    const min = safeMin(data);
    const max = safeMax(data);

    counts = new Array(numBins).fill(0) as number[];
    edges = [];
    for (let i = 0; i <= numBins; i++) {
      edges.push(interpolateRange(min, max, i / numBins));
    }

    for (const v of data) {
      let bin = Math.floor(rangeRatio(v, min, max) * numBins);
      if (bin >= numBins) bin = numBins - 1;
      if (bin < 0) bin = 0;
      counts[bin]!++;
    }
  }

  if (counts.length === 0) {
    return { toString: () => c.render(), toVNode: () => c.toVNode(), counts, edges };
  }

  const pxW = c.pixelWidth;
  const pxH = c.pixelHeight;
  const maxCount = safeMax(counts);
  const countRange = maxCount || 1;

  // No gaps for histogram (edge-to-edge bars)
  const barWidth = Math.max(1, Math.floor(pxW / counts.length));

  for (let i = 0; i < counts.length; i++) {
    const count = counts[i]!;
    if (count === 0) continue;

    const barHeight = Math.max(1, Math.round((count / countRange) * (pxH - 1)));
    const x = i * barWidth;
    const y = pxH - barHeight;
    c.fillRect(x, y, barWidth, barHeight);
  }

  return {
    toString: () => c.render(),
    toVNode: () => c.toVNode(),
    counts,
    edges,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. BULLET CHART
// ═══════════════════════════════════════════════════════════════════════════

export interface BulletOpts {
  /** The actual/measured value. */
  value: number;
  /** The target/goal marker. */
  target?: number;
  /** Qualitative ranges (drawn as background bands). Sorted ascending. */
  ranges?: number[];
  /** Value range minimum (default 0). */
  min?: number;
  /** Value range maximum (default max of value/target/ranges). */
  max?: number;
  width?: number;
  height?: number;
  /** Colour for the value bar. */
  color?: Color;
  /** Colour for the target marker. */
  targetColor?: Color;
  /** Colours for the range bands (from inner/darkest to outer/lightest). */
  rangeColors?: Color[];
  mode?: CanvasMode;
  /** Orientation: 'horizontal' (default) or 'vertical'. */
  orientation?: 'horizontal' | 'vertical';
}

/**
 * Render a bullet chart.
 *
 * A compact bar visualisation comparing a primary measure (the value bar)
 * against qualitative ranges and an optional target marker.
 */
export function bullet(opts: BulletOpts): StatsChartResult {
  const { width, height } = chartSize(opts.width, opts.height, 40, 6);
  const c = canvas(width, height, opts.mode);
  const horiz = (opts.orientation ?? 'horizontal') === 'horizontal';

  let dataMin = finiteNumber(opts.min, 0);
  const value = finiteNumber(opts.value, dataMin);
  const target = opts.target === undefined ? undefined : finiteNumber(opts.target, dataMin);
  const ranges = finiteValues(opts.ranges ?? []).sort((a, b) => a - b);
  const allNums = [value, ...ranges];
  if (target !== undefined) allNums.push(target);
  let dataMax = finiteNumber(opts.max, safeMax(allNums));
  if (dataMin > dataMax) [dataMin, dataMax] = [dataMax, dataMin];

  const pxW = c.pixelWidth;
  const pxH = c.pixelHeight;

  // Map a value to pixel position
  function mapH(val: number): number {
    return Math.round(rangeRatio(val, dataMin, dataMax) * (pxW - 1));
  }
  function mapV(val: number): number {
    return pxH - 1 - Math.round(rangeRatio(val, dataMin, dataMax) * (pxH - 1));
  }

  // 1. Draw qualitative ranges (background bands)
  for (let i = ranges.length - 1; i >= 0; i--) {
    const rangeColor = opts.rangeColors?.[i];
    if (rangeColor) c.setColor(rangeColor);

    if (horiz) {
      const x = mapH(dataMin);
      const w = mapH(ranges[i]!) - x + 1;
      c.fillRect(x, 0, w, pxH);
    } else {
      const yTop = mapV(ranges[i]!);
      const yBot = pxH - 1;
      c.fillRect(0, yTop, pxW, yBot - yTop + 1);
    }
  }

  // 2. Draw value bar
  if (opts.color) c.setColor(opts.color);
  if (horiz) {
    const barH = Math.max(2, Math.floor(pxH * 0.4));
    const barY = Math.floor((pxH - barH) / 2);
    const barW = Math.max(1, mapH(value) - mapH(dataMin) + 1);
    c.fillRect(mapH(dataMin), barY, barW, barH);
  } else {
    const barW = Math.max(2, Math.floor(pxW * 0.4));
    const barX = Math.floor((pxW - barW) / 2);
    const yTop = mapV(value);
    const barH = pxH - 1 - yTop + 1;
    c.fillRect(barX, yTop, barW, barH);
  }

  // 3. Draw target marker
  if (target !== undefined) {
    if (opts.targetColor) c.setColor(opts.targetColor);
    if (horiz) {
      const tx = mapH(target);
      c.line(tx, 0, tx, pxH - 1);
    } else {
      const ty = mapV(target);
      c.line(0, ty, pxW - 1, ty);
    }
  }

  return makeResult(c);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. WATERFALL
// ═══════════════════════════════════════════════════════════════════════════

/** A single waterfall step. */
export interface WaterfallDatum {
  /** Label (for display/accessibility). */
  label?: string;
  /** The delta value (positive = increase, negative = decrease). */
  value: number;
  /** If true, this bar represents a running total (drawn from zero). */
  isTotal?: boolean;
  /** Optional colour override. */
  color?: Color;
}

export interface WaterfallOpts {
  data: WaterfallDatum[];
  width?: number;
  height?: number;
  /** Colour for positive (increase) bars. */
  positiveColor?: Color;
  /** Colour for negative (decrease) bars. */
  negativeColor?: Color;
  /** Colour for total bars. */
  totalColor?: Color;
  mode?: CanvasMode;
  /** Whether to draw connector lines between bars (default true). */
  connectors?: boolean;
}

/**
 * Render a waterfall chart.
 *
 * Each bar starts where the previous ended. Positive deltas rise,
 * negative deltas fall. Total bars extend from zero to the running sum.
 * Connector lines link the end of each bar to the start of the next.
 */
export function waterfall(opts: WaterfallOpts): StatsChartResult {
  const { width, height } = chartSize(opts.width, opts.height, 40, 10);
  const c = canvas(width, height, opts.mode);
  const showConnectors = opts.connectors ?? true;
  const data = opts.data.map((datum) => ({ ...datum, value: finiteNumber(datum.value, 0) }));

  if (data.length === 0) return makeResult(c);

  const pxW = c.pixelWidth;
  const pxH = c.pixelHeight;

  // Precompute running totals to find the global Y range
  const cumulative: number[] = [];
  let running = 0;
  for (const d of data) {
    if (d.isTotal) {
      cumulative.push(running);
    } else {
      running = saturatingAdd(running, d.value);
      cumulative.push(running);
    }
  }

  // Include zero in the range
  const allValues = [0, ...cumulative];
  // Also include the "from" of each bar
  let runCheck = 0;
  for (const d of data) {
    allValues.push(runCheck);
    if (!d.isTotal) {
      runCheck = saturatingAdd(runCheck, d.value);
    }
    allValues.push(runCheck);
  }

  const globalMin = safeMin(allValues);
  const globalMax = safeMax(allValues);

  function mapY(val: number): number {
    return pxH - 1 - Math.round(rangeRatio(val, globalMin, globalMax, 0.5) * (pxH - 1));
  }

  const n = data.length;
  const slotWidth = Math.max(1, Math.floor(pxW / n));
  const barWidth = Math.max(2, Math.floor(slotWidth * 0.7));
  const gap = Math.floor((slotWidth - barWidth) / 2);

  running = 0;
  let prevEndY = mapY(0);

  for (let i = 0; i < n; i++) {
    const d = data[i]!;
    const x = i * slotWidth + gap;

    let fromVal: number;
    let toVal: number;

    if (d.isTotal) {
      fromVal = 0;
      toVal = running;
    } else {
      fromVal = running;
      running = saturatingAdd(running, d.value);
      toVal = running;
    }

    // Choose colour
    const barColor = d.color ?? (d.isTotal ? opts.totalColor : d.value >= 0 ? opts.positiveColor : opts.negativeColor);
    if (barColor) c.setColor(barColor);

    const yFrom = mapY(fromVal);
    const yTo = mapY(toVal);
    const top = Math.min(yFrom, yTo);
    const barH = Math.max(1, Math.abs(yFrom - yTo) + 1);

    c.fillRect(x, top, barWidth, barH);

    // Connector line from previous bar's end to this bar's start
    if (showConnectors && i > 0) {
      const connX = x - 1;
      if (connX >= 0) {
        c.set(connX, prevEndY);
      }
    }

    // Track end position for next connector
    prevEndY = d.isTotal ? mapY(running) : yTo;
  }

  return makeResult(c);
}
