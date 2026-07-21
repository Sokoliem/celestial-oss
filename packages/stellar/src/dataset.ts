/**
 * dataset.ts — Unified data abstraction layer for all chart types.
 *
 * Provides a common Dataset interface that normalizes number[], [number,number][],
 * {label,value}[], and timestamped data into a single format. Includes
 * transformations (normalize, cumulative, moving average, percent change,
 * resampling) and lazy range computation.
 */

import { safeMax, safeMin } from './math-utils.js';
import { finiteNumber, interpolateRange, nonNegativeInteger, positiveInteger, rangeRatio } from './validation.js';

const MAX_RESAMPLED_POINTS = 1_000_000;

function saturatingAdd(left: number, right: number): number {
  const result = left + right;
  if (Number.isFinite(result)) return result;
  return Math.sign(left) === Math.sign(right) ? Math.sign(left || right) * Number.MAX_VALUE : 0;
}

// ── Core Types ───────────────────────────────────────────────────────────

/** A single data point with optional label and timestamp. */
export interface DataPoint {
  /** X value (index, category position, or time). */
  readonly x: number;
  /** Y value. For multi-series, each series has its own Dataset. */
  readonly y: number;
  /** Optional label for this point. */
  readonly label?: string;
  /** Optional timestamp (ms since epoch). */
  readonly timestamp?: number;
}

/** A typed dataset that wraps an array of data points with metadata. */
export interface Dataset {
  /** Unique identifier for this dataset. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Number of data points. */
  readonly length: number;
  /** Get a specific point by index. */
  at(index: number): DataPoint | undefined;
  /** Iterate all points. */
  [Symbol.iterator](): Iterator<DataPoint>;
  /** Get the x-range [min, max]. */
  readonly xRange: [number, number];
  /** Get the y-range [min, max]. */
  readonly yRange: [number, number];
  /** Convert to a plain number[] (y values only). */
  toValues(): number[];
  /** Convert to [x, y] pairs. */
  toPairs(): [number, number][];
  /** Map over points, returning a new Dataset. */
  map(fn: (point: DataPoint, index: number) => DataPoint): Dataset;
  /** Filter points, returning a new Dataset. */
  filter(fn: (point: DataPoint, index: number) => boolean): Dataset;
  /** Slice the dataset, returning a new Dataset. */
  slice(start?: number, end?: number): Dataset;
}

/** A collection of datasets with combined ranges. */
export interface DatasetCollection {
  readonly datasets: readonly Dataset[];
  readonly xRange: [number, number];
  readonly yRange: [number, number];
}

// ── Internal counter for auto-generated IDs ──────────────────────────────

let _nextId = 0;

function autoId(): string {
  return `ds-${++_nextId}`;
}

// ── Internal Dataset Implementation ──────────────────────────────────────

class DatasetImpl implements Dataset {
  readonly id: string;
  readonly name: string;

  private readonly _points: readonly DataPoint[];
  private _xRange: [number, number] | null = null;
  private _yRange: [number, number] | null = null;

  constructor(points: readonly DataPoint[], id: string, name: string) {
    this._points = points.map((point, index) => ({
      ...point,
      x: finiteNumber(point.x, index),
      y: finiteNumber(point.y, 0),
      timestamp: point.timestamp === undefined ? undefined : finiteNumber(point.timestamp, 0),
    }));
    this.id = id;
    this.name = name;
  }

  get length(): number {
    return this._points.length;
  }

  at(index: number): DataPoint | undefined {
    if (!Number.isInteger(index) || index < 0 || index >= this._points.length) return undefined;
    const point = this._points[index];
    return point ? { ...point } : undefined;
  }

  [Symbol.iterator](): Iterator<DataPoint> {
    let i = 0;
    const points = this._points;
    return {
      next(): IteratorResult<DataPoint> {
        if (i < points.length) {
          const value = { ...points[i]! };
          i++;
          return { value, done: false };
        }
        return { value: undefined, done: true };
      },
    };
  }

  get xRange(): [number, number] {
    if (this._xRange === null) {
      const xs = this._points.map((p) => p.x);
      this._xRange = [safeMin(xs), safeMax(xs)];
    }
    return [...this._xRange];
  }

  get yRange(): [number, number] {
    if (this._yRange === null) {
      const ys = this._points.map((p) => p.y);
      this._yRange = [safeMin(ys), safeMax(ys)];
    }
    return [...this._yRange];
  }

  toValues(): number[] {
    return this._points.map((p) => p.y);
  }

  toPairs(): [number, number][] {
    return this._points.map((p) => [p.x, p.y]);
  }

  map(fn: (point: DataPoint, index: number) => DataPoint): Dataset {
    const mapped = this._points.map((p, i) => fn({ ...p }, i));
    return new DatasetImpl(mapped, this.id, this.name);
  }

