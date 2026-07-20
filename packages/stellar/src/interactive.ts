/**
 * Chart interactivity — tooltips, selection, crosshairs, and hitmap
 * integration for Nexus mouse support.
 *
 * This module provides a data-point hit-testing layer that sits on top
 * of any chart. It uses Nexus's HitMap (z-ordered linear scan) or
 * CellHitMap (O(1) grid lookup) for hit-testing instead of a hand-rolled
 * loop, eliminating duplication across packages.
 */

// ── Types ────────────────────────────────────────────────────────────────

import { HitMap } from '@celestial/nexus';
import { safeMax, safeMin } from './math-utils.js';

/** A rectangular hit region for a single data point. */
export interface HitRegion {
  /** Unique identifier for this data point. */
  id: string;
  /** Data series index. */
  seriesIndex: number;
  /** Data point index within the series. */
  pointIndex: number;
  /** Bounding box in terminal cell coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The raw data value(s) for tooltip display. */
  value: number | [number, number];
  /** Optional label. */
  label?: string;
}

/** Tooltip content for a data point. */
export interface TooltipData {
  /** The hit region that triggered the tooltip. */
  region: HitRegion;
  /** Formatted display text. */
  text: string;
  /** Position hint in terminal cells. */
  col: number;
  row: number;
}

/** Crosshair cursor state. */
export interface CrosshairState {
  /** Column position (terminal cells). */
  col: number;
  /** Row position (terminal cells). */
  row: number;
  /** Whether the crosshair is currently visible. */
  visible: boolean;
}

/** Selection state for click-to-select. */
export interface SelectionState {
  /** Currently selected region, or null. */
  selected: HitRegion | null;
}

/**
 * Hit-testing strategy.
 *
 * - `'hitmap'` — Nexus HitMap (reverse-order linear scan with z-ordering).
 *   Default. Best for small-to-medium region counts (<1000).
 * - `'cell'` — Pre-allocates a grid the size of the chart area for O(1)
 *   lookup. Better for very large region counts or when hitTest is called
 *   frequently (e.g., on every mouse-move). Uses more memory (W×H cells).
 */
export type HitTestStrategy = 'hitmap' | 'cell';

/** Configuration for an interactive chart layer. */
export interface InteractiveChartOpts {
  /** The chart area bounds in terminal cells. */
  chartX: number;
  chartY: number;
  chartWidth: number;
  chartHeight: number;
  /** All hit regions for the chart. */
  regions: HitRegion[];
  /** Tooltip formatter (default: shows value). */
  formatTooltip?: (region: HitRegion) => string;
  /** Optional coordinate map for data-space mapping (from chart-gestures). */
  coordMap?: { cellToData(col: number, row: number): { x: number; y: number } | null };
  /**
   * Hit-testing strategy (default: 'hitmap').
   * Use 'cell' for O(1) lookup when chartWidth × chartHeight is reasonable.
   */
  hitStrategy?: HitTestStrategy;
}

/** The interactive chart controller. */
export interface InteractiveChart {
  /** All hit regions (for Nexus hitmap integration). */
  readonly hitRegions: HitRegion[];
  /** The underlying Nexus HitMap, for direct integration with Nexus mouse events. */
  readonly nexusHitMap: HitMap<HitRegion>;
  /** Test if a terminal cell position hits a data point. */
  hitTest(col: number, row: number): HitRegion | null;
  /** Get tooltip data for a position (null if no hit). */
  getTooltip(col: number, row: number): TooltipData | null;
  /** Handle a click at the given position, updating selection. */
  handleClick(col: number, row: number): SelectionState;
  /** Update crosshair position. */
  updateCrosshair(col: number, row: number): CrosshairState;
  /** Get current selection state. */
  readonly selection: SelectionState;
  /** Get current crosshair state. */
  readonly crosshair: CrosshairState;
  /** Render a crosshair overlay line (horizontal + vertical guides). */
  renderCrosshair(): string;
  /** Convert terminal cell position to data coordinates (requires coordMap). */
  cellToData(col: number, row: number): { x: number; y: number } | null;
}

// ── Internal: build a Nexus HitMap from stellar HitRegions ───────────────

/**
 * Build a Nexus HitMap<HitRegion> from an array of stellar HitRegions.
 * Each region is registered with the HitRegion itself as the onClick message,
 * giving us the data back on hit-test.
 */
function buildNexusHitMap(regions: HitRegion[]): HitMap<HitRegion> {
  const map = new HitMap<HitRegion>();
  for (const region of regions) {
    map.register({
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      onClick: region,
      cursor: 'pointer',
    });
  }
  return map;
}

