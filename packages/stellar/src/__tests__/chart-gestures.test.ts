import { HitMap } from '@celestial/nexus';
import { describe, expect, it } from 'vitest';
import {
  type ChartCoordinateMap,
  type ChartGestureConfig,
  chartGestureUpdate,
  checkChartLongPress,
  createChartGestureState,
  createCoordinateMap,
  type MouseEventData,
  registerChartRegions,
  renderPanIndicator,
  renderRangeSelection,
} from '../chart-gestures.js';
import type { HitRegion } from '../interactive.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeCoordMap(): ChartCoordinateMap {
  return createCoordinateMap({
    chartX: 2,
    chartY: 1,
    chartWidth: 20,
    chartHeight: 10,
    dataMinX: 0,
    dataMaxX: 100,
    dataMinY: 0,
    dataMaxY: 50,
  });
}

function press(col: number, row: number): MouseEventData {
  return { type: 'press', button: 0, x: col, y: row, ctrl: false, alt: false, shift: false };
}

function release(col: number, row: number): MouseEventData {
  return { type: 'release', button: 0, x: col, y: row, ctrl: false, alt: false, shift: false };
}

function move(col: number, row: number): MouseEventData {
  return { type: 'move', button: 0, x: col, y: row, ctrl: false, alt: false, shift: false };
}

const defaultConfig: ChartGestureConfig = {
  rangeSelect: true,
  pan: false,
  longPress: true,
  scrollZoom: false,
  dragThreshold: 2,
  longPressMs: 500,
};

// ── ChartCoordinateMap ──────────────────────────────────────────────────

describe('ChartCoordinateMap', () => {
  it('createCoordinateMap() returns valid map', () => {
    const map = makeCoordMap();
    expect(map).toBeDefined();
    expect(map.cellToData).toBeTypeOf('function');
    expect(map.dataToCell).toBeTypeOf('function');
  });

  it('cellToData() correctly maps terminal cells to data coordinates', () => {
    const map = makeCoordMap();
    // chartX=2 is left edge → dataX=0, chartX+chartWidth-1=21 is right edge → dataX=100
    // chartY=1 is top edge → dataY=50, chartY+chartHeight-1=10 is bottom edge → dataY=0
    const topLeft = map.cellToData(2, 1);
    expect(topLeft).not.toBeNull();
    expect(topLeft!.x).toBeCloseTo(0, 0);
    expect(topLeft!.y).toBeCloseTo(50, 0);

    const bottomRight = map.cellToData(21, 10);
    expect(bottomRight).not.toBeNull();
    expect(bottomRight!.x).toBeCloseTo(100, 0);
    expect(bottomRight!.y).toBeCloseTo(0, 0);
  });

  it('cellToData() returns null for positions outside chart bounds', () => {
    const map = makeCoordMap();
    expect(map.cellToData(0, 0)).toBeNull(); // above/left
    expect(map.cellToData(25, 15)).toBeNull(); // below/right
    expect(map.cellToData(1, 5)).toBeNull(); // just left of chart
    expect(map.cellToData(22, 5)).toBeNull(); // just right of chart
  });

  it('dataToCell() correctly maps data coordinates to terminal cells', () => {
    const map = makeCoordMap();
    // data (0, 0) → bottom-left → cell (2, 10)
    const bl = map.dataToCell(0, 0);
    expect(bl.col).toBeCloseTo(2, 0);
    expect(bl.row).toBeCloseTo(10, 0);

    // data (100, 50) → top-right → cell (21, 1)
    const tr = map.dataToCell(100, 50);
    expect(tr.col).toBeCloseTo(21, 0);
    expect(tr.row).toBeCloseTo(1, 0);
  });

  it('cellToData()/dataToCell() round-trip correctly', () => {
    const map = makeCoordMap();
    // Pick a cell in the middle of the chart
    const col = 12;
    const row = 5;
    const data = map.cellToData(col, row);
    expect(data).not.toBeNull();
    const cell = map.dataToCell(data!.x, data!.y);
    expect(Math.round(cell.col)).toBe(col);
    expect(Math.round(cell.row)).toBe(row);
  });

  it('handles single data point range (zero range)', () => {
    const map = createCoordinateMap({
      chartX: 0,
      chartY: 0,
      chartWidth: 10,
      chartHeight: 5,
      dataMinX: 5,
      dataMaxX: 5,
      dataMinY: 10,
      dataMaxY: 10,
    });
    // With zero range, all cells should map to the single data value
    const data = map.cellToData(5, 2);
    expect(data).not.toBeNull();
    expect(data!.x).toBe(5);
    expect(data!.y).toBe(10);
  });
});

