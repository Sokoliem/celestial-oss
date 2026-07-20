/**
 * Chart gesture recognition — range selection, panning, click, hover,
 * long-press, and scroll-zoom for interactive charts.
 *
 * This module provides a pure (Elm-compatible) state machine that
 * transforms raw mouse events into chart-specific gesture messages
 * with both terminal-cell and data-space coordinates.
 *
 * Nexus HitMap is imported directly from @celestial/nexus to avoid
 * structural duck-typing and keep types aligned across packages.
 */

import type { HitMap } from '@celestial/nexus';
import type { HitRegion } from './interactive.js';

// ── Mouse event (structural, matches Nebula's shape) ────────────────────

/** Structural mouse event matching Nebula's MouseEventData. */
export interface MouseEventData {
  type: 'press' | 'release' | 'move' | 'scroll-up' | 'scroll-down';
  button: 0 | 1 | 2 | 'none';
  x: number;
  y: number;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

// ── Coordinate Map ──────────────────────────────────────────────────────

/** Options for creating a chart coordinate map. */
export interface CoordinateMapOpts {
  /** Chart area left edge (terminal cells). */
  chartX: number;
  /** Chart area top edge (terminal cells). */
  chartY: number;
  /** Chart area width (terminal cells). */
  chartWidth: number;
  /** Chart area height (terminal cells). */
  chartHeight: number;
  /** Minimum X in data space. */
  dataMinX: number;
  /** Maximum X in data space. */
  dataMaxX: number;
  /** Minimum Y in data space. */
  dataMinY: number;
  /** Maximum Y in data space. */
  dataMaxY: number;
}

/** Bidirectional mapping between terminal cells and data coordinates. */
export interface ChartCoordinateMap {
  /** Convert terminal cell position to data coordinates (null if out of bounds). */
  cellToData(col: number, row: number): { x: number; y: number } | null;
  /** Convert data coordinates to terminal cell position. */
  dataToCell(dataX: number, dataY: number): { col: number; row: number };
  /** Chart bounds in terminal cells. */
  readonly chartX: number;
  readonly chartY: number;
  readonly chartWidth: number;
  readonly chartHeight: number;
  /** Data bounds. */
  readonly dataMinX: number;
  readonly dataMaxX: number;
  readonly dataMinY: number;
  readonly dataMaxY: number;
}

/**
 * Create a bidirectional mapping between terminal cells and data coordinates
 * using linear interpolation.
 */
export function createCoordinateMap(opts: CoordinateMapOpts): ChartCoordinateMap {
  const { chartX, chartY, chartWidth, chartHeight, dataMinX, dataMaxX, dataMinY, dataMaxY } = opts;
  const rawRangeX = dataMaxX - dataMinX;
  const rawRangeY = dataMaxY - dataMinY;
  const rangeX = rawRangeX || 1;
  const rangeY = rawRangeY || 1;
  const cellMaxCol = chartX + chartWidth - 1;
  const cellMaxRow = chartY + chartHeight - 1;
  const cellRangeX = cellMaxCol - chartX || 1;
  const cellRangeY = cellMaxRow - chartY || 1;

  function cellToData(col: number, row: number): { x: number; y: number } | null {
    if (col < chartX || col > cellMaxCol || row < chartY || row > cellMaxRow) {
      return null;
    }
    // When the data range is zero, all positions map to the single value
    const x = rawRangeX === 0 ? dataMinX : dataMinX + ((col - chartX) / cellRangeX) * rawRangeX;
    const y = rawRangeY === 0 ? dataMinY : dataMaxY - ((row - chartY) / cellRangeY) * rawRangeY;
    return { x, y };
  }

  function dataToCell(dataX: number, dataY: number): { col: number; row: number } {
    const tX = rawRangeX === 0 ? 0.5 : (dataX - dataMinX) / rangeX;
    const tY = rawRangeY === 0 ? 0.5 : (dataMaxY - dataY) / rangeY;
    return {
      col: chartX + tX * cellRangeX,
      row: chartY + tY * cellRangeY,
    };
  }

  return {
    cellToData,
    dataToCell,
    chartX,
    chartY,
    chartWidth,
    chartHeight,
    dataMinX,
    dataMaxX,
    dataMinY,
    dataMaxY,
  };
}

// ── Gesture Config ──────────────────────────────────────────────────────

/** Configuration for which chart gestures are enabled. */
export interface ChartGestureConfig {
  /** Enable range selection by drag (default: true). */
  rangeSelect: boolean;
  /** Enable pan by drag (default: false). Takes precedence if both are enabled: rangeSelect wins. */
  pan: boolean;
  /** Enable long-press detection (default: true). */
  longPress: boolean;
  /** Enable scroll-to-zoom (default: false). */
  scrollZoom: boolean;
  /** Minimum pixel distance before drag is recognized (default: 2). */
  dragThreshold: number;
  /** Duration in ms before long-press fires (default: 500). */
  longPressMs: number;
}

// ── Gesture Messages (discriminated union) ──────────────────────────────

export type ChartGestureMsg =
  | { type: 'chart:click'; col: number; row: number; dataX: number; dataY: number }
  | { type: 'chart:hover'; col: number; row: number; dataX: number; dataY: number }
  | { type: 'chart:long-press'; col: number; row: number; dataX: number; dataY: number }
  | {
      type: 'chart:range-selecting';
      startCol: number;
      startRow: number;
      endCol: number;
      endRow: number;
      startDataX: number;
      startDataY: number;
      endDataX: number;
      endDataY: number;
    }
  | {
      type: 'chart:range-selected';
      startCol: number;
      startRow: number;
      endCol: number;
      endRow: number;
      startDataX: number;
      startDataY: number;
      endDataX: number;
      endDataY: number;
    }
  | {
      type: 'chart:panning';
      col: number;
      row: number;
      deltaCol: number;
      deltaRow: number;
      deltaDataX: number;
      deltaDataY: number;
    }
  | { type: 'chart:pan-end'; col: number; row: number }
  | { type: 'chart:scroll-zoom'; col: number; row: number; dataX: number; dataY: number; direction: 'in' | 'out' };

// ── Gesture Phase & State ───────────────────────────────────────────────

export type ChartGesturePhase = 'idle' | 'pending' | 'range-selecting' | 'panning';

export interface ChartGestureState {
  readonly phase: ChartGesturePhase;
  readonly config: ChartGestureConfig;
  readonly coordMap: ChartCoordinateMap;
  /** Press origin (terminal cells). Set in pending phase. */
  readonly pressCol: number;
  readonly pressRow: number;
  /** Current position (terminal cells). Updated on move. */
  readonly currentCol: number;
  readonly currentRow: number;
  /** Timestamp of initial press. Used for long-press detection. */
  readonly pressTime: number;
  /** Previous move position for panning deltas. */
  readonly prevCol: number;
  readonly prevRow: number;
  /** Whether a long-press has already been fired for this pending phase. */
  readonly longPressFired: boolean;
}

/**
 * Create a fresh chart gesture state in idle phase.
 */
export function createChartGestureState(coordMap: ChartCoordinateMap, config: ChartGestureConfig): ChartGestureState {
  return {
    phase: 'idle',
    config,
    coordMap,
    pressCol: 0,
    pressRow: 0,
    currentCol: 0,
    currentRow: 0,
    pressTime: 0,
    prevCol: 0,
    prevRow: 0,
    longPressFired: false,
  };
}

// ── Pure state machine ──────────────────────────────────────────────────

/**
 * Pure state machine update. Takes the current state, a mouse event,
 * and an optional timestamp, and returns the new state plus any
 * generated gesture messages.
 *
 * No side effects, no timers — fully Elm-compatible.
 */
export function chartGestureUpdate(
  state: ChartGestureState,
  event: MouseEventData,
  now: number = Date.now(),
): { state: ChartGestureState; messages: ChartGestureMsg[] } {
  const { coordMap, config } = state;
  const col = event.x;
  const row = event.y;
  const messages: ChartGestureMsg[] = [];

  const inBounds = isInChartBounds(coordMap, col, row);

  switch (event.type) {
    case 'press': {
      if (!inBounds) {
        return { state, messages };
      }
      return {
        state: {
          ...state,
          phase: 'pending',
          pressCol: col,
          pressRow: row,
          currentCol: col,
          currentRow: row,
          pressTime: now,
          prevCol: col,
          prevRow: row,
          longPressFired: false,
        },
        messages,
      };
    }

    case 'release': {
      if (state.phase === 'pending') {
        // Release before drag threshold → click
        const data = coordMap.cellToData(col, row);
        if (data) {
          messages.push({
            type: 'chart:click',
            col,
            row,
            dataX: data.x,
            dataY: data.y,
          });
        }
        return {
          state: { ...state, phase: 'idle' },
          messages,
        };
      }

      if (state.phase === 'range-selecting') {
        const startData = coordMap.cellToData(state.pressCol, state.pressRow);
        const endData =
          coordMap.cellToData(col, row) ??
          coordMap.cellToData(
            clamp(col, coordMap.chartX, coordMap.chartX + coordMap.chartWidth - 1),
            clamp(row, coordMap.chartY, coordMap.chartY + coordMap.chartHeight - 1),
          );
        if (startData && endData) {
          messages.push({
            type: 'chart:range-selected',
            startCol: state.pressCol,
            startRow: state.pressRow,
            endCol: col,
            endRow: row,
            startDataX: startData.x,
            startDataY: startData.y,
            endDataX: endData.x,
            endDataY: endData.y,
          });
        }
        return {
          state: { ...state, phase: 'idle' },
          messages,
        };
      }

      if (state.phase === 'panning') {
        messages.push({
          type: 'chart:pan-end',
          col,
          row,
        });
        return {
          state: { ...state, phase: 'idle' },
          messages,
        };
      }

      return { state, messages };
    }

    case 'move': {
      // Always emit hover when inside chart bounds
      if (inBounds) {
        const hoverData = coordMap.cellToData(col, row);
        if (hoverData) {
          messages.push({
            type: 'chart:hover',
            col,
            row,
            dataX: hoverData.x,
            dataY: hoverData.y,
          });
        }
      }

      if (state.phase === 'pending') {
        const dx = Math.abs(col - state.pressCol);
        const dy = Math.abs(row - state.pressRow);
        const distance = Math.max(dx, dy);

        if (distance >= config.dragThreshold) {
          // Transition to drag mode based on config priority
          if (config.rangeSelect) {
            const startData = coordMap.cellToData(state.pressCol, state.pressRow);
            const endData = coordMap.cellToData(col, row);
            if (startData && endData) {
              messages.push({
                type: 'chart:range-selecting',
                startCol: state.pressCol,
                startRow: state.pressRow,
                endCol: col,
                endRow: row,
                startDataX: startData.x,
                startDataY: startData.y,
                endDataX: endData.x,
                endDataY: endData.y,
              });
            }
            return {
              state: {
                ...state,
                phase: 'range-selecting',
                currentCol: col,
                currentRow: row,
                prevCol: col,
                prevRow: row,
              },
              messages,
            };
          }

          if (config.pan) {
            const data = coordMap.cellToData(col, row);
            const prevData = coordMap.cellToData(state.prevCol, state.prevRow);
            if (data && prevData) {
              messages.push({
                type: 'chart:panning',
                col,
                row,
                deltaCol: col - state.prevCol,
                deltaRow: row - state.prevRow,
                deltaDataX: data.x - prevData.x,
                deltaDataY: data.y - prevData.y,
              });
            }
            return {
              state: {
                ...state,
                phase: 'panning',
                currentCol: col,
                currentRow: row,
                prevCol: col,
                prevRow: row,
              },
              messages,
            };
          }

          // Neither rangeSelect nor pan enabled — stay pending
        }

        return {
          state: {
            ...state,
            currentCol: col,
            currentRow: row,
          },
          messages,
        };
      }

      if (state.phase === 'range-selecting') {
        const startData = coordMap.cellToData(state.pressCol, state.pressRow);
        const endData = coordMap.cellToData(col, row);
        if (startData && endData) {
          messages.push({
            type: 'chart:range-selecting',
            startCol: state.pressCol,
            startRow: state.pressRow,
            endCol: col,
            endRow: row,
            startDataX: startData.x,
            startDataY: startData.y,
            endDataX: endData.x,
            endDataY: endData.y,
          });
        }
        return {
          state: {
            ...state,
            currentCol: col,
            currentRow: row,
          },
          messages,
        };
      }

      if (state.phase === 'panning') {
        const data = coordMap.cellToData(col, row);
        const prevData = coordMap.cellToData(state.prevCol, state.prevRow);
        if (data && prevData) {
          messages.push({
            type: 'chart:panning',
            col,
            row,
            deltaCol: col - state.prevCol,
            deltaRow: row - state.prevRow,
            deltaDataX: data.x - prevData.x,
            deltaDataY: data.y - prevData.y,
          });
        }
        return {
          state: {
            ...state,
            currentCol: col,
            currentRow: row,
            prevCol: col,
            prevRow: row,
          },
          messages,
        };
      }

      return { state, messages };
    }

    case 'scroll-up':
    case 'scroll-down': {
      if (!config.scrollZoom || !inBounds) {
        return { state, messages };
      }
      const data = coordMap.cellToData(col, row);
      if (data) {
        messages.push({
          type: 'chart:scroll-zoom',
          col,
          row,
          dataX: data.x,
          dataY: data.y,
          direction: event.type === 'scroll-up' ? 'in' : 'out',
        });
      }
      return { state, messages };
    }

    default:
      return { state, messages };
  }
}

// ── Long-press helper (called externally from a timer) ──────────────────

/**
 * Check if a long-press has occurred. Call this from a timer subscription
 * (e.g., every 100ms) to detect long-press gestures.
 *
 * Returns an object with a `message` (the chart:long-press message if the
 * threshold is exceeded and long-press is enabled, otherwise null) and
 * an updated `state` with `longPressFired` set to prevent re-firing.
 */
export function checkChartLongPress(state: ChartGestureState, now: number = Date.now()): { message: ChartGestureMsg | null; state: ChartGestureState } {
  if (!state.config.longPress) return { message: null, state };
  if (state.phase !== 'pending') return { message: null, state };
  if (state.longPressFired) return { message: null, state };

  const elapsed = now - state.pressTime;
  if (elapsed <= state.config.longPressMs) return { message: null, state };

  const data = state.coordMap.cellToData(state.pressCol, state.pressRow);
  if (!data) return { message: null, state };

  return {
    message: {
      type: 'chart:long-press',
      col: state.pressCol,
      row: state.pressRow,
      dataX: data.x,
      dataY: data.y,
    },
    state: { ...state, longPressFired: true },
  };
}

// ── Visual Overlays ─────────────────────────────────────────────────────

const BOX_H = '\u2500'; // ─
const BOX_V = '\u2502'; // │
const BOX_TL = '\u250C'; // ┌
const BOX_TR = '\u2510'; // ┐
const BOX_BL = '\u2514'; // └
const BOX_BR = '\u2518'; // ┘

/**
 * Render a visual overlay for range selection using box-drawing characters.
 * Returns an empty string if the state is not in range-selecting phase.
 */
export function renderRangeSelection(state: ChartGestureState): string {
  if (state.phase !== 'range-selecting') return '';

  const x1 = Math.min(state.pressCol, state.currentCol);
  const x2 = Math.max(state.pressCol, state.currentCol);
  const y1 = Math.min(state.pressRow, state.currentRow);
  const y2 = Math.max(state.pressRow, state.currentRow);

  const width = x2 - x1 + 1;
  const height = y2 - y1 + 1;

  if (width < 2 || height < 2) {
    // Too small for a box — just show a single marker
    return BOX_TL;
  }

  const lines: string[] = [];

  // Top edge
  lines.push(BOX_TL + BOX_H.repeat(width - 2) + BOX_TR);

  // Middle rows
  for (let r = 1; r < height - 1; r++) {
    lines.push(BOX_V + ' '.repeat(width - 2) + BOX_V);
  }

  // Bottom edge
  lines.push(BOX_BL + BOX_H.repeat(width - 2) + BOX_BR);

  return lines.join('\n');
}

/**
 * Render a visual indicator for panning mode.
 * Returns an empty string if the state is not in panning phase.
 */
export function renderPanIndicator(state: ChartGestureState): string {
  if (state.phase !== 'panning') return '';

  const dx = state.currentCol - state.pressCol;
  const dy = state.currentRow - state.pressRow;

  // Arrow direction indicator
  const arrows: string[] = [];
  if (dy < 0) arrows.push('\u2191'); // ↑
  if (dy > 0) arrows.push('\u2193'); // ↓
  if (dx < 0) arrows.push('\u2190'); // ←
  if (dx > 0) arrows.push('\u2192'); // →

  if (arrows.length === 0) arrows.push('\u00B7'); // middle dot (no movement yet)

  return `[PAN ${arrows.join('')} \u0394${Math.abs(dx)},${Math.abs(dy)}]`;
}

// ── Nexus Bridge (direct import from @celestial/nexus) ──────────────────

/**
 * Register all chart HitRegions into a Nexus HitMap.
 * The messageMapper converts a Stellar HitRegion into an application message
 * suitable for the Nexus HitMap's onClick handler.
 *
 * @param regions - Stellar chart hit regions.
 * @param hitMap - A Nexus HitMap instance.
 * @param messageMapper - Converts a HitRegion to your app's message type.
 */
export function registerChartRegions<M>(regions: HitRegion[], hitMap: HitMap<M>, messageMapper: (region: HitRegion) => M): void {
  for (const region of regions) {
    hitMap.register({
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      onClick: messageMapper(region),
      cursor: 'pointer',
    });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function isInChartBounds(coordMap: ChartCoordinateMap, col: number, row: number): boolean {
  return col >= coordMap.chartX && col < coordMap.chartX + coordMap.chartWidth && row >= coordMap.chartY && row < coordMap.chartY + coordMap.chartHeight;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
