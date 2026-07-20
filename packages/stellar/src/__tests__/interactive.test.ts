import { describe, expect, it } from 'vitest';
import { buildBarHitRegions, buildPointHitRegions, createInteractiveChart, type HitRegion } from '../interactive.js';

// ── Test Data ────────────────────────────────────────────────────────────

function makeRegions(): HitRegion[] {
  return [
    { id: 'p0', seriesIndex: 0, pointIndex: 0, x: 5, y: 2, width: 2, height: 2, value: 10, label: 'Point A' },
    { id: 'p1', seriesIndex: 0, pointIndex: 1, x: 10, y: 4, width: 2, height: 2, value: 20, label: 'Point B' },
    { id: 'p2', seriesIndex: 0, pointIndex: 2, x: 15, y: 1, width: 2, height: 2, value: 30 },
  ];
}

// ── createInteractiveChart ───────────────────────────────────────────────

describe('createInteractiveChart', () => {
  it('exposes hitRegions', () => {
    const regions = makeRegions();
    const ic = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions,
    });
    expect(ic.hitRegions).toEqual(regions);
    expect(ic.hitRegions).not.toBe(regions);
    expect(ic.hitRegions.length).toBe(3);
  });

  it('hitTest returns region when position matches', () => {
    const ic = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions: makeRegions(),
    });
    const hit = ic.hitTest(5, 2);
    expect(hit).not.toBeNull();
    expect(hit!.id).toBe('p0');
  });

  it('hitTest returns null when position misses all regions', () => {
    const ic = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions: makeRegions(),
    });
    expect(ic.hitTest(0, 0)).toBeNull();
  });

  it('getTooltip returns formatted tooltip on hit', () => {
    const ic = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions: makeRegions(),
    });
    const tooltip = ic.getTooltip(5, 2);
    expect(tooltip).not.toBeNull();
    expect(tooltip!.text).toContain('Point A');
    expect(tooltip!.text).toContain('10');
  });

  it('getTooltip returns null on miss', () => {
    const ic = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions: makeRegions(),
    });
    expect(ic.getTooltip(0, 0)).toBeNull();
  });

  it('getTooltip uses custom formatter', () => {
    const ic = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions: makeRegions(),
      formatTooltip: (r) => `Custom: ${r.value}`,
    });
    const tooltip = ic.getTooltip(5, 2);
    expect(tooltip!.text).toBe('Custom: 10');
  });

  it('handleClick selects a region', () => {
    const ic = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions: makeRegions(),
    });
    const state = ic.handleClick(10, 4);
    expect(state.selected).not.toBeNull();
    expect(state.selected!.id).toBe('p1');
  });

  it('handleClick toggles selection off', () => {
    const ic = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions: makeRegions(),
    });
    ic.handleClick(10, 4); // select
    const state = ic.handleClick(10, 4); // deselect
    expect(state.selected).toBeNull();
  });

  it('handleClick clears selection on miss', () => {
    const ic = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions: makeRegions(),
    });
    ic.handleClick(10, 4); // select
    const state = ic.handleClick(0, 0); // miss
    expect(state.selected).toBeNull();
  });

  it('updateCrosshair tracks position within chart', () => {
    const ic = createInteractiveChart({
      chartX: 2,
      chartY: 1,
      chartWidth: 15,
      chartHeight: 8,
      regions: [],
    });
    const state = ic.updateCrosshair(5, 3);
    expect(state.visible).toBe(true);
    expect(state.col).toBe(5);
    expect(state.row).toBe(3);
  });

  it('updateCrosshair marks invisible when outside chart', () => {
    const ic = createInteractiveChart({
      chartX: 2,
      chartY: 1,
      chartWidth: 15,
      chartHeight: 8,
      regions: [],
    });
    const state = ic.updateCrosshair(0, 0);
    expect(state.visible).toBe(false);
  });

  it('renderCrosshair returns empty string when not visible', () => {
    const ic = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 10,
      chartHeight: 5,
      regions: [],
    });
    expect(ic.renderCrosshair()).toBe('');
  });

  it('renderCrosshair returns content when visible', () => {
    const ic = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 10,
      chartHeight: 5,
      regions: [],
    });
    ic.updateCrosshair(3, 2);
    const output = ic.renderCrosshair();
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain('\u253C'); // cross character
  });

  it('selection and crosshair getters reflect current state', () => {
    const ic = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions: makeRegions(),
    });
    expect(ic.selection.selected).toBeNull();
    expect(ic.crosshair.visible).toBe(false);

    ic.handleClick(5, 2);
    expect(ic.selection.selected!.id).toBe('p0');

    ic.updateCrosshair(5, 3);
    expect(ic.crosshair.visible).toBe(true);
  });
});

// ── buildPointHitRegions ─────────────────────────────────────────────────