// ── ChartGestureState machine ───────────────────────────────────────────

describe('ChartGestureState machine', () => {
  it('createChartGestureState() starts in idle phase', () => {
    const state = createChartGestureState(makeCoordMap(), defaultConfig);
    expect(state.phase).toBe('idle');
  });

  it('press inside chart → pending phase', () => {
    const state = createChartGestureState(makeCoordMap(), defaultConfig);
    const { state: next } = chartGestureUpdate(state, press(5, 5), 1000);
    expect(next.phase).toBe('pending');
  });

  it('press outside chart → stays idle', () => {
    const state = createChartGestureState(makeCoordMap(), defaultConfig);
    const { state: next } = chartGestureUpdate(state, press(0, 0), 1000);
    expect(next.phase).toBe('idle');
  });

  it('pending + release before threshold → emits chart:click with correct data coordinates', () => {
    const state = createChartGestureState(makeCoordMap(), defaultConfig);
    const { state: s1 } = chartGestureUpdate(state, press(5, 5), 1000);
    expect(s1.phase).toBe('pending');

    const { state: s2, messages } = chartGestureUpdate(s1, release(5, 5), 1100);
    expect(s2.phase).toBe('idle');
    expect(messages.length).toBeGreaterThanOrEqual(1);

    const click = messages.find((m) => m.type === 'chart:click');
    expect(click).toBeDefined();
    expect(click!.type).toBe('chart:click');
    // Verify data coordinates are present
    expect(click!.dataX).toBeTypeOf('number');
    expect(click!.dataY).toBeTypeOf('number');
    // Verify cell coordinates are present
    expect(click!.col).toBe(5);
    expect(click!.row).toBe(5);
  });

  it('pending + move beyond dragThreshold with rangeSelect enabled → range-selecting phase', () => {
    const state = createChartGestureState(makeCoordMap(), defaultConfig);
    const { state: s1 } = chartGestureUpdate(state, press(5, 5), 1000);
    // Move beyond threshold (dragThreshold=2)
    const { state: s2, messages } = chartGestureUpdate(s1, move(8, 5), 1100);
    expect(s2.phase).toBe('range-selecting');

    const selecting = messages.find((m) => m.type === 'chart:range-selecting');
    expect(selecting).toBeDefined();
  });

  it('range-selecting + move → emits chart:range-selecting', () => {
    const state = createChartGestureState(makeCoordMap(), defaultConfig);
    const { state: s1 } = chartGestureUpdate(state, press(5, 5), 1000);
    const { state: s2 } = chartGestureUpdate(s1, move(8, 5), 1100);
    expect(s2.phase).toBe('range-selecting');

    const { messages } = chartGestureUpdate(s2, move(10, 5), 1200);
    const selecting = messages.find((m) => m.type === 'chart:range-selecting');
    expect(selecting).toBeDefined();
    expect(selecting!.startDataX).toBeTypeOf('number');
    expect(selecting!.endDataX).toBeTypeOf('number');
  });

  it('range-selecting + release → emits chart:range-selected with data bounds, returns to idle', () => {
    const state = createChartGestureState(makeCoordMap(), defaultConfig);
    const { state: s1 } = chartGestureUpdate(state, press(5, 5), 1000);
    const { state: s2 } = chartGestureUpdate(s1, move(8, 5), 1100);
    expect(s2.phase).toBe('range-selecting');

    const { state: s3, messages } = chartGestureUpdate(s2, release(12, 5), 1200);
    expect(s3.phase).toBe('idle');

    const selected = messages.find((m) => m.type === 'chart:range-selected');
    expect(selected).toBeDefined();
    expect(selected!.startDataX).toBeTypeOf('number');
    expect(selected!.endDataX).toBeTypeOf('number');
    expect(selected!.startDataY).toBeTypeOf('number');
    expect(selected!.endDataY).toBeTypeOf('number');
  });

  it('pending + move beyond dragThreshold with pan enabled → panning phase', () => {
    const panConfig: ChartGestureConfig = {
      ...defaultConfig,
      rangeSelect: false,
      pan: true,
    };
    const state = createChartGestureState(makeCoordMap(), panConfig);
    const { state: s1 } = chartGestureUpdate(state, press(5, 5), 1000);
    const { state: s2, messages } = chartGestureUpdate(s1, move(8, 5), 1100);
    expect(s2.phase).toBe('panning');

    const panning = messages.find((m) => m.type === 'chart:panning');
    expect(panning).toBeDefined();
  });

  it('panning + move → emits chart:panning with data deltas', () => {
    const panConfig: ChartGestureConfig = {
      ...defaultConfig,
      rangeSelect: false,
      pan: true,
    };
    const state = createChartGestureState(makeCoordMap(), panConfig);
    const { state: s1 } = chartGestureUpdate(state, press(5, 5), 1000);
    const { state: s2 } = chartGestureUpdate(s1, move(8, 5), 1100);
    expect(s2.phase).toBe('panning');

    const { messages } = chartGestureUpdate(s2, move(10, 6), 1200);
    const panning = messages.find((m) => m.type === 'chart:panning');
    expect(panning).toBeDefined();
    expect(panning!.deltaDataX).toBeTypeOf('number');
    expect(panning!.deltaDataY).toBeTypeOf('number');
  });

  it('panning + release → emits chart:pan-end, returns to idle', () => {
    const panConfig: ChartGestureConfig = {
      ...defaultConfig,
      rangeSelect: false,
      pan: true,
    };
    const state = createChartGestureState(makeCoordMap(), panConfig);
    const { state: s1 } = chartGestureUpdate(state, press(5, 5), 1000);
    const { state: s2 } = chartGestureUpdate(s1, move(8, 5), 1100);
    expect(s2.phase).toBe('panning');

    const { state: s3, messages } = chartGestureUpdate(s2, release(10, 6), 1200);
    expect(s3.phase).toBe('idle');

    const panEnd = messages.find((m) => m.type === 'chart:pan-end');
    expect(panEnd).toBeDefined();
  });

  it('checkChartLongPress() after longPressMs → emits chart:long-press', () => {
    const state = createChartGestureState(makeCoordMap(), defaultConfig);
    const { state: s1 } = chartGestureUpdate(state, press(5, 5), 1000);
    expect(s1.phase).toBe('pending');

    // Before threshold: no long-press
    const earlyResult = checkChartLongPress(s1, 1400);
    expect(earlyResult.message).toBeNull();

    // After threshold: long-press fires
    const lateResult = checkChartLongPress(s1, 1600);
    expect(lateResult.message).not.toBeNull();
    expect(lateResult.message!.type).toBe('chart:long-press');
    if (lateResult.message && lateResult.message.type === 'chart:long-press') {
      expect(lateResult.message.col).toBeTypeOf('number');
      expect(lateResult.message.row).toBeTypeOf('number');
      expect(lateResult.message.dataX).toBeTypeOf('number');
      expect(lateResult.message.dataY).toBeTypeOf('number');
    }
  });

  it('checkChartLongPress() should not fire repeatedly on subsequent timer ticks', () => {
    // Bug 5.10: checkChartLongPress returns a message but doesn't transition state
    // to prevent re-firing. The function fires repeatedly every timer tick.
    // Fix: checkChartLongPress returns { message, state } so the caller can
    // track that the long-press has already fired.
    const state = createChartGestureState(makeCoordMap(), defaultConfig);
    const { state: s1 } = chartGestureUpdate(state, press(5, 5), 1000);
    expect(s1.phase).toBe('pending');

    // First call after threshold: should fire
    const result1 = checkChartLongPress(s1, 1600);
    expect(result1.message).not.toBeNull();
    expect(result1.message!.type).toBe('chart:long-press');

    // Second call with the UPDATED state from first call: should NOT fire again
    const result2 = checkChartLongPress(result1.state, 1700);
    expect(result2.message).toBeNull();
  });

  it('disabled gestures in config → not triggered', () => {
    const disabledConfig: ChartGestureConfig = {
      rangeSelect: false,
      pan: false,
      longPress: false,
      scrollZoom: false,
      dragThreshold: 2,
      longPressMs: 500,
    };
    const state = createChartGestureState(makeCoordMap(), disabledConfig);
    const { state: s1 } = chartGestureUpdate(state, press(5, 5), 1000);
    // Move beyond threshold — but both rangeSelect and pan are off
    const { state: s2 } = chartGestureUpdate(s1, move(8, 5), 1100);
    // Should stay pending (or go to idle), never enter range-selecting or panning
    expect(s2.phase).not.toBe('range-selecting');
    expect(s2.phase).not.toBe('panning');

    // Long-press disabled
    const lp = checkChartLongPress(s1, 2000);
    expect(lp.message).toBeNull();
  });

  it('hover over chart → always emits chart:hover', () => {
    const state = createChartGestureState(makeCoordMap(), defaultConfig);
    // Move (hover) inside chart while idle
    const { messages } = chartGestureUpdate(state, move(5, 5), 1000);
    const hover = messages.find((m) => m.type === 'chart:hover');
    expect(hover).toBeDefined();
    expect(hover!.col).toBe(5);
    expect(hover!.row).toBe(5);
    expect(hover!.dataX).toBeTypeOf('number');
    expect(hover!.dataY).toBeTypeOf('number');
  });
});

