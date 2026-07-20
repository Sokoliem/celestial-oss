import { HitMap } from '@celestial/nexus';
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

// ── Nexus HitMap integration ─────────────────────────────────────────────

describe('Nexus HitMap integration', () => {
  it('nexusHitMap is exposed on the interactive chart controller', () => {
    const ic = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions: makeRegions(),
    });
    expect(ic.nexusHitMap).toBeInstanceOf(HitMap);
  });

  it('nexusHitMap contains all registered regions', () => {
    const regions = makeRegions();
    const ic = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions,
    });
    const all = ic.nexusHitMap.getAll();
    expect(all.length).toBe(3);
  });

  it('nexusHitMap.hitTest returns the HitRegion via onClick', () => {
    const regions = makeRegions();
    const ic = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions,
    });
    const hit = ic.nexusHitMap.hitTest(5, 2);
    expect(hit).not.toBeNull();
    expect(hit!.onClick).toBe(regions[0]);
  });

  it('nexusHitMap.hitTest returns null for misses', () => {
    const ic = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions: makeRegions(),
    });
    expect(ic.nexusHitMap.hitTest(0, 0)).toBeNull();
  });

  it('nexusHitMap respects z-order (last registered wins)', () => {
    // Create overlapping regions
    const overlapping: HitRegion[] = [
      { id: 'bottom', seriesIndex: 0, pointIndex: 0, x: 5, y: 5, width: 5, height: 5, value: 1 },
      { id: 'top', seriesIndex: 0, pointIndex: 1, x: 5, y: 5, width: 5, height: 5, value: 2 },
    ];
    const ic = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 20,
      regions: overlapping,
    });
    // Nexus HitMap returns last registered (z-order top)
    const hit = ic.nexusHitMap.hitTest(7, 7);
    expect(hit).not.toBeNull();
    expect(hit!.onClick!.id).toBe('top');
  });
});

// ── Default strategy (hitmap) ────────────────────────────────────────────

describe('hitStrategy: hitmap (default)', () => {
  it('hitTest delegates to Nexus HitMap', () => {
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

  it('hitTest returns null for misses', () => {
    const ic = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions: makeRegions(),
    });
    expect(ic.hitTest(0, 0)).toBeNull();
  });

  it('hitTest with overlapping regions returns last registered (z-order)', () => {
    const overlapping: HitRegion[] = [
      { id: 'bottom', seriesIndex: 0, pointIndex: 0, x: 5, y: 5, width: 5, height: 5, value: 1 },
      { id: 'top', seriesIndex: 0, pointIndex: 1, x: 5, y: 5, width: 5, height: 5, value: 2 },
    ];
    const ic = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 20,
      regions: overlapping,
    });
    const hit = ic.hitTest(7, 7);
    expect(hit).not.toBeNull();
    expect(hit!.id).toBe('top');
  });
});

// ── Cell strategy (O(1) grid lookup) ─────────────────────────────────────

describe('hitStrategy: cell', () => {
  it('hitTest returns correct region via O(1) cell grid', () => {
    const ic = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions: makeRegions(),
      hitStrategy: 'cell',
    });
    const hit = ic.hitTest(5, 2);
    expect(hit).not.toBeNull();
    expect(hit!.id).toBe('p0');
  });

  it('hitTest returns null for misses', () => {
    const ic = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions: makeRegions(),
      hitStrategy: 'cell',
    });
    expect(ic.hitTest(0, 0)).toBeNull();
  });

  it('hitTest returns null for out-of-chart-bounds positions', () => {
    const ic = createInteractiveChart({
      chartX: 5,
      chartY: 3,
      chartWidth: 10,
      chartHeight: 5,
      regions: [{ id: 'p0', seriesIndex: 0, pointIndex: 0, x: 5, y: 3, width: 2, height: 2, value: 10 }],
      hitStrategy: 'cell',
    });
    // Before chart area
    expect(ic.hitTest(4, 3)).toBeNull();
    expect(ic.hitTest(5, 2)).toBeNull();
    // After chart area
    expect(ic.hitTest(15, 3)).toBeNull();
    expect(ic.hitTest(5, 8)).toBeNull();
  });

  it('cell grid handles overlapping regions (last wins)', () => {
    const overlapping: HitRegion[] = [
      { id: 'bottom', seriesIndex: 0, pointIndex: 0, x: 5, y: 5, width: 5, height: 5, value: 1 },
      { id: 'top', seriesIndex: 0, pointIndex: 1, x: 5, y: 5, width: 5, height: 5, value: 2 },
    ];
    const ic = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 20,
      regions: overlapping,
      hitStrategy: 'cell',
    });
    const hit = ic.hitTest(7, 7);
    expect(hit).not.toBeNull();
    expect(hit!.id).toBe('top');
  });

  it('cell grid with offset chart coordinates', () => {
    const regions: HitRegion[] = [{ id: 'p0', seriesIndex: 0, pointIndex: 0, x: 12, y: 8, width: 3, height: 2, value: 42 }];
    const ic = createInteractiveChart({
      chartX: 10,
      chartY: 5,
      chartWidth: 15,
      chartHeight: 10,
      regions,
      hitStrategy: 'cell',
    });
    // Inside the region
    expect(ic.hitTest(13, 9)?.id).toBe('p0');
    // Outside the region but inside chart
    expect(ic.hitTest(10, 5)).toBeNull();
  });

  it('nexusHitMap is still available even with cell strategy', () => {
    const ic = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions: makeRegions(),
      hitStrategy: 'cell',
    });
    // nexusHitMap is always built for external Nexus integration
    expect(ic.nexusHitMap).toBeInstanceOf(HitMap);
    expect(ic.nexusHitMap.getAll().length).toBe(3);
  });
});