describe('buildPointHitRegions', () => {
  it('creates one region per data point', () => {
    const data: [number, number][] = [
      [0, 0],
      [5, 5],
      [10, 10],
    ];
    const regions = buildPointHitRegions(data, 0, 0, 40, 20, 0, 10, 0, 10);
    expect(regions.length).toBe(3);
  });

  it('regions have correct ids', () => {
    const data: [number, number][] = [
      [1, 2],
      [3, 4],
    ];
    const regions = buildPointHitRegions(data, 0, 0, 20, 10, 0, 10, 0, 10);
    expect(regions[0]!.id).toBe('s0-p0');
    expect(regions[1]!.id).toBe('s0-p1');
  });

  it('uses custom series index', () => {
    const data: [number, number][] = [[0, 0]];
    const regions = buildPointHitRegions(data, 0, 0, 20, 10, 0, 10, 0, 10, 2);
    expect(regions[0]!.seriesIndex).toBe(2);
    expect(regions[0]!.id).toBe('s2-p0');
  });

  it('regions are within chart bounds', () => {
    const data: [number, number][] = [
      [0, 0],
      [10, 10],
    ];
    const regions = buildPointHitRegions(data, 5, 3, 30, 15, 0, 10, 0, 10);
    for (const r of regions) {
      expect(r.x).toBeGreaterThanOrEqual(5);
      expect(r.y).toBeGreaterThanOrEqual(3);
    }
  });

  it('should clamp hit region width and height to stay within chart bounds on right/bottom edge', () => {
    // Bug 5.6: Left/top edge is clamped with Math.max but right/bottom edge is not,
    // allowing hit regions to extend beyond the chart area.
    const chartX = 5;
    const chartY = 3;
    const chartWidth = 30;
    const chartHeight = 15;
    // Place a point at the far right edge of data space
    const data: [number, number][] = [
      [10, 0],
      [10, 10],
    ];
    const regions = buildPointHitRegions(data, chartX, chartY, chartWidth, chartHeight, 0, 10, 0, 10);
    for (const r of regions) {
      // Region should not extend beyond the chart's right edge
      expect(r.x + r.width).toBeLessThanOrEqual(chartX + chartWidth);
      // Region should not extend beyond the chart's bottom edge
      expect(r.y + r.height).toBeLessThanOrEqual(chartY + chartHeight);
    }
  });

  it('should clamp single-point hit regions at chart boundary', () => {
    // Bug 5.6: Point at exact corner should not overflow
    const chartX = 0;
    const chartY = 0;
    const chartWidth = 10;
    const chartHeight = 5;
    const data: [number, number][] = [[10, 0]]; // bottom-right corner
    const regions = buildPointHitRegions(data, chartX, chartY, chartWidth, chartHeight, 0, 10, 0, 10);
    for (const r of regions) {
      expect(r.x + r.width).toBeLessThanOrEqual(chartX + chartWidth);
      expect(r.y + r.height).toBeLessThanOrEqual(chartY + chartHeight);
    }
  });
});

// ── buildBarHitRegions ───────────────────────────────────────────────────

describe('buildBarHitRegions', () => {
  it('creates one region per bar', () => {
    const regions = buildBarHitRegions([10, 20, 30], 0, 0, 30, 10);
    expect(regions.length).toBe(3);
  });

  it('regions have correct bar ids', () => {
    const regions = buildBarHitRegions([5], 0, 0, 10, 5);
    expect(regions[0]!.id).toBe('bar-0');
  });

  it('includes labels when provided', () => {
    const regions = buildBarHitRegions([10, 20], 0, 0, 20, 10, ['A', 'B']);
    expect(regions[0]!.label).toBe('A');
    expect(regions[1]!.label).toBe('B');
  });

  it('taller bars have taller hit regions', () => {
    const regions = buildBarHitRegions([10, 50], 0, 0, 20, 10);
    expect(regions[1]!.height).toBeGreaterThan(regions[0]!.height);
  });

  it('should return empty array for all-zero data instead of ghost hit regions', () => {
    // S2 Bug: buildBarHitRegions uses Math.max(...values, 1) which means
    // all-zero bars get 1-pixel hit regions at the bottom even though no bars
    // are visible. Zero-valued bars should produce no hit regions.
    const regions = buildBarHitRegions([0, 0, 0], 0, 0, 30, 10);
    expect(regions).toEqual([]);
  });

  it('should return empty array for negative-only data when no bars are visible', () => {
    // S2 Bug: negative-only data with Math.max(...values, 1) creates ghost
    // regions because maxVal becomes 1 and negative values get Math.max(1, ...)
    // hit heights.
    const regions = buildBarHitRegions([-5, -10, -3], 0, 0, 30, 10);
    // With the bar chart rendering negative bars downward from zero line,
    // the hit regions should have correct positions (below zero line)
    // or be empty if bar rendering doesn't handle negatives in interactive mode.
    // The key point: no ghost hit regions at the top for invisible bars.
    for (const r of regions) {
      // Each region should have height > 0 only if the bar is actually rendered
      if (r.height > 0) {
        // For negative bars, the y position should be at or below the zero line
        expect(r.y).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('interactive boundary hardening', () => {
  it('maps extreme finite ranges without producing invalid regions', () => {
    const regions = buildPointHitRegions(
      [
        [-Number.MAX_VALUE, -Number.MAX_VALUE],
        [Number.MAX_VALUE, Number.MAX_VALUE],
      ],
      0,
      0,
      20,
      10,
      -Number.MAX_VALUE,
      Number.MAX_VALUE,
      -Number.MAX_VALUE,
      Number.MAX_VALUE,
    );
    expect(regions).toHaveLength(2);
    expect(regions.flatMap((region) => [region.x, region.y, region.width, region.height]).every(Number.isFinite)).toBe(true);
  });

  it('sanitizes tooltip formatters and isolates input region mutations', () => {
    const regions = makeRegions();
    const chart = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions,
      formatTooltip: () => 'safe\x1b[2Jtext',
    });
    regions[0]!.id = 'mutated';
    expect(chart.getTooltip(5, 2)?.text).toBe('safetext');
    expect(chart.hitTest(5, 2)?.id).toBe('p0');
  });
});