// ── Nexus bridge ────────────────────────────────────────────────────────

describe('registerChartRegions', () => {
  it('registers all HitRegions into the provided hitMap', () => {
    const regions: HitRegion[] = [
      { id: 'p0', seriesIndex: 0, pointIndex: 0, x: 5, y: 2, width: 2, height: 2, value: 10 },
      { id: 'p1', seriesIndex: 0, pointIndex: 1, x: 10, y: 4, width: 2, height: 2, value: 20 },
    ];

    const hitMap = new HitMap<{ type: string; id: string }>();

    registerChartRegions(regions, hitMap, (r) => ({ type: 'point-clicked' as const, id: r.id }));
    const all = hitMap.getAll();
    expect(all.length).toBe(2);
    expect(all[0]!.x).toBe(5);
    expect(all[1]!.x).toBe(10);
  });

  it('message mapper is called with correct HitRegion', () => {
    const region: HitRegion = {
      id: 'p0',
      seriesIndex: 0,
      pointIndex: 0,
      x: 5,
      y: 2,
      width: 2,
      height: 2,
      value: 42,
    };

    let capturedRegion: HitRegion | null = null;
    const hitMap = new HitMap<{ type: string }>();

    registerChartRegions([region], hitMap, (r) => {
      capturedRegion = r;
      return { type: 'clicked' as const };
    });

    expect(capturedRegion).not.toBeNull();
    expect(capturedRegion!.id).toBe('p0');
    expect(capturedRegion!.value).toBe(42);
  });

  it('hitMap.hitTest() returns the onClick message for registered regions', () => {
    const regions: HitRegion[] = [
      { id: 'p0', seriesIndex: 0, pointIndex: 0, x: 5, y: 2, width: 3, height: 3, value: 10 },
      { id: 'p1', seriesIndex: 0, pointIndex: 1, x: 10, y: 4, width: 3, height: 3, value: 20 },
    ];

    const hitMap = new HitMap<{ type: string; id: string }>();
    registerChartRegions(regions, hitMap, (r) => ({ type: 'clicked', id: r.id }));

    // Hit p0
    const hit0 = hitMap.hitTest(6, 3);
    expect(hit0).not.toBeNull();
    expect(hit0!.onClick).toEqual({ type: 'clicked', id: 'p0' });

    // Hit p1
    const hit1 = hitMap.hitTest(11, 5);
    expect(hit1).not.toBeNull();
    expect(hit1!.onClick).toEqual({ type: 'clicked', id: 'p1' });

    // Miss
    const miss = hitMap.hitTest(0, 0);
    expect(miss).toBeNull();
  });
});

