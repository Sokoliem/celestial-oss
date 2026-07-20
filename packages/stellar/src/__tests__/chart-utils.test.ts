import { color } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { canvas } from '../canvas.js';
import {
  composeChartChrome,
  computeTicks,
  defaultFormat,
  drawGrid,
  renderLegend,
  renderTitle,
  renderXTickLabels,
  renderYTickLabels,
  responsiveSize,
} from '../chart-utils.js';

// ── computeTicks ─────────────────────────────────────────────────────────

describe('computeTicks', () => {
  it('returns correct number of ticks for a simple range', () => {
    const ticks = computeTicks(0, 100, 5);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    // After fix 5.3, ticks are filtered to stay within [min, max]
    expect(ticks[0]).toBeGreaterThanOrEqual(0);
    expect(ticks[ticks.length - 1]!).toBeLessThanOrEqual(100);
  });

  it('returns single tick when min equals max', () => {
    const ticks = computeTicks(50, 50, 5);
    expect(ticks).toEqual([50]);
  });

  it('returns empty array for zero count', () => {
    expect(computeTicks(0, 100, 0)).toEqual([]);
  });

  it('produces monotonically increasing values', () => {
    const ticks = computeTicks(0, 1000, 6);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]!).toBeGreaterThan(ticks[i - 1]!);
    }
  });

  it('handles negative ranges', () => {
    const ticks = computeTicks(-50, 50, 5);
    // After fix 5.3, ticks are filtered to stay within [min, max]
    expect(ticks[0]).toBeGreaterThanOrEqual(-50);
    expect(ticks[ticks.length - 1]!).toBeLessThanOrEqual(50);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
  });

  it('handles small fractional ranges', () => {
    const ticks = computeTicks(0.1, 0.9, 5);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
  });

  it('should not generate ticks outside the [min, max] range', () => {
    // Bug 5.3: niceMin = Math.floor(min / niceStep) * niceStep can be below min,
    // causing out-of-range ticks that overlap at position 0
    const ticks = computeTicks(10, 90, 5);
    for (const tick of ticks) {
      expect(tick).toBeGreaterThanOrEqual(10);
      expect(tick).toBeLessThanOrEqual(90);
    }
  });

  it('should not generate ticks below min for fractional ranges', () => {
    // Bug 5.3: More edge cases for out-of-range ticks
    const ticks = computeTicks(0.3, 0.7, 5);
    for (const tick of ticks) {
      expect(tick).toBeGreaterThanOrEqual(0.3);
      expect(tick).toBeLessThanOrEqual(0.7);
    }
  });

  it('should not generate ticks outside negative ranges', () => {
    const ticks = computeTicks(-80, -20, 5);
    for (const tick of ticks) {
      expect(tick).toBeGreaterThanOrEqual(-80);
      expect(tick).toBeLessThanOrEqual(-20);
    }
  });

  it('should not drop the max tick due to floating-point arithmetic', () => {
    // S4 Bug: computeTicks uses `ticks.filter(t => t >= min && t <= max)` which
    // can remove the max tick when floating-point arithmetic produces max - epsilon.
    // This leaves the chart with no tick at the top of the axis.
    // Test with a range where the nice step produces a tick that should exactly equal max.
    const ticks = computeTicks(0, 100, 6);
    // 100 should be in the tick array (step=20, ticks: 0,20,40,60,80,100)
    expect(ticks).toContain(100);
  });

  it('should not drop max tick for ranges that produce floating-point imprecision', () => {
    // S4 Bug: More targeted test. Range 0-0.3 with step 0.1 can produce
    // 0.30000000000000004 which would fail the <= 0.3 check.
    const ticks = computeTicks(0, 0.3, 4);
    // The max value or something very close to it should be present
    const hasTickNearMax = ticks.some((t) => Math.abs(t - 0.3) < 0.001);
    expect(hasTickNearMax).toBe(true);
  });

  it('should include both min and max ticks when they align with nice steps', () => {
    // S4 Bug: verify both endpoints are included when they align with step boundaries
    const ticks = computeTicks(0, 50, 6);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(50);
  });
});

// ── defaultFormat ────────────────────────────────────────────────────────

describe('defaultFormat', () => {
  it('formats integers without decimals', () => {
    expect(defaultFormat(42)).toBe('42');
    expect(defaultFormat(0)).toBe('0');
  });

  it('formats decimals to one place', () => {
    expect(defaultFormat(3.14)).toBe('3.1');
    expect(defaultFormat(0.5)).toBe('0.5');
  });

  it('formats numbers with locale-aware digits when requested', () => {
    expect(defaultFormat(42, 'ar-EG')).toBe('٤٢');
  });
});

// ── renderTitle ──────────────────────────────────────────────────────────