// ── Strategy consistency ─────────────────────────────────────────────────

describe('strategy consistency', () => {
  it('both strategies return the same results for non-overlapping regions', () => {
    const regions = makeRegions();

    const icHitmap = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions,
      hitStrategy: 'hitmap',
    });
    const icCell = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions,
      hitStrategy: 'cell',
    });

    // Test hits
    for (const region of regions) {
      const hitHitmap = icHitmap.hitTest(region.x, region.y);
      const hitCell = icCell.hitTest(region.x, region.y);
      expect(hitHitmap?.id).toBe(hitCell?.id);
    }

    // Test misses
    for (const [col, row] of [
      [0, 0],
      [3, 3],
      [8, 8],
      [19, 9],
    ] as [number, number][]) {
      const hitHitmap = icHitmap.hitTest(col, row);
      const hitCell = icCell.hitTest(col, row);
      expect(hitHitmap?.id ?? null).toBe(hitCell?.id ?? null);
    }
  });

  it('tooltips work identically across strategies', () => {
    const regions = makeRegions();

    const icHitmap = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions,
      hitStrategy: 'hitmap',
    });
    const icCell = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions,
      hitStrategy: 'cell',
    });

    const tooltip1 = icHitmap.getTooltip(5, 2);
    const tooltip2 = icCell.getTooltip(5, 2);
    expect(tooltip1?.text).toBe(tooltip2?.text);
    expect(tooltip1?.region.id).toBe(tooltip2?.region.id);
  });

  it('selection works identically across strategies', () => {
    const regions = makeRegions();

    const icHitmap = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions,
      hitStrategy: 'hitmap',
    });
    const icCell = createInteractiveChart({
      chartX: 0,
      chartY: 0,
      chartWidth: 20,
      chartHeight: 10,
      regions,
      hitStrategy: 'cell',
    });

    const sel1 = icHitmap.handleClick(10, 4);
    const sel2 = icCell.handleClick(10, 4);
    expect(sel1.selected?.id).toBe(sel2.selected?.id);
  });
});

// ── buildPointHitRegions + Nexus integration ─────────────────────────────

describe('buildPointHitRegions + Nexus', () => {
  it('built regions can be registered into a Nexus HitMap', () => {
    const data: [number, number][] = [
      [0, 0],
      [5, 5],
      [10, 10],
    ];
    const regions = buildPointHitRegions(data, 0, 0, 40, 20, 0, 10, 0, 10);

    const hitMap = new HitMap<string>();
    for (const r of regions) {
      hitMap.register({
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        onClick: r.id,
        cursor: 'pointer',
      });
    }

    expect(hitMap.getAll().length).toBe(3);
    // First point at data (0,0) should be at left-bottom of chart
    const hit = hitMap.hitTest(regions[0]!.x, regions[0]!.y);
    expect(hit).not.toBeNull();
    expect(hit!.onClick).toBe('s0-p0');
  });
});

// ── buildBarHitRegions + Nexus integration ───────────────────────────────

describe('buildBarHitRegions + Nexus', () => {
  it('built bar regions can be registered into a Nexus HitMap', () => {
    const regions = buildBarHitRegions([10, 20, 30], 0, 0, 30, 10);

    const hitMap = new HitMap<string>();
    for (const r of regions) {
      hitMap.register({
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        onClick: r.id,
      });
    }

    expect(hitMap.getAll().length).toBe(3);
  });
});
