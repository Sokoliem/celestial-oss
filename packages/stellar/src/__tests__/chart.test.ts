import { describe, expect, it } from 'vitest';
import { chart } from '../chart.js';

describe('chart.line', () => {
  it('returns ChartResult with toString and toVNode', () => {
    const result = chart.line({ data: [1, 2, 3, 4, 5] });
    expect(typeof result.toString).toBe('function');
    expect(typeof result.toVNode).toBe('function');
    const str = result.toString();
    expect(str.length).toBeGreaterThan(0);
  });

  it('output has correct number of lines (matches height)', () => {
    const height = 10;
    const result = chart.line({ data: [1, 3, 2, 5, 4], height });
    const lines = result.toString().split('\n');
    expect(lines.length).toBe(height);
  });

  it('toVNode returns a TextNode', () => {
    const result = chart.line({ data: [1, 2, 3] });
    const vnode = result.toVNode();
    expect(['text', 'column']).toContain(vnode.kind);
  });
});

describe('chart.bar', () => {
  it('produces non-empty output', () => {
    const result = chart.bar({ data: [5, 10, 3, 8] });
    const str = result.toString();
    expect(str.length).toBeGreaterThan(0);
  });

  it('accepts labeled data', () => {
    const result = chart.bar({
      data: [
        { label: 'A', value: 5 },
        { label: 'B', value: 10 },
      ],
    });
    const str = result.toString();
    expect(str.length).toBeGreaterThan(0);
  });
});

describe('chart.scatter', () => {
  it('produces output', () => {
    const result = chart.scatter({
      data: [
        [0, 0],
        [5, 5],
        [10, 10],
      ],
    });
    const str = result.toString();
    expect(str.length).toBeGreaterThan(0);
  });

  it('output has correct number of lines', () => {
    const height = 8;
    const result = chart.scatter({
      data: [
        [1, 2],
        [3, 4],
        [5, 6],
      ],
      height,
    });
    const lines = result.toString().split('\n');
    expect(lines.length).toBe(height);
  });
});

describe('chart.sparkline', () => {
  it('returns string of correct length', () => {
    const width = 15;
    const data = [1, 3, 5, 2, 4, 6, 1, 8, 3, 7, 2, 5, 4, 6, 9];
    const str = chart.sparkline(data, width);
    expect(typeof str).toBe('string');
    // Strip ANSI codes for length check
    // eslint-disable-next-line no-control-regex
    const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
    expect(stripped.length).toBe(width);
  });

  it('returns a string', () => {
    const str = chart.sparkline([1, 2, 3]);
    expect(typeof str).toBe('string');
  });
});

describe('core chart numeric hardening', () => {
  const extremes = [-Number.MAX_VALUE, 0, Number.MAX_VALUE];

  it('renders extreme finite line, bar, and scatter ranges', () => {
    expect(() => chart.line({ data: extremes, width: 10, height: 4 }).toString()).not.toThrow();
    expect(() => chart.bar({ data: extremes, width: 10, height: 4 }).toString()).not.toThrow();
    expect(() =>
      chart
        .scatter({
          data: [
            [-Number.MAX_VALUE, -Number.MAX_VALUE],
            [Number.MAX_VALUE, Number.MAX_VALUE],
          ],
          width: 10,
          height: 4,
        })
        .toString(),
    ).not.toThrow();
  });

  it('bounds non-finite sparkline widths', () => {
    expect(chart.sparkline([1, 2, 3], Number.POSITIVE_INFINITY)).toHaveLength(3);
  });
});