describe('renderTitle', () => {
  it('centers the title text', () => {
    const lines = renderTitle({ title: 'Test' }, 20);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Test');
    // Check centering: should have padding
    expect(lines[0]!.indexOf('Test')).toBeGreaterThan(0);
  });

  it('includes subtitle when provided', () => {
    const lines = renderTitle({ title: 'Title', subtitle: 'Sub' }, 20);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Title');
    expect(lines[1]).toContain('Sub');
  });

  it('returns empty array when no title or subtitle', () => {
    expect(renderTitle({}, 20)).toEqual([]);
  });

  it('truncates titles by display width', () => {
    const lines = renderTitle({ title: 'ABCDEFGHIJ' }, 6);
    expect(lines[0]).toBe('ABCDEF');
  });
});

// ── renderXTickLabels ────────────────────────────────────────────────────

describe('renderXTickLabels', () => {
  it('produces a string of the correct width', () => {
    const line = renderXTickLabels([0, 50, 100], 0, 100, 30);
    expect(line.length).toBe(30);
  });

  it('includes tick values', () => {
    const line = renderXTickLabels([0, 50, 100], 0, 100, 40);
    expect(line).toContain('0');
    expect(line).toContain('50');
    expect(line).toContain('100');
  });
});

// ── renderYTickLabels ────────────────────────────────────────────────────

describe('renderYTickLabels', () => {
  it('returns row/label pairs', () => {
    const labels = renderYTickLabels([0, 50, 100], 0, 100, 10);
    expect(labels.length).toBe(3);
    for (const l of labels) {
      expect(typeof l.row).toBe('number');
      expect(typeof l.label).toBe('string');
    }
  });

  it('higher values map to lower row numbers', () => {
    const labels = renderYTickLabels([0, 100], 0, 100, 10);
    const low = labels.find((l) => l.label === '0')!;
    const high = labels.find((l) => l.label === '100')!;
    expect(high.row).toBeLessThan(low.row);
  });
});

// ── renderLegend ─────────────────────────────────────────────────────────

describe('renderLegend', () => {
  it('includes entry labels', () => {
    const legend = renderLegend({
      entries: [
        { label: 'Series A', color: color.red },
        { label: 'Series B', color: color.blue },
      ],
    });
    expect(legend).toContain('Series A');
    expect(legend).toContain('Series B');
  });

  it('includes ANSI color codes', () => {
    const legend = renderLegend({
      entries: [{ label: 'Red', color: color.red }],
    });
    // Should contain red fg escape
    expect(legend).toContain('\x1b[31m');
  });
});

// ── responsiveSize ───────────────────────────────────────────────────────

describe('responsiveSize', () => {
  it('returns dimensions that fit within constraints', () => {
    const { width, height } = responsiveSize(80, 24);
    expect(width).toBeLessThanOrEqual(80);
    expect(height).toBeLessThanOrEqual(24);
    expect(width).toBeGreaterThanOrEqual(10);
    expect(height).toBeGreaterThanOrEqual(5);
  });

  it('respects custom aspect ratio', () => {
    const { width, height } = responsiveSize(100, 100, 2);
    // Width/height should approximate the ratio
    expect(width / height).toBeGreaterThan(1);
  });

  it('handles very small constraints', () => {
    const { width, height } = responsiveSize(5, 3);
    // Small inputs get clamped to minimum 10 width, height limited by aspect ratio
    expect(width).toBeGreaterThanOrEqual(10);
    expect(height).toBeGreaterThanOrEqual(1);
  });
});

// ── drawGrid ─────────────────────────────────────────────────────────────

describe('drawGrid', () => {
  it('draws horizontal grid lines', () => {
    const c = canvas(20, 10);
    drawGrid(c, { horizontal: true, style: 'dotted' }, [], [0.5], 0, 0, c.pixelWidth, c.pixelHeight);
    // Some pixels should be set in the middle row area
    const midY = Math.round(0.5 * (c.pixelHeight - 1));
    let foundSet = false;
    for (let px = 0; px < c.pixelWidth; px += 3) {
      if (c.get(px, midY)) foundSet = true;
    }
    expect(foundSet).toBe(true);
  });

  it('draws vertical grid lines', () => {
    const c = canvas(20, 10);
    drawGrid(c, { vertical: true, style: 'dotted' }, [0.5], [], 0, 0, c.pixelWidth, c.pixelHeight);
    const midX = Math.round(0.5 * (c.pixelWidth - 1));
    let foundSet = false;
    for (let py = 0; py < c.pixelHeight; py += 3) {
      if (c.get(midX, py)) foundSet = true;
    }
    expect(foundSet).toBe(true);
  });

  it('should respect GridStyle config instead of always drawing dotted (step=3)', () => {
    // Bug 5.9: drawGrid hardcodes px += 3 regardless of config.style
    // Solid grid should have step=1 (every pixel), dashed step=2, dotted step=3
    const pW = 40;
    const pH = 40;

    // Solid grid should set more pixels than dotted
    const cSolid = canvas(20, 10);
    drawGrid(cSolid, { horizontal: true, style: 'solid' }, [], [0.5], 0, 0, pW, pH);

    const cDotted = canvas(20, 10);
    drawGrid(cDotted, { horizontal: true, style: 'dotted' }, [], [0.5], 0, 0, pW, pH);

    // Count set pixels for each
    const midY = Math.round(0.5 * (pH - 1));
    let solidCount = 0;
    let dottedCount = 0;
    for (let px = 0; px < pW; px++) {
      if (cSolid.get(px, midY)) solidCount++;
      if (cDotted.get(px, midY)) dottedCount++;
    }

    // Solid should have more set pixels than dotted
    expect(solidCount).toBeGreaterThan(dottedCount);
  });

  it('should draw dashed grid with step=2', () => {
    // Bug 5.9: Dashed should use step=2, not step=3
    const pW = 40;
    const pH = 40;

    const cDashed = canvas(20, 10);
    drawGrid(cDashed, { horizontal: true, style: 'dashed' }, [], [0.5], 0, 0, pW, pH);

    const cDotted = canvas(20, 10);
    drawGrid(cDotted, { horizontal: true, style: 'dotted' }, [], [0.5], 0, 0, pW, pH);

    const midY = Math.round(0.5 * (pH - 1));
    let dashedCount = 0;
    let dottedCount = 0;
    for (let px = 0; px < pW; px++) {
      if (cDashed.get(px, midY)) dashedCount++;
      if (cDotted.get(px, midY)) dottedCount++;
    }

    // Dashed (step=2) should have more set pixels than dotted (step=3)
    expect(dashedCount).toBeGreaterThan(dottedCount);
  });
});

