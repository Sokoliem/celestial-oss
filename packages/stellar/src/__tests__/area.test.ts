import { color } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { areaChart } from '../area.js';

describe('areaChart', () => {
  it('returns AreaChartResult with toString and toVNode', () => {
    const result = areaChart({
      series: [{ data: [1, 3, 2, 5, 4] }],
    });
    expect(typeof result.toString).toBe('function');
    expect(typeof result.toVNode).toBe('function');
    const str = result.toString();
    expect(str.length).toBeGreaterThan(0);
  });

  it('output has correct number of lines', () => {
    const height = 8;
    const result = areaChart({
      series: [{ data: [1, 2, 3, 4, 5] }],
      height,
    });
    const lines = result.toString().split('\n');
    expect(lines.length).toBe(height);
  });

  it('handles multiple series (non-stacked)', () => {
    const result = areaChart({
      series: [
        { data: [1, 2, 3], color: color.red },
        { data: [3, 2, 1], color: color.blue },
      ],
    });
    const str = result.toString();
    expect(str.length).toBeGreaterThan(0);
  });

  it('handles stacked series', () => {
    const result = areaChart({
      series: [
        { data: [10, 20, 30], color: color.green },
        { data: [5, 10, 15], color: color.blue },
      ],
      stacked: true,
      width: 30,
      height: 8,
    });
    const str = result.toString();
    expect(str.length).toBeGreaterThan(0);
    const lines = str.split('\n');
    expect(lines.length).toBe(8);
  });

  it('handles empty series array', () => {
    const result = areaChart({ series: [] });
    expect(typeof result.toString()).toBe('string');
  });

  it('handles series with empty data', () => {
    const result = areaChart({
      series: [{ data: [] }],
    });
    expect(typeof result.toString()).toBe('string');
  });

  it('handles single data point', () => {
    const result = areaChart({
      series: [{ data: [42] }],
    });
    expect(typeof result.toString()).toBe('string');
  });

  it('toVNode returns TextNode', () => {
    const result = areaChart({
      series: [{ data: [1, 2, 3] }],
    });
    const vnode = result.toVNode();
    expect(['text', 'column']).toContain(vnode.kind);
  });

  it('should hold last value for shorter series instead of dropping to zero', () => {
    // Bug 5.11: In multi-series area chart, when idx >= data.length,
    // the value falls back to 0 via `data[idx] ?? 0`, causing the line
    // to drop to zero instead of holding the last value.
    const shortSeries = { data: [10, 20], color: color.red };
    const longSeries = { data: [5, 10, 15, 20], color: color.blue };

    // Without fix, the shorter series drops to 0 after its last point.
    // With fix, it should hold its last value (20).
    const result = areaChart({
      series: [shortSeries, longSeries],
      width: 20,
      height: 10,
      stacked: false,
    });

    // Compare with a version where the short series is padded with its last value
    const paddedSeries = { data: [10, 20, 20, 20], color: color.red };
    const expected = areaChart({
      series: [paddedSeries, longSeries],
      width: 20,
      height: 10,
      stacked: false,
    });

    expect(result.toString()).toBe(expected.toString());
  });

  it('should hold last value for shorter series in stacked mode', () => {
    // Bug 5.11 (stacked variant)
    const shortSeries = { data: [10, 20] };
    const longSeries = { data: [5, 10, 15, 20] };

    const result = areaChart({
      series: [shortSeries, longSeries],
      width: 20,
      height: 10,
      stacked: true,
    });

    const paddedSeries = { data: [10, 20, 20, 20] };
    const expected = areaChart({
      series: [paddedSeries, longSeries],
      width: 20,
      height: 10,
      stacked: true,
    });

    expect(result.toString()).toBe(expected.toString());
  });

  it('stacked series produce different output from non-stacked', () => {
    const series = [
      { data: [10, 20, 30], color: color.red },
      { data: [5, 10, 15], color: color.blue },
    ];
    const stacked = areaChart({ series, stacked: true, width: 30, height: 8 });
    const notStacked = areaChart({ series, stacked: false, width: 30, height: 8 });
    // They should produce different renders since stacking accumulates values
    expect(stacked.toString()).not.toBe(notStacked.toString());
  });
});