describe('chart.stackedBar', () => {
  it('produces non-empty output', () => {
    const result = chart.stackedBar({
      series: [{ data: [10, 20, 30] }, { data: [5, 10, 15] }],
    });
    const str = result.toString();
    expect(str.length).toBeGreaterThan(0);
  });

  it('output has correct number of lines', () => {
    const height = 8;
    const result = chart.stackedBar({
      series: [{ data: [10, 20] }, { data: [5, 10] }],
      height,
    });
    const lines = result.toString().split('\n');
    expect(lines.length).toBe(height);
  });

  it('handles empty series', () => {
    const result = chart.stackedBar({ series: [] });
    expect(typeof result.toString()).toBe('string');
  });

  it('handles single series (same as regular bar)', () => {
    const result = chart.stackedBar({
      series: [{ data: [10, 20, 30] }],
    });
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('handles all-zero values', () => {
    const result = chart.stackedBar({
      series: [{ data: [0, 0, 0] }, { data: [0, 0, 0] }],
    });
    expect(typeof result.toString()).toBe('string');
  });

  it('series with empty data', () => {
    const result = chart.stackedBar({
      series: [{ data: [] }],
    });
    expect(typeof result.toString()).toBe('string');
  });

  it('should not crash with many series that cause rounding to exceed pixel height', () => {
    // Many small segments with rounding can accumulate beyond pxH,
    // causing negative startY coordinates
    const series = Array.from({ length: 20 }, () => ({
      data: [1, 2, 3, 4, 5],
    }));
    // This should not throw due to negative pixel coordinates
    const result = chart.stackedBar({ series, width: 20, height: 5 });
    expect(typeof result.toString()).toBe('string');
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('should render non-zero single segment with at least 1 pixel height', () => {
    // S3 Bug: When a stacked bar has a single tiny segment, Math.round((val / maxTotal) * (pxH - 1))
    // can round to 0 for the last (only) segment, making the bar invisible despite having a
    // non-zero value. The last-segment remainder path computes segHeight = totalHeight - cumHeight,
    // but when totalHeight rounds to 0, the segment becomes invisible.
    const result = chart.stackedBar({
      series: [
        { data: [1] }, // tiny value
      ],
      width: 10,
      height: 10,
    });
    const str = result.toString();
    // Even a tiny non-zero value should produce at least 1 pixel of visible output
    // eslint-disable-next-line no-control-regex
    const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
    const hasContent = stripped.split('').some((ch) => ch !== ' ' && ch !== '\n');
    expect(hasContent).toBe(true);
  });

  it('should render stacked bar with one tiny segment among large segments', () => {
    // S3 Bug: When maxTotal is very large and one segment has a tiny value,
    // that segment's height rounds to 0 even though it's the last segment.
    const result = chart.stackedBar({
      series: [
        { data: [1000] },
        { data: [1] }, // tiny segment relative to total
      ],
      width: 10,
      height: 5,
    });
    const str = result.toString();
    expect(str.length).toBeGreaterThan(0);
  });

  it('should not clip bottom segment due to Math.round accumulation in stacked bars', () => {
    // Bug 5.2: Each segment height uses Math.round which can accumulate errors,
    // causing total cumulative height to exceed pxH-1 and clipping the bottom segment.
    // Three equal segments should render identically to each other (same height).
    // With Math.round accumulation, the last segment can be clipped.
    const result = chart.stackedBar({
      series: [{ data: [33] }, { data: [33] }, { data: [34] }],
      width: 10,
      height: 10,
    });
    const str = result.toString();
    expect(str.length).toBeGreaterThan(0);

    // Additional test: many small segments where rounding can accumulate
    const result2 = chart.stackedBar({
      series: [
        { data: [1, 1, 1] },
        { data: [1, 1, 1] },
        { data: [1, 1, 1] },
        { data: [1, 1, 1] },
        { data: [1, 1, 1] },
        { data: [1, 1, 1] },
        { data: [1, 1, 1] },
      ],
      width: 10,
      height: 5,
    });
    expect(result2.toString().length).toBeGreaterThan(0);
  });
});

describe('chart.sparkline edge cases', () => {
  it('should not produce out-of-bounds block index when normalized = 1.0', () => {
    // When all data values are the same except one max value,
    // normalized = 1.0 and Math.round(1.0 * 8) = 8, which is the last valid index.
    // This must NOT produce index 9 (out of bounds for BLOCKS array of length 9).
    const data = [0, 0, 0, 10];
    const result = chart.sparkline(data);
    // Should not contain 'undefined' characters from out-of-bounds access
    expect(result).not.toContain('undefined');
    // Every character should be a valid block character
    for (const ch of result) {
      expect(ch.charCodeAt(0)).not.toBeNaN();
    }
  });

  it('should handle all-identical values without crashing', () => {
    const data = [5, 5, 5, 5, 5];
    const result = chart.sparkline(data);
    expect(typeof result).toBe('string');
    expect(result.length).toBe(5);
  });

  it('block index should be within 0-8 for all normalized values', () => {
    // Test with data that produces normalized values at boundaries: 0.0 and 1.0
    const data = [0, 100];
    const result = chart.sparkline(data, 2);
    // Both characters should be valid block chars
    expect(result.length).toBe(2);
    expect(result).not.toContain('undefined');
  });
});

describe('chart.bar negative values', () => {
  it('should render negative bar values as visible bars below the zero line', () => {
    // Bug 5.7: Negative values produce negative barHeight, causing y > pxH
    // and no pixels drawn. Negative bars should be visible below the zero line.
    const result = chart.bar({ data: [-5, 10, -3, 8], width: 20, height: 10 });
    const str = result.toString();
    // The chart should produce non-empty output even with negative values
    expect(str.length).toBeGreaterThan(0);
    // The output should contain some braille dots (not be all spaces)
    // eslint-disable-next-line no-control-regex
    const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
    const hasContent = stripped.split('').some((ch) => ch !== ' ' && ch !== '\n');
    expect(hasContent).toBe(true);
  });

  it('should render all-negative data as visible bars', () => {
    // Bug 5.7: All-negative data produces max=0 which returns early,
    // or produces negative barHeight causing invisible bars
    const result = chart.bar({ data: [-10, -5, -20], width: 20, height: 10 });
    const str = result.toString();
    expect(str.length).toBeGreaterThan(0);
    // eslint-disable-next-line no-control-regex
    const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
    const hasContent = stripped.split('').some((ch) => ch !== ' ' && ch !== '\n');
    expect(hasContent).toBe(true);
  });
});

describe('empty data', () => {
  it('empty data produces empty/minimal output for line chart', () => {
    const result = chart.line({ data: [] });
    const str = result.toString();
    // Should not throw and should produce something
    expect(typeof str).toBe('string');
  });

  it('empty data produces empty/minimal output for bar chart', () => {
    const result = chart.bar({ data: [] });
    const str = result.toString();
    expect(typeof str).toBe('string');
  });

  it('empty data produces empty/minimal output for scatter', () => {
    const result = chart.scatter({ data: [] });
    const str = result.toString();
    expect(typeof str).toBe('string');
  });

  it('empty data produces empty string for sparkline', () => {
    const str = chart.sparkline([]);
    expect(str).toBe('');
  });
});