// ── Overlays ────────────────────────────────────────────────────────────

describe('renderRangeSelection', () => {
  it('in range-selecting phase returns non-empty string', () => {
    const coordMap = makeCoordMap();
    const state = createChartGestureState(coordMap, defaultConfig);
    const { state: s1 } = chartGestureUpdate(state, press(5, 5), 1000);
    const { state: s2 } = chartGestureUpdate(s1, move(8, 5), 1100);
    expect(s2.phase).toBe('range-selecting');

    const overlay = renderRangeSelection(s2);
    expect(overlay.length).toBeGreaterThan(0);
  });

  it('in idle phase returns empty string', () => {
    const state = createChartGestureState(makeCoordMap(), defaultConfig);
    const overlay = renderRangeSelection(state);
    expect(overlay).toBe('');
  });
});

describe('renderPanIndicator', () => {
  it('in panning phase returns non-empty string', () => {
    const panConfig: ChartGestureConfig = {
      ...defaultConfig,
      rangeSelect: false,
      pan: true,
    };
    const state = createChartGestureState(makeCoordMap(), panConfig);
    const { state: s1 } = chartGestureUpdate(state, press(5, 5), 1000);
    const { state: s2 } = chartGestureUpdate(s1, move(8, 5), 1100);
    expect(s2.phase).toBe('panning');

    const overlay = renderPanIndicator(s2);
    expect(overlay.length).toBeGreaterThan(0);
  });

  it('in idle phase returns empty string', () => {
    const state = createChartGestureState(makeCoordMap(), defaultConfig);
    const overlay = renderPanIndicator(state);
    expect(overlay).toBe('');
  });
});
