import { color } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { type BoxPlotDatum, boxPlot, bullet, type CandleDatum, candlestick, histogram, type WaterfallDatum, waterfall } from '../stats-charts.js';

// ═══════════════════════════════════════════════════════════════════════════
// BOX PLOT
// ═══════════════════════════════════════════════════════════════════════════

describe('boxPlot', () => {
  const basic: BoxPlotDatum = { min: 1, q1: 3, median: 5, q3: 7, max: 9 };

  it('returns a StatsChartResult with toString and toVNode', () => {
    const result = boxPlot({ data: [basic] });
    expect(typeof result.toString()).toBe('string');
    expect(result.toVNode()).toBeDefined();
    expect(result.toVNode().kind).toBeDefined();
  });

  it('renders without error for a single datum', () => {
    const output = boxPlot({ data: [basic], width: 20, height: 5 }).toString();
    expect(output.length).toBeGreaterThan(0);
  });

  it('renders multiple boxes', () => {
    const data: BoxPlotDatum[] = [
      { min: 0, q1: 2, median: 4, q3: 6, max: 10 },
      { min: 1, q1: 3, median: 5, q3: 8, max: 12 },
      { min: 2, q1: 4, median: 6, q3: 9, max: 14 },
    ];
    const result = boxPlot({ data, width: 30, height: 8 });
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('handles empty data', () => {
    const result = boxPlot({ data: [] });
    expect(typeof result.toString()).toBe('string');
  });

  it('draws outliers when provided', () => {
    const datum: BoxPlotDatum = {
      min: 2,
      q1: 4,
      median: 6,
      q3: 8,
      max: 10,
      outliers: [0, 15],
    };
    const result = boxPlot({ data: [datum], width: 20, height: 8 });
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('respects whiskers=false', () => {
    const result = boxPlot({ data: [basic], whiskers: false, width: 20, height: 5 });
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('accepts per-datum color', () => {
    const datum: BoxPlotDatum = { ...basic, color: color.blue };
    const result = boxPlot({ data: [datum], width: 20, height: 5 });
    expect(result.toString()).toContain('\x1b[');
  });

  it('accepts global color', () => {
    const result = boxPlot({ data: [basic], color: color.red, width: 20, height: 5 });
    expect(result.toString()).toContain('\x1b[');
  });

  it('works with sextant mode', () => {
    const result = boxPlot({ data: [basic], mode: 'sextant', width: 20, height: 5 });
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('handles degenerate range (all same values)', () => {
    const flat: BoxPlotDatum = { min: 5, q1: 5, median: 5, q3: 5, max: 5 };
    const result = boxPlot({ data: [flat], width: 20, height: 5 });
    expect(result.toString().length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CANDLESTICK
// ═══════════════════════════════════════════════════════════════════════════

describe('candlestick', () => {
  const bullCandle: CandleDatum = { open: 10, high: 15, low: 8, close: 14 };
  const bearCandle: CandleDatum = { open: 14, high: 16, low: 9, close: 10 };

  it('returns a StatsChartResult', () => {
    const result = candlestick({ data: [bullCandle] });
    expect(typeof result.toString()).toBe('string');
    expect(result.toVNode().kind).toBeDefined();
  });

  it('renders multiple candles', () => {
    const data = [bullCandle, bearCandle, bullCandle, bearCandle];
    const result = candlestick({ data, width: 30, height: 8 });
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('handles empty data', () => {
    const result = candlestick({ data: [] });
    expect(typeof result.toString()).toBe('string');
  });

  it('applies bullish and bearish colors', () => {
    const result = candlestick({
      data: [bullCandle, bearCandle],
      bullColor: color.green,
      bearColor: color.red,
      width: 20,
      height: 5,
    });
    const output = result.toString();
    expect(output).toContain('\x1b[');
  });

  it('handles single candle with no range (high == low)', () => {
    const flat: CandleDatum = { open: 10, high: 10, low: 10, close: 10 };
    const result = candlestick({ data: [flat], width: 20, height: 5 });
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('works with quarter mode', () => {
    const result = candlestick({ data: [bullCandle], mode: 'quarter', width: 20, height: 5 });
    expect(result.toString().length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HISTOGRAM
// ═══════════════════════════════════════════════════════════════════════════

describe('histogram', () => {
  it('auto-bins raw data', () => {
    const data = [1, 1, 2, 2, 2, 3, 3, 4, 5, 5, 5, 5];
    const result = histogram({ data, width: 20, height: 5 });
    expect(result.toString().length).toBeGreaterThan(0);
    expect(result.counts.length).toBeGreaterThan(0);
    expect(result.edges.length).toBe(result.counts.length + 1);
  });

  it('respects explicit bin count', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = histogram({ data, bins: 5, width: 20, height: 5 });
    expect(result.counts).toHaveLength(5);
    expect(result.edges).toHaveLength(6);
  });

  it('handles pre-binned data', () => {
    const result = histogram({ data: [3, 7, 2, 5, 1], preBinned: true, width: 20, height: 5 });
    expect(result.counts).toEqual([3, 7, 2, 5, 1]);
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('handles empty data', () => {
    const result = histogram({ data: [] });
    expect(result.counts).toEqual([]);
    expect(typeof result.toString()).toBe('string');
  });

  it('all values in single bin', () => {
    const data = [5, 5, 5, 5, 5];
    const result = histogram({ data, bins: 3, width: 20, height: 5 });
    expect(result.toString().length).toBeGreaterThan(0);
    // All should be in one bin
    const nonZero = result.counts.filter((c) => c > 0);
    expect(nonZero.length).toBeGreaterThanOrEqual(1);
  });

  it('accepts color', () => {
    const result = histogram({ data: [1, 2, 3], color: color.cyan, width: 20, height: 5 });
    expect(result.toString()).toContain('\x1b[');
  });

  it('returns VNode', () => {
    const result = histogram({ data: [1, 2, 3, 4], width: 20, height: 5 });
    expect(result.toVNode().kind).toBeDefined();
  });

  it('preserves total count in bins', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = histogram({ data, bins: 4, width: 20, height: 5 });
    const total = result.counts.reduce((a, b) => a + b, 0);
    expect(total).toBe(data.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BULLET CHART
// ═══════════════════════════════════════════════════════════════════════════

describe('bullet', () => {
  it('renders horizontal bullet chart', () => {
    const result = bullet({
      value: 75,
      target: 90,
      ranges: [50, 80, 100],
      width: 30,
      height: 4,
    });
    expect(result.toString().length).toBeGreaterThan(0);
    expect(result.toVNode().kind).toBeDefined();
  });

  it('renders vertical bullet chart', () => {
    const result = bullet({
      value: 60,
      target: 80,
      ranges: [40, 70, 100],
      orientation: 'vertical',
      width: 10,
      height: 12,
    });
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('renders without target marker', () => {
    const result = bullet({ value: 50, ranges: [30, 60, 100], width: 20, height: 4 });
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('renders without ranges', () => {
    const result = bullet({ value: 50, target: 80, width: 20, height: 4 });
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('renders minimal (value only)', () => {
    const result = bullet({ value: 42, width: 20, height: 4 });
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('accepts colors', () => {
    const result = bullet({
      value: 70,
      target: 90,
      ranges: [50, 80, 100],
      color: color.green,
      targetColor: color.white,
      rangeColors: [color.hex('#333'), color.hex('#666'), color.hex('#999')],
      width: 30,
      height: 4,
    });
    expect(result.toString()).toContain('\x1b[');
  });

  it('respects custom min/max', () => {
    const result = bullet({
      value: 50,
      min: -10,
      max: 110,
      width: 20,
      height: 4,
    });
    expect(result.toString().length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WATERFALL
// ═══════════════════════════════════════════════════════════════════════════

describe('waterfall', () => {
  const basicData: WaterfallDatum[] = [
    { label: 'Start', value: 100, isTotal: true },
    { label: 'Revenue', value: 50 },
    { label: 'Costs', value: -30 },
    { label: 'Tax', value: -10 },
    { label: 'End', value: 0, isTotal: true },
  ];

  it('renders a basic waterfall', () => {
    const result = waterfall({ data: basicData, width: 30, height: 8 });
    expect(result.toString().length).toBeGreaterThan(0);
    expect(result.toVNode().kind).toBeDefined();
  });

  it('handles empty data', () => {
    const result = waterfall({ data: [] });
    expect(typeof result.toString()).toBe('string');
  });

  it('handles all positive deltas', () => {
    const data: WaterfallDatum[] = [{ value: 10 }, { value: 20 }, { value: 30 }];
    const result = waterfall({ data, width: 20, height: 5 });
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('handles all negative deltas', () => {
    const data: WaterfallDatum[] = [{ label: 'Start', value: 100, isTotal: true }, { value: -20 }, { value: -30 }, { value: -50 }];
    const result = waterfall({ data, width: 20, height: 5 });
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('applies positive/negative/total colors', () => {
    const result = waterfall({
      data: basicData,
      positiveColor: color.green,
      negativeColor: color.red,
      totalColor: color.blue,
      width: 30,
      height: 8,
    });
    expect(result.toString()).toContain('\x1b[');
  });

  it('respects connectors=false', () => {
    const result = waterfall({
      data: basicData,
      connectors: false,
      width: 30,
      height: 8,
    });
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('handles single datum', () => {
    const result = waterfall({ data: [{ value: 50 }], width: 20, height: 5 });
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('handles per-datum color override', () => {
    const data: WaterfallDatum[] = [
      { value: 30, color: color.cyan },
      { value: -10, color: color.magenta },
    ];
    const result = waterfall({ data, width: 20, height: 5 });
    expect(result.toString()).toContain('\x1b[');
  });

  it('works with sextant mode', () => {
    const result = waterfall({ data: basicData, mode: 'sextant', width: 30, height: 8 });
    expect(result.toString().length).toBeGreaterThan(0);
  });
});