/**
 * Build a cell grid (O(1) lookup) from an array of stellar HitRegions.
 * The grid covers [chartX..chartX+chartWidth-1] × [chartY..chartY+chartHeight-1].
 * Last registered region wins at any cell (z-order: last on top), matching
 * Nexus CellHitMap behavior.
 */
function buildCellGrid(regions: HitRegion[], chartX: number, chartY: number, chartWidth: number, chartHeight: number): (HitRegion | null)[][] {
  // grid[row][col] — row and col relative to chart origin
  const grid: (HitRegion | null)[][] = [];
  for (let r = 0; r < chartHeight; r++) {
    grid.push(new Array(chartWidth).fill(null) as (HitRegion | null)[]);
  }
  for (const region of regions) {
    const xStart = Math.max(0, region.x - chartX);
    const yStart = Math.max(0, region.y - chartY);
    const xEnd = Math.min(chartWidth, region.x + region.width - chartX);
    const yEnd = Math.min(chartHeight, region.y + region.height - chartY);
    for (let r = yStart; r < yEnd; r++) {
      for (let c = xStart; c < xEnd; c++) {
        grid[r]![c] = region;
      }
    }
  }
  return grid;
}

// ── Implementation ───────────────────────────────────────────────────────

/**
 * Create an interactive chart layer over existing chart output.
 *
 * This provides hit-testing, tooltips, click-selection, and crosshair
 * cursor tracking. Hit-testing is delegated to Nexus's `HitMap` (default)
 * or an O(1) cell grid when `hitStrategy: 'cell'` is set.
 *
 * The `nexusHitMap` property exposes the underlying Nexus HitMap for
 * direct integration with Nexus mouse event dispatch.
 *
 * @param opts - Interactive chart configuration.
 * @returns An InteractiveChart controller.
 */
export function createInteractiveChart(opts: InteractiveChartOpts): InteractiveChart {
  const { chartX, chartY, chartWidth, chartHeight, regions } = opts;
  const formatTooltip = opts.formatTooltip ?? defaultTooltipFormat;
  const strategy = opts.hitStrategy ?? 'hitmap';

  // Build the Nexus HitMap (always — exposed on the controller for Nexus integration)
  const nexusMap = buildNexusHitMap(regions);

  // Build cell grid only when 'cell' strategy is selected
  const cellGrid = strategy === 'cell' ? buildCellGrid(regions, chartX, chartY, chartWidth, chartHeight) : null;

  let selectionState: SelectionState = { selected: null };
  let crosshairState: CrosshairState = { col: 0, row: 0, visible: false };

  function hitTest(col: number, row: number): HitRegion | null {
    if (cellGrid) {
      // O(1) cell grid lookup
      const relCol = col - chartX;
      const relRow = row - chartY;
      if (relCol < 0 || relCol >= chartWidth || relRow < 0 || relRow >= chartHeight) {
        return null;
      }
      return cellGrid[relRow]![relCol] ?? null;
    }
    // Delegate to Nexus HitMap (z-ordered reverse scan)
    const nexusHit = nexusMap.hitTest(col, row);
    return nexusHit?.onClick ?? null;
  }

  function getTooltip(col: number, row: number): TooltipData | null {
    const region = hitTest(col, row);
    if (!region) return null;
    return {
      region,
      text: formatTooltip(region),
      col: region.x + region.width,
      row: region.y,
    };
  }

  function handleClick(col: number, row: number): SelectionState {
    const region = hitTest(col, row);
    if (region) {
      // Toggle selection
      if (selectionState.selected?.id === region.id) {
        selectionState = { selected: null };
      } else {
        selectionState = { selected: region };
      }
    } else {
      selectionState = { selected: null };
    }
    return selectionState;
  }

  function updateCrosshair(col: number, row: number): CrosshairState {
    const inBounds = col >= chartX && col < chartX + chartWidth && row >= chartY && row < chartY + chartHeight;

    crosshairState = { col, row, visible: inBounds };
    return crosshairState;
  }

  function renderCrosshair(): string {
    if (!crosshairState.visible) return '';

    const H_LINE = '\u2500';
    const V_LINE = '\u2502';
    const CROSS = '\u253C';

    const lines: string[] = [];
    for (let r = chartY; r < chartY + chartHeight; r++) {
      let line = '';
      for (let cCol = chartX; cCol < chartX + chartWidth; cCol++) {
        if (r === crosshairState.row && cCol === crosshairState.col) {
          line += CROSS;
        } else if (r === crosshairState.row) {
          line += H_LINE;
        } else if (cCol === crosshairState.col) {
          line += V_LINE;
        } else {
          line += ' ';
        }
      }
      lines.push(line);
    }
    return lines.join('\n');
  }

  function cellToData(col: number, row: number): { x: number; y: number } | null {
    if (!opts.coordMap) return null;
    return opts.coordMap.cellToData(col, row);
  }

  return {
    get hitRegions() {
      return regions;
    },
    get nexusHitMap() {
      return nexusMap;
    },
    hitTest,
    getTooltip,
    handleClick,
    updateCrosshair,
    get selection() {
      return selectionState;
    },
    get crosshair() {
      return crosshairState;
    },
    renderCrosshair,
    cellToData,
  };
}