// ── composeChartChrome ───────────────────────────────────────────────────

describe('composeChartChrome', () => {
  it('adds title above chart body', () => {
    const result = composeChartChrome(
      'CHART',
      {
        title: { title: 'My Chart' },
      },
      { width: 20, height: 5 },
    );
    const lines = result.split('\n');
    expect(lines[0]).toContain('My Chart');
  });

  it('adds legend below chart body', () => {
    const result = composeChartChrome(
      'CHART',
      {
        legend: {
          entries: [{ label: 'A', color: color.red }],
          position: 'bottom',
        },
      },
      { width: 20, height: 5 },
    );
    expect(result).toContain('A');
  });

  it('includes Y axis labels', () => {
    const result = composeChartChrome(
      'LINE1\nLINE2\nLINE3',
      {
        axis: { yLabel: 'Value', tickCount: 3 },
      },
      { width: 10, height: 3, minY: 0, maxY: 100 },
    );
    expect(result).toContain('Value');
  });

  it('formats axis ticks with the configured locale when no custom formatter is provided', () => {
    const result = composeChartChrome(
      'LINE1\nLINE2\nLINE3',
      {
        axis: { tickCount: 3, locale: 'ar-EG' },
      },
      { width: 10, height: 3, minY: 0, maxY: 10 },
    );

    expect(result).toMatch(/[٠١٢٣٤٥٦٧٨٩]/u);
  });

  it('legend position top places legend before chart body', () => {
    const result = composeChartChrome(
      'CHART_BODY',
      {
        legend: {
          entries: [{ label: 'Series A', color: color.red }],
          position: 'top',
        },
      },
      { width: 30, height: 5 },
    );
    const lines = result.split('\n');
    // Find the line containing the legend and the line containing the chart body
    const legendLine = lines.findIndex((l) => l.includes('Series A'));
    const chartLine = lines.findIndex((l) => l.includes('CHART_BODY'));
    expect(legendLine).toBeGreaterThanOrEqual(0);
    expect(chartLine).toBeGreaterThanOrEqual(0);
    // Legend should appear BEFORE chart body
    expect(legendLine).toBeLessThan(chartLine);
  });

  it('legend position right appends legend to first chart line', () => {
    const result = composeChartChrome(
      'CHART_LINE1\nCHART_LINE2',
      {
        legend: {
          entries: [{ label: 'RightLegend', color: color.blue }],
          position: 'right',
        },
      },
      { width: 30, height: 5 },
    );
    const lines = result.split('\n');
    // The first chart line should contain the legend text
    const firstChartLine = lines.find((l) => l.includes('CHART_LINE1'));
    expect(firstChartLine).toBeDefined();
    expect(firstChartLine).toContain('RightLegend');
  });

  it('legend position bottom places legend after chart body', () => {
    const result = composeChartChrome(
      'CHART_BODY',
      {
        legend: {
          entries: [{ label: 'Series B', color: color.green }],
          position: 'bottom',
        },
      },
      { width: 30, height: 5 },
    );
    const lines = result.split('\n');
    const legendLine = lines.findIndex((l) => l.includes('Series B'));
    const chartLine = lines.findIndex((l) => l.includes('CHART_BODY'));
    expect(legendLine).toBeGreaterThan(chartLine);
  });

  it('yLabel should not double-prefix when tick labels are present', () => {
    const result = composeChartChrome(
      'LINE1\nLINE2\nLINE3',
      {
        axis: { yLabel: 'Temp', tickCount: 3 },
      },
      { width: 10, height: 3, minY: 0, maxY: 100 },
    );
    // The yLabel 'Temp' should appear exactly once in the output
    const matches = result.match(/Temp/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });
});