  filter(fn: (point: DataPoint, index: number) => boolean): Dataset {
    const filtered = this._points.filter((p, i) => fn({ ...p }, i));
    return new DatasetImpl(filtered, this.id, this.name);
  }

  slice(start?: number, end?: number): Dataset {
    const sliced = this._points.slice(start, end);
    return new DatasetImpl(sliced, this.id, this.name);
  }
}

// ── Factory Functions ────────────────────────────────────────────────────

interface DatasetOptions {
  id?: string;
  name?: string;
}

/** Create a Dataset from an array of y-values. */
export function fromValues(values: number[], opts?: DatasetOptions): Dataset {
  const points: DataPoint[] = values.map((y, i) => ({ x: i, y }));
  return new DatasetImpl(points, opts?.id ?? autoId(), opts?.name ?? '');
}

/** Create a Dataset from [x, y] pairs. */
export function fromPairs(pairs: [number, number][], opts?: DatasetOptions): Dataset {
  const points: DataPoint[] = pairs.map(([x, y]) => ({ x, y }));
  return new DatasetImpl(points, opts?.id ?? autoId(), opts?.name ?? '');
}

/** Create a Dataset from labeled values. */
export function fromLabeled(items: { label: string; value: number }[], opts?: DatasetOptions): Dataset {
  const points: DataPoint[] = items.map((item, i) => ({
    x: i,
    y: item.value,
    label: item.label,
  }));
  return new DatasetImpl(points, opts?.id ?? autoId(), opts?.name ?? '');
}

/** Create a Dataset from timestamped data. */
export function fromTimeSeries(entries: { timestamp: number; value: number }[], opts?: DatasetOptions): Dataset {
  const points: DataPoint[] = entries.map((entry) => ({
    x: entry.timestamp,
    y: entry.value,
    timestamp: entry.timestamp,
  }));
  return new DatasetImpl(points, opts?.id ?? autoId(), opts?.name ?? '');
}

// ── Transformations ──────────────────────────────────────────────────────

/** Normalize all y-values to [0, 1] range. */
export function normalize(ds: Dataset): Dataset {
  if (ds.length === 0) return ds;
  const [yMin, yMax] = ds.yRange;
  if (yMin === yMax) {
    return ds.map((p) => ({ ...p, y: 0 }));
  }
  return ds.map((p) => ({ ...p, y: rangeRatio(p.y, yMin, yMax) }));
}

/** Compute cumulative sum. */
export function cumulative(ds: Dataset): Dataset {
  if (ds.length === 0) return ds;
  let sum = 0;
  const points: DataPoint[] = [];
  for (const p of ds) {
    sum = saturatingAdd(sum, p.y);
    points.push({ ...p, y: sum });
  }
  return new DatasetImpl(points, ds.id, ds.name);
}

/** Compute a simple moving average with the given window size. */
export function movingAverage(ds: Dataset, window: number): Dataset {
  if (ds.length === 0) return ds;
  const windowSize = positiveInteger(window, 1);
  const points: DataPoint[] = [];
  const values: number[] = [];
  let mean = 0;

  for (const p of ds) {
    values.push(p.y);
    const actualWindow = Math.min(values.length, windowSize);
    if (actualWindow === 1) {
      mean = p.y;
    } else if (values.length <= windowSize) {
      mean = interpolateRange(mean, p.y, 1 / actualWindow);
    } else {
      const removed = values[values.length - windowSize - 1]!;
      mean = finiteNumber(mean - removed / windowSize + p.y / windowSize, mean);
    }
    points.push({ ...p, y: mean });
  }

  return new DatasetImpl(points, ds.id, ds.name);
}

/** Compute percent change between consecutive points. */
export function percentChange(ds: Dataset): Dataset {
  if (ds.length <= 1) return fromValues([], { id: ds.id, name: ds.name });
  const points: DataPoint[] = [];
  let prev: DataPoint | undefined;

  for (const p of ds) {
    if (prev !== undefined) {
      const rawRatio = prev.y === 0 ? 0 : p.y / prev.y - 1;
      const pct = Number.isFinite(rawRatio * 100) ? rawRatio * 100 : Math.sign(rawRatio) * Number.MAX_VALUE;
      points.push({ x: p.x, y: pct, label: p.label, timestamp: p.timestamp });
    }
    prev = p;
  }

  return new DatasetImpl(points, ds.id, ds.name);
}

/**
 * Resample the dataset to the target number of points.
 * Uses LTTB (Largest Triangle Three Buckets) when downsampling,
 * and linear interpolation when upsampling.
 */
