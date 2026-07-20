import { easing } from '@celestial/aurora';
import { describe, expect, it } from 'vitest';
import { animateBarChart, animateData, animateLineChart } from '../animate.js';
import { chart } from '../chart.js';

// ---------------------------------------------------------------------------
// animateData
// ---------------------------------------------------------------------------

describe('animateData', () => {
  it('returns all zeros at tick=0', () => {
    const result = animateData([10, 20, 30], 0, 10);
    expect(result).toEqual([0, 0, 0]);
  });

  it('returns original data when tick >= duration', () => {
    const data = [10, 20, 30];
    expect(animateData(data, 10, 10)).toEqual(data);
    expect(animateData(data, 15, 10)).toEqual(data);
  });

  it('returns intermediate values at tick = duration/2', () => {
    const data = [100, 200];
    const result = animateData(data, 5, 10);
    // With default easeOut, t=0.5 -> easeOut(0.5) = 1 - (0.5)^3 = 0.875
    for (const v of result) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(200);
    }
  });

  it('applies a custom easing function', () => {
    const data = [100];
    const linear = easing.linear; // linear(t) = t
    const result = animateData(data, 5, 10, linear);
    // t = 0.5, linear(0.5) = 0.5 -> 100 * 0.5 = 50
    expect(result[0]).toBeCloseTo(50);
  });

  it('handles empty array', () => {
    expect(animateData([], 5, 10)).toEqual([]);
  });

  it('handles negative values correctly', () => {
    const result = animateData([-100, -200], 5, 10, easing.linear);
    // t=0.5, linear -> each value * 0.5
    expect(result[0]).toBeCloseTo(-50);
    expect(result[1]).toBeCloseTo(-100);
  });

  it('should not produce NaN or Infinity when duration is zero', () => {
    // Bug 5.1: duration=0 causes tick/duration = Infinity or NaN,
    // which propagates through easingFn and corrupts chart data
    const data = [10, 20, 30];
    const result = animateData(data, 0, 0);
    expect(result).toEqual([10, 20, 30]);
    for (const v of result) {
      expect(Number.isFinite(v)).toBe(true);
      expect(Number.isNaN(v)).toBe(false);
    }
  });

  it('should return original data when duration is negative', () => {
    const data = [10, 20, 30];
    const result = animateData(data, 5, -1);
    expect(result).toEqual([10, 20, 30]);
    for (const v of result) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('uses easeOut as the default easing', () => {
    const data = [100];
    const defaultResult = animateData(data, 5, 10);
    const easeOutResult = animateData(data, 5, 10, easing.easeOut);
    expect(defaultResult[0]).toBeCloseTo(easeOutResult[0]!);
  });
});

// ---------------------------------------------------------------------------
// animateBarChart
// ---------------------------------------------------------------------------

describe('animateBarChart', () => {
  it('at tick=0 produces a chart (bars effectively empty)', () => {
    const result = animateBarChart({
      data: [10, 20, 30],
      tick: 0,
      duration: 10,
    });
    // Should return a valid ChartResult even when all values are zero
    expect(typeof result.toString()).toBe('string');
  });

  it('at tick >= duration matches regular chart.bar output', () => {
    const data = [10, 20, 30];
    const animated = animateBarChart({
      data,
      tick: 10,
      duration: 10,
      width: 20,
      height: 5,
    });
    const regular = chart.bar({ data, width: 20, height: 5 });
    expect(animated.toString()).toBe(regular.toString());
  });
});

// ---------------------------------------------------------------------------
// animateLineChart
// ---------------------------------------------------------------------------

describe('animateLineChart', () => {
  it('at tick=0 shows minimal data (all points set to first value)', () => {
    const data = [1, 5, 10, 15, 20];
    const result = animateLineChart({
      data,
      tick: 0,
      duration: 10,
      width: 20,
      height: 5,
    });
    // At t=0, visibleCount = ceil(5 * 0) = 0, so all points become data[0]
    // This produces a flat line at the first value
    expect(typeof result.toString()).toBe('string');
  });

  it('should not produce NaN when duration is zero', () => {
    // Bug 5.1 (animateLineChart variant): duration=0 causes
    // tick/duration = NaN which corrupts the chart
    const data = [1, 5, 10, 15, 20];
    const result = animateLineChart({
      data,
      tick: 0,
      duration: 0,
      width: 20,
      height: 5,
    });
    expect(typeof result.toString()).toBe('string');
    // Should match the fully-revealed chart since duration=0 means instant
    const fully = animateLineChart({
      data,
      tick: 10,
      duration: 10,
      width: 20,
      height: 5,
    });
    expect(result.toString()).toBe(fully.toString());
  });

  it('at tick=0 should not show flat line at first data point value', () => {
    // Bug 5.5 (original): When visibleCount=0, all points were set to data[0]
    // creating a misleading flat line. S5 fix: return empty data at tick=0
    // so the chart renders as a blank canvas.
    const data = [50, 10, 100, 50, 10];
    const result = animateLineChart({
      data,
      tick: 0,
      duration: 10,
      width: 20,
      height: 5,
    });
    // With the S5 fix, visibleCount=0 returns an empty chart (no content)
    const emptyChart = chart.line({ data: [], width: 20, height: 5 });
    expect(result.toString()).toBe(emptyChart.toString());
  });

  it('at tick=0 should render empty canvas (no flat baseline line)', () => {
    // S5 Bug: Even after the first-pass fix changed data[0] to Math.min(...data),
    // a flat line at the baseline value is still rendered at tick=0.
    // The animation should start from nothing (empty canvas), not a flat line.
    // When visibleCount === 0, the chart should return empty data so no pixels
    // are set on the canvas.
    const data = [10, 20, 30, 40, 50];
    const result = animateLineChart({
      data,
      tick: 0,
      duration: 10,
      width: 20,
      height: 5,
    });
    // An empty chart with no data should match chart.line({ data: [] })
    // which renders a blank braille canvas (all U+2800 braille blanks).
    const emptyChart = chart.line({ data: [], width: 20, height: 5 });
    expect(result.toString()).toBe(emptyChart.toString());
  });

  it('at tick >= duration matches regular chart.line output', () => {
    const data = [1, 5, 10, 15, 20];
    const animated = animateLineChart({
      data,
      tick: 10,
      duration: 10,
      width: 20,
      height: 5,
    });
    const regular = chart.line({ data, width: 20, height: 5 });
    expect(animated.toString()).toBe(regular.toString());
  });

  it('reveals points progressively', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    // Use linear easing for predictable behaviour
    const early = animateLineChart({
      data,
      tick: 2,
      duration: 10,
      easing: easing.linear,
      width: 20,
      height: 5,
    });
    const late = animateLineChart({
      data,
      tick: 8,
      duration: 10,
      easing: easing.linear,
      width: 20,
      height: 5,
    });
    // The two charts should differ because more points are revealed later
    expect(early.toString()).not.toBe(late.toString());
  });

  it('handles empty data', () => {
    const result = animateLineChart({
      data: [],
      tick: 5,
      duration: 10,
      width: 20,
      height: 5,
    });
    expect(typeof result.toString()).toBe('string');
  });
});