// ── Hit Region Builders ──────────────────────────────────────────────────

/**
 * Build hit regions for a line or scatter chart from data points.
 *
 * @param data - Array of [x, y] values in data space.
 * @param chartX - Chart area left edge (terminal cells).
 * @param chartY - Chart area top edge (terminal cells).
 * @param chartWidth - Chart area width (terminal cells).
 * @param chartHeight - Chart area height (terminal cells).
 * @param dataMinX - Minimum X in data space.
 * @param dataMaxX - Maximum X in data space.
 * @param dataMinY - Minimum Y in data space.
 * @param dataMaxY - Maximum Y in data space.
 * @param seriesIndex - Series index (default: 0).
 * @returns Array of hit regions.
 */
export function buildPointHitRegions(
  data: [number, number][],
  chartX: number,
  chartY: number,
  chartWidth: number,
  chartHeight: number,
  dataMinX: number,
  dataMaxX: number,
  dataMinY: number,
  dataMaxY: number,
  seriesIndex: number = 0,
): HitRegion[] {
  const rangeX = dataMaxX - dataMinX || 1;
  const rangeY = dataMaxY - dataMinY || 1;
  const hitSize = Math.max(1, Math.floor(Math.min(chartWidth, chartHeight) / data.length));

  return data.map(([x, y], i) => {
    const col = chartX + Math.round(((x - dataMinX) / rangeX) * (chartWidth - 1));
    const row = chartY + chartHeight - 1 - Math.round(((y - dataMinY) / rangeY) * (chartHeight - 1));
    const regionX = Math.max(chartX, col - Math.floor(hitSize / 2));
    const regionY = Math.max(chartY, row - Math.floor(hitSize / 2));
    return {
      id: `s${seriesIndex}-p${i}`,
      seriesIndex,
      pointIndex: i,
      x: regionX,
      y: regionY,
      width: Math.min(hitSize, chartX + chartWidth - regionX),
      height: Math.min(hitSize, chartY + chartHeight - regionY),
      value: [x, y] as [number, number],
    };
  });
}

/**
 * Build hit regions for a bar chart.
 *
 * @param values - Bar values.
 * @param chartX - Chart area left edge (terminal cells).
 * @param chartY - Chart area top edge (terminal cells).
 * @param chartWidth - Chart area width (terminal cells).
 * @param chartHeight - Chart area height (terminal cells).
 * @param labels - Optional bar labels.
 * @returns Array of hit regions.
 */
export function buildBarHitRegions(values: number[], chartX: number, chartY: number, chartWidth: number, chartHeight: number, labels?: string[]): HitRegion[] {
  const maxVal = safeMax(values.map(Math.abs));
  // No bars visible when all values are zero
  if (maxVal === 0) return [];

  const barWidth = Math.max(1, Math.floor(chartWidth / values.length));

  // Compute zero line for mixed positive/negative values
  const minVal = safeMin([...values, 0]);
  const maxPositive = safeMax([...values, 0]);
  const range = maxPositive - minVal || 1;
  const zeroY = chartY + Math.round(((maxPositive - 0) / range) * (chartHeight - 1));

  const regions: HitRegion[] = [];

  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v === 0) {
      // Zero-valued bars have no visual representation, no hit region
      continue;
    }

    let barHeight: number;
    let y: number;

    if (v >= 0) {
      // Positive bar: extends upward from zero line
      barHeight = Math.max(1, Math.round((v / range) * (chartHeight - 1)));
      y = zeroY - barHeight;
    } else {
      // Negative bar: extends downward from zero line
      barHeight = Math.max(1, Math.round((Math.abs(v) / range) * (chartHeight - 1)));
      y = zeroY;
    }

    const clampedY = Math.max(chartY, y);
    regions.push({
      id: `bar-${i}`,
      seriesIndex: 0,
      pointIndex: i,
      x: chartX + i * barWidth,
      y: clampedY,
      width: barWidth,
      height: Math.min(barHeight, chartY + chartHeight - clampedY),
      value: v,
      label: labels?.[i],
    });
  }

  return regions;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function defaultTooltipFormat(region: HitRegion): string {
  const label = region.label ? `${region.label}: ` : '';
  if (Array.isArray(region.value)) {
    return `${label}(${region.value[0]}, ${region.value[1]})`;
  }
  return `${label}${region.value}`;
}