export function resample(ds: Dataset, targetPoints: number): Dataset {
  if (ds.length === 0) return ds;
  const target = Math.min(MAX_RESAMPLED_POINTS, nonNegativeInteger(targetPoints, 0));
  if (target === 0) return fromValues([], { id: ds.id, name: ds.name });
  if (ds.length === 1 || target >= ds.length) {
    if (target <= ds.length) return ds;
    // Upsample via linear interpolation
    return upsample(ds, target);
  }
  if (target === 1) {
    const first = ds.at(0)!;
    return new DatasetImpl([first], ds.id, ds.name);
  }
  if (target >= ds.length) return ds;

  return lttbDownsample(ds, target);
}

/**
 * LTTB (Largest Triangle Three Buckets) downsampling algorithm.
 * Preserves the visual shape of the data while reducing point count.
 */
function lttbDownsample(ds: Dataset, target: number): Dataset {
  const n = ds.length;
  if (target >= n) return ds;
  if (target === 2) {
    return new DatasetImpl([ds.at(0)!, ds.at(n - 1)!], ds.id, ds.name);
  }

  const result: DataPoint[] = [];

  // Always include first point
  result.push(ds.at(0)!);

  const bucketSize = (n - 2) / (target - 2);
  const [xMin, xMax] = ds.xRange;
  const [yMin, yMax] = ds.yRange;
  const xScale = Math.max(1, Math.abs(xMin), Math.abs(xMax));
  const yScale = Math.max(1, Math.abs(yMin), Math.abs(yMax));

  let prevSelected = 0;

  for (let i = 0; i < target - 2; i++) {
    // Current bucket
    const bucketStart = Math.floor((i + 0) * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, n - 1);

    // Next bucket average (for the triangle area calculation)
    const nextBucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const nextBucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n - 1);

    let avgX = 0;
    let avgY = 0;
    let avgCount = 0;
    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      const p = ds.at(j)!;
      avgX += p.x / xScale;
      avgY += p.y / yScale;
      avgCount++;
    }
    if (avgCount > 0) {
      avgX /= avgCount;
      avgY /= avgCount;
    }

    // Find point in current bucket with largest triangle area
    const prevPoint = ds.at(prevSelected)!;
    let maxArea = -1;
    let bestIdx = bucketStart;

    for (let j = bucketStart; j < bucketEnd; j++) {
      const curr = ds.at(j)!;
      // Triangle area = 0.5 * |x1(y2-y3) + x2(y3-y1) + x3(y1-y2)|
      const prevX = prevPoint.x / xScale;
      const prevY = prevPoint.y / yScale;
      const currX = curr.x / xScale;
      const currY = curr.y / yScale;
      const area = Math.abs((prevX - avgX) * (currY - prevY) - (prevX - currX) * (avgY - prevY)) * 0.5;
      if (area > maxArea) {
        maxArea = area;
        bestIdx = j;
      }
    }

    result.push(ds.at(bestIdx)!);
    prevSelected = bestIdx;
  }

  // Always include last point
  result.push(ds.at(n - 1)!);

  return new DatasetImpl(result, ds.id, ds.name);
}

/** Upsample via linear interpolation between existing points. */
function upsample(ds: Dataset, target: number): Dataset {
  if (ds.length <= 1) return ds;

  const pairs = ds.toPairs();
  const result: DataPoint[] = [];
  const n = pairs.length;

  for (let i = 0; i < target; i++) {
    // Map index [0, target-1] to position in original [0, n-1]
    const t = (i / (target - 1)) * (n - 1);
    const lo = Math.floor(t);
    const hi = Math.min(lo + 1, n - 1);
    const frac = t - lo;

    const loPoint = pairs[lo]!;
    const hiPoint = pairs[hi]!;

    const x = interpolateRange(loPoint[0], hiPoint[0], frac);
    const y = interpolateRange(loPoint[1], hiPoint[1], frac);

    result.push({ x, y });
  }

  return new DatasetImpl(result, ds.id, ds.name);
}

// ── Merge ────────────────────────────────────────────────────────────────

/** Merge multiple datasets into a DatasetCollection with combined ranges. */
export function merge(...datasets: Dataset[]): DatasetCollection {
  if (datasets.length === 0) {
    return {
      datasets: [],
      xRange: [Infinity, -Infinity],
      yRange: [Infinity, -Infinity],
    };
  }

  const allXMins = datasets.map((ds) => ds.xRange[0]);
  const allXMaxs = datasets.map((ds) => ds.xRange[1]);
  const allYMins = datasets.map((ds) => ds.yRange[0]);
  const allYMaxs = datasets.map((ds) => ds.yRange[1]);

  return {
    datasets,
    xRange: [safeMin(allXMins), safeMax(allXMaxs)],
    yRange: [safeMin(allYMins), safeMax(allYMaxs)],
  };
}
