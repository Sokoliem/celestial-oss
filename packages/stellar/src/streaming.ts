/**
 * Real-time streaming chart support.
 *
 * Provides a `createStreamingChart` factory that manages a sliding
 * window of data points, appends new data incrementally, and
 * re-renders the chart on each update.
 */

import type { Color } from '@celestial/corona';
import type { CanvasMode } from './canvas.js';
import { type ChartResult, chart } from './chart.js';

// ── Types ────────────────────────────────────────────────────────────────

/** Chart type for streaming. */
export type StreamingChartType = 'line' | 'bar';

/** Configuration for a streaming chart. */
export interface StreamingChartOpts {
  /** Chart type (default: 'line'). */
  type?: StreamingChartType;
  /** Maximum number of visible data points (sliding window size). */
  maxPoints?: number;
  /** Canvas width in terminal columns (default: 60). */
  width?: number;
  /** Canvas height in terminal rows (default: 10). */
  height?: number;
  /** Line/bar color. */
  color?: Color;
  /** Canvas rendering mode. */
  mode?: CanvasMode;
  /** Fill area under line chart (default: true). */
  filled?: boolean;
  /** Minimum update interval in ms (throttle renders, default: 0). */
  minInterval?: number;
}

/** A streaming chart controller. */
export interface StreamingChart {
  /** Append one or more data points. */
  push(...values: number[]): void;
  /** Replace all data with the provided array. */
  setData(data: number[]): void;
  /** Get the current data window. */
  getData(): number[];
  /** Render the current state. */
  render(): ChartResult;
  /** Clear all data. */
  clear(): void;
  /** Get the total number of points received (including evicted). */
  readonly totalPoints: number;
  /** Get the current window size. */
  readonly windowSize: number;
  /** Register a callback that fires after each data update. */
  onUpdate(callback: StreamingUpdateCallback): void;
  /** Remove a previously registered callback. */
  offUpdate(callback: StreamingUpdateCallback): void;
}

/** Callback invoked when streaming data updates. */
export type StreamingUpdateCallback = (data: number[], chart: ChartResult) => void;

// ── Implementation ───────────────────────────────────────────────────────

/**
 * Create a streaming chart that manages a sliding window of data.
 *
 * Call `push()` to add new data points. The chart automatically
 * evicts old points when the window is full and re-renders on
 * each update.
 *
 * @param opts - Streaming chart configuration.
 * @returns A StreamingChart controller.
 */
export function createStreamingChart(opts: StreamingChartOpts = {}): StreamingChart {
  const maxPoints = opts.maxPoints ?? 100;
  const chartType = opts.type ?? 'line';
  const width = opts.width ?? 60;
  const height = opts.height ?? 10;
  const color = opts.color;
  const mode = opts.mode;
  const filled = opts.filled;
  const minInterval = opts.minInterval ?? 0;

  let data: number[] = [];
  let total = 0;
  let lastRenderTime = 0;
  const callbacks: Set<StreamingUpdateCallback> = new Set();

  function enforceWindow(): void {
    if (data.length > maxPoints) {
      data = data.slice(data.length - maxPoints);
    }
  }

  function renderChart(): ChartResult {
    if (chartType === 'bar') {
      return chart.bar({ data: [...data], width, height, color, mode });
    }
    return chart.line({ data: [...data], width, height, color, mode, filled });
  }

  function notifyCallbacks(): void {
    const now = Date.now();
    if (minInterval > 0 && now - lastRenderTime < minInterval) return;
    lastRenderTime = now;

    const result = renderChart();
    for (const cb of callbacks) {
      cb([...data], result);
    }
  }

  return {
    push(...values: number[]): void {
      data.push(...values);
      total += values.length;
      enforceWindow();
      notifyCallbacks();
    },

    setData(newData: number[]): void {
      data = [...newData];
      total = newData.length;
      enforceWindow();
      notifyCallbacks();
    },

    getData(): number[] {
      return [...data];
    },

    render(): ChartResult {
      return renderChart();
    },

    clear(): void {
      data = [];
      total = 0;
      notifyCallbacks();
    },

    get totalPoints(): number {
      return total;
    },

    get windowSize(): number {
      return data.length;
    },

    onUpdate(callback: StreamingUpdateCallback): void {
      callbacks.add(callback);
    },

    offUpdate(callback: StreamingUpdateCallback): void {
      callbacks.delete(callback);
    },
  };
}
