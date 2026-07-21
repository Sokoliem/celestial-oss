import { describe, expect, it } from 'vitest';
import {
  cumulative,
  type DataPoint,
  type Dataset,
  fromLabeled,
  fromPairs,
  fromTimeSeries,
  fromValues,
  merge,
  movingAverage,
  normalize,
  percentChange,
  resample,
} from '../dataset.js';

// ── Helper ───────────────────────────────────────────────────────────────

/** Collect all points from a Dataset via its iterator. */
function collect(ds: Dataset): DataPoint[] {
  return [...ds];
}

// ── fromValues ───────────────────────────────────────────────────────────

describe('fromValues', () => {
  it('creates a dataset from number[]', () => {
    const ds = fromValues([10, 20, 30]);
    expect(ds.length).toBe(3);
    expect(ds.toValues()).toEqual([10, 20, 30]);
  });

  it('assigns sequential x indices starting at 0', () => {
    const ds = fromValues([5, 15, 25]);
    expect(ds.at(0)).toEqual({ x: 0, y: 5 });
    expect(ds.at(1)).toEqual({ x: 1, y: 15 });
    expect(ds.at(2)).toEqual({ x: 2, y: 25 });
  });

  it('respects custom id and name', () => {
    const ds = fromValues([1], { id: 'test-id', name: 'Test Name' });
    expect(ds.id).toBe('test-id');
    expect(ds.name).toBe('Test Name');
  });

  it('generates an id when none provided', () => {
    const ds = fromValues([1]);
    expect(ds.id).toBeTruthy();
  });

  it('handles empty array', () => {
    const ds = fromValues([]);
    expect(ds.length).toBe(0);
    expect(ds.toValues()).toEqual([]);
    expect(ds.toPairs()).toEqual([]);
    expect(ds.at(0)).toBeUndefined();
  });

  it('handles single-element array', () => {
    const ds = fromValues([42]);
    expect(ds.length).toBe(1);
    expect(ds.at(0)).toEqual({ x: 0, y: 42 });
    expect(ds.xRange).toEqual([0, 0]);
    expect(ds.yRange).toEqual([42, 42]);
  });
});

// ── fromPairs ────────────────────────────────────────────────────────────

describe('fromPairs', () => {
  it('creates a dataset from [x, y] pairs', () => {
    const ds = fromPairs([
      [0, 10],
      [5, 20],
      [10, 30],
    ]);
    expect(ds.length).toBe(3);
    expect(ds.at(0)).toEqual({ x: 0, y: 10 });
    expect(ds.at(2)).toEqual({ x: 10, y: 30 });
  });

  it('converts back to pairs', () => {
    const pairs: [number, number][] = [
      [1, 2],
      [3, 4],
      [5, 6],
    ];
    const ds = fromPairs(pairs);
    expect(ds.toPairs()).toEqual(pairs);
  });

  it('handles empty array', () => {
    const ds = fromPairs([]);
    expect(ds.length).toBe(0);
  });
});

// ── fromLabeled ──────────────────────────────────────────────────────────

describe('fromLabeled', () => {
  it('creates a dataset from labeled items', () => {
    const ds = fromLabeled([
      { label: 'A', value: 10 },
      { label: 'B', value: 20 },
      { label: 'C', value: 30 },
    ]);
    expect(ds.length).toBe(3);
  });

  it('stores labels on data points', () => {
    const ds = fromLabeled([
      { label: 'Alpha', value: 5 },
      { label: 'Beta', value: 15 },
    ]);
    const p0 = ds.at(0);
    const p1 = ds.at(1);
    expect(p0?.label).toBe('Alpha');
    expect(p0?.y).toBe(5);
    expect(p1?.label).toBe('Beta');
    expect(p1?.y).toBe(15);
  });

  it('assigns sequential x indices', () => {
    const ds = fromLabeled([
      { label: 'X', value: 100 },
      { label: 'Y', value: 200 },
    ]);
    expect(ds.at(0)?.x).toBe(0);
    expect(ds.at(1)?.x).toBe(1);
  });

  it('handles empty array', () => {
    const ds = fromLabeled([]);
    expect(ds.length).toBe(0);
  });
});

// ── fromTimeSeries ───────────────────────────────────────────────────────

describe('fromTimeSeries', () => {
  it('creates a dataset from timestamped data', () => {
    const t1 = Date.now();
    const t2 = t1 + 1000;
    const t3 = t1 + 2000;
    const ds = fromTimeSeries([
      { timestamp: t1, value: 10 },
      { timestamp: t2, value: 20 },
      { timestamp: t3, value: 30 },
    ]);
    expect(ds.length).toBe(3);
  });

  it('uses timestamp as x value', () => {
    const t1 = 1000;
    const t2 = 2000;
    const ds = fromTimeSeries([
      { timestamp: t1, value: 5 },
      { timestamp: t2, value: 15 },
    ]);
    expect(ds.at(0)?.x).toBe(t1);
    expect(ds.at(1)?.x).toBe(t2);
  });

  it('stores timestamp on data points', () => {
    const t = 1700000000000;
    const ds = fromTimeSeries([{ timestamp: t, value: 42 }]);
    expect(ds.at(0)?.timestamp).toBe(t);
  });

  it('handles empty array', () => {
    const ds = fromTimeSeries([]);
    expect(ds.length).toBe(0);
  });
});

// ── Dataset.at() ─────────────────────────────────────────────────────────

describe('Dataset.at()', () => {
  it('returns correct point by index', () => {
    const ds = fromValues([10, 20, 30, 40, 50]);
    expect(ds.at(0)?.y).toBe(10);
    expect(ds.at(4)?.y).toBe(50);
  });

  it('returns undefined for out-of-bounds index', () => {
    const ds = fromValues([1, 2, 3]);
    expect(ds.at(-1)).toBeUndefined();
    expect(ds.at(3)).toBeUndefined();
    expect(ds.at(100)).toBeUndefined();
  });
});

// ── Dataset[Symbol.iterator] ─────────────────────────────────────────────

describe('Dataset[Symbol.iterator]', () => {
  it('iterates all points in order', () => {
    const ds = fromValues([10, 20, 30]);
    const points = collect(ds);
    expect(points.length).toBe(3);
    expect(points[0]?.y).toBe(10);
    expect(points[1]?.y).toBe(20);
    expect(points[2]?.y).toBe(30);
  });

  it('works with empty dataset', () => {
    const ds = fromValues([]);
    const points = collect(ds);
    expect(points.length).toBe(0);
  });

  it('supports for-of', () => {
    const ds = fromValues([1, 2, 3]);
    const values: number[] = [];
    for (const point of ds) {
      values.push(point.y);
    }
    expect(values).toEqual([1, 2, 3]);
  });
});

// ── xRange / yRange ──────────────────────────────────────────────────────

describe('Dataset.xRange / yRange', () => {
  it('computes correct x-range', () => {
    const ds = fromPairs([
      [2, 10],
      [5, 20],
      [8, 30],
    ]);
    expect(ds.xRange).toEqual([2, 8]);
  });

  it('computes correct y-range', () => {
    const ds = fromValues([15, 3, 42, 7]);
    expect(ds.yRange).toEqual([3, 42]);
  });

  it('handles single point', () => {
    const ds = fromValues([99]);
    expect(ds.xRange).toEqual([0, 0]);
    expect(ds.yRange).toEqual([99, 99]);
  });

  it('returns [Infinity, -Infinity] for empty dataset', () => {
    const ds = fromValues([]);
    expect(ds.xRange).toEqual([Infinity, -Infinity]);
    expect(ds.yRange).toEqual([Infinity, -Infinity]);
  });
});

// ── toValues / toPairs ───────────────────────────────────────────────────

describe('Dataset.toValues() / toPairs()', () => {
  it('toValues returns y values', () => {
    const ds = fromPairs([
      [0, 10],
      [1, 20],
      [2, 30],
    ]);
    expect(ds.toValues()).toEqual([10, 20, 30]);
  });

  it('toPairs returns [x, y] tuples', () => {
    const ds = fromValues([5, 10, 15]);
    expect(ds.toPairs()).toEqual([
      [0, 5],
      [1, 10],
      [2, 15],
    ]);
  });

  it('both work on empty dataset', () => {
    const ds = fromValues([]);
    expect(ds.toValues()).toEqual([]);
    expect(ds.toPairs()).toEqual([]);
  });
});

// ── map / filter / slice ─────────────────────────────────────────────────

describe('Dataset.map()', () => {
  it('maps over points', () => {
    const ds = fromValues([1, 2, 3]);
    const doubled = ds.map((p) => ({ ...p, y: p.y * 2 }));
    expect(doubled.toValues()).toEqual([2, 4, 6]);
    expect(doubled.length).toBe(3);
  });

  it('returns a new dataset (immutable)', () => {
    const ds = fromValues([10, 20]);
    const mapped = ds.map((p) => ({ ...p, y: p.y + 1 }));
    expect(ds.toValues()).toEqual([10, 20]);
    expect(mapped.toValues()).toEqual([11, 21]);
  });

  it('preserves id and name', () => {
    const ds = fromValues([1], { id: 'orig', name: 'Original' });
    const mapped = ds.map((p) => p);
    expect(mapped.id).toBe('orig');
    expect(mapped.name).toBe('Original');
  });
});

describe('Dataset.filter()', () => {
  it('filters points', () => {
    const ds = fromValues([1, 2, 3, 4, 5]);
    const even = ds.filter((p) => p.y % 2 === 0);
    expect(even.toValues()).toEqual([2, 4]);
    expect(even.length).toBe(2);
  });

  it('returns empty dataset when nothing matches', () => {
    const ds = fromValues([1, 3, 5]);
    const filtered = ds.filter((p) => p.y > 100);
    expect(filtered.length).toBe(0);
  });
});

describe('Dataset.slice()', () => {
  it('slices with start and end', () => {
    const ds = fromValues([10, 20, 30, 40, 50]);
    const sliced = ds.slice(1, 4);
    expect(sliced.toValues()).toEqual([20, 30, 40]);
    expect(sliced.length).toBe(3);
  });

  it('slices from start only', () => {
    const ds = fromValues([10, 20, 30]);
    const sliced = ds.slice(1);
    expect(sliced.toValues()).toEqual([20, 30]);
  });

  it('slices with no args returns all', () => {
    const ds = fromValues([10, 20, 30]);
    const sliced = ds.slice();
    expect(sliced.toValues()).toEqual([10, 20, 30]);
  });
});

// ── normalize ────────────────────────────────────────────────────────────

describe('normalize', () => {
  it('scales y-values to [0, 1] range', () => {
    const ds = fromValues([10, 20, 30, 40, 50]);
    const normed = normalize(ds);
    const values = normed.toValues();
    expect(values[0]).toBeCloseTo(0);
    expect(values[2]).toBeCloseTo(0.5);
    expect(values[4]).toBeCloseTo(1);
  });

  it('handles constant values (all same)', () => {
    const ds = fromValues([5, 5, 5]);
    const normed = normalize(ds);
    // When all values are the same, result should be all 0
    expect(normed.toValues()).toEqual([0, 0, 0]);
  });

  it('handles empty dataset', () => {
    const ds = fromValues([]);
    const normed = normalize(ds);
    expect(normed.length).toBe(0);
  });

  it('handles single point', () => {
    const ds = fromValues([42]);
    const normed = normalize(ds);
    expect(normed.toValues()).toEqual([0]);
  });
});

// ── cumulative ───────────────────────────────────────────────────────────

describe('cumulative', () => {
  it('computes running sum', () => {
    const ds = fromValues([1, 2, 3, 4, 5]);
    const cum = cumulative(ds);
    expect(cum.toValues()).toEqual([1, 3, 6, 10, 15]);
  });

  it('handles negative values', () => {
    const ds = fromValues([10, -5, 3, -2]);
    const cum = cumulative(ds);
    expect(cum.toValues()).toEqual([10, 5, 8, 6]);
  });

  it('handles empty dataset', () => {
    const ds = fromValues([]);
    const cum = cumulative(ds);
    expect(cum.length).toBe(0);
  });

  it('handles single point', () => {
    const ds = fromValues([99]);
    const cum = cumulative(ds);
    expect(cum.toValues()).toEqual([99]);
  });
});

// ── movingAverage ────────────────────────────────────────────────────────

describe('movingAverage', () => {
  it('computes simple moving average', () => {
    const ds = fromValues([2, 4, 6, 8, 10]);
    const ma = movingAverage(ds, 3);
    // window 3:
    // [0] = avg(2) = 2  (partial window at start)
    // [1] = avg(2,4) = 3  (partial window)
    // [2] = avg(2,4,6) = 4
    // [3] = avg(4,6,8) = 6
    // [4] = avg(6,8,10) = 8
    const values = ma.toValues();
    expect(values[0]).toBeCloseTo(2);
    expect(values[1]).toBeCloseTo(3);
    expect(values[2]).toBeCloseTo(4);
    expect(values[3]).toBeCloseTo(6);
    expect(values[4]).toBeCloseTo(8);
  });

  it('window of 1 returns original values', () => {
    const ds = fromValues([5, 10, 15]);
    const ma = movingAverage(ds, 1);
    expect(ma.toValues()).toEqual([5, 10, 15]);
  });

  it('window equal to length returns cumulative average', () => {
    const ds = fromValues([2, 4, 6]);
    const ma = movingAverage(ds, 3);
    const values = ma.toValues();
    expect(values[0]).toBeCloseTo(2);
    expect(values[1]).toBeCloseTo(3);
    expect(values[2]).toBeCloseTo(4);
  });

  it('handles empty dataset', () => {
    const ds = fromValues([]);
    const ma = movingAverage(ds, 3);
    expect(ma.length).toBe(0);
  });
});

// ── percentChange ────────────────────────────────────────────────────────

describe('percentChange', () => {
  it('computes percent change between consecutive points', () => {
    const ds = fromValues([100, 110, 99, 120]);
    const pc = percentChange(ds);
    // Result has n-1 points
    expect(pc.length).toBe(3);
    const values = pc.toValues();
    expect(values[0]).toBeCloseTo(10); // (110-100)/100 * 100
    expect(values[1]).toBeCloseTo(-10); // (99-110)/110 * 100
    expect(values[2]).toBeCloseTo(21.212121, 4); // (120-99)/99 * 100
  });

  it('handles empty dataset', () => {
    const ds = fromValues([]);
    const pc = percentChange(ds);
    expect(pc.length).toBe(0);
  });

  it('handles single point (no change possible)', () => {
    const ds = fromValues([50]);
    const pc = percentChange(ds);
    expect(pc.length).toBe(0);
  });

  it('handles zero value (division by zero)', () => {
    const ds = fromValues([0, 10]);
    const pc = percentChange(ds);
    const values = pc.toValues();
    // 0 -> 10: division by zero, should produce Infinity or 0 gracefully
    expect(values[0]).toBe(0);
  });
});

// ── resample ─────────────────────────────────────────────────────────────

describe('resample', () => {
  it('downsamples using LTTB', () => {
    // Generate a dataset with 100 points
    const data = Array.from({ length: 100 }, (_, i) => i * 2);
    const ds = fromValues(data);
    const resampled = resample(ds, 20);
    expect(resampled.length).toBe(20);
  });

  it('preserves first and last points when downsampling', () => {
    const data = Array.from({ length: 50 }, (_, i) => i * 3);
    const ds = fromValues(data);
    const resampled = resample(ds, 10);
    // First point
    expect(resampled.at(0)?.y).toBe(0);
    // Last point
    expect(resampled.at(resampled.length - 1)?.y).toBe(49 * 3);
  });

  it('upsamples with linear interpolation', () => {
    const ds = fromValues([0, 10]);
    const resampled = resample(ds, 5);
    expect(resampled.length).toBe(5);
    // Should interpolate linearly between 0 and 10
    const values = resampled.toValues();
    expect(values[0]).toBeCloseTo(0);
    expect(values[4]).toBeCloseTo(10);
    // Middle point should be approximately 5
    expect(values[2]).toBeCloseTo(5);
  });

  it('returns same dataset when target equals current length', () => {
    const ds = fromValues([1, 2, 3]);
    const resampled = resample(ds, 3);
    expect(resampled.toValues()).toEqual([1, 2, 3]);
  });

  it('handles empty dataset', () => {
    const ds = fromValues([]);
    const resampled = resample(ds, 10);
    expect(resampled.length).toBe(0);
  });

  it('handles single point', () => {
    const ds = fromValues([42]);
    const resampled = resample(ds, 5);
    // Single point cannot meaningfully be resampled to more points
    expect(resampled.length).toBe(1);
  });

  it('handles target of 1', () => {
    const ds = fromValues([10, 20, 30]);
    const resampled = resample(ds, 1);
    expect(resampled.length).toBe(1);
  });

  it('handles target of 2', () => {
    const ds = fromValues([10, 20, 30, 40, 50]);
    const resampled = resample(ds, 2);
    expect(resampled.length).toBe(2);
    // Should be first and last
    expect(resampled.at(0)?.y).toBe(10);
    expect(resampled.at(1)?.y).toBe(50);
  });
});

// ── merge ────────────────────────────────────────────────────────────────

describe('merge', () => {
  it('combines multiple datasets', () => {
    const ds1 = fromValues([1, 2, 3], { id: 'a', name: 'A' });
    const ds2 = fromValues([4, 5, 6], { id: 'b', name: 'B' });
    const collection = merge(ds1, ds2);
    expect(collection.datasets.length).toBe(2);
    expect(collection.datasets[0]?.id).toBe('a');
    expect(collection.datasets[1]?.id).toBe('b');
  });

  it('computes combined x-range', () => {
    const ds1 = fromPairs([
      [0, 10],
      [5, 20],
    ]);
    const ds2 = fromPairs([
      [3, 5],
      [10, 15],
    ]);
    const collection = merge(ds1, ds2);
    expect(collection.xRange).toEqual([0, 10]);
  });

  it('computes combined y-range', () => {
    const ds1 = fromValues([10, 20]);
    const ds2 = fromValues([5, 30]);
    const collection = merge(ds1, ds2);
    expect(collection.yRange).toEqual([5, 30]);
  });

  it('handles single dataset', () => {
    const ds = fromValues([1, 2, 3]);
    const collection = merge(ds);
    expect(collection.datasets.length).toBe(1);
  });

  it('handles empty merge', () => {
    const collection = merge();
    expect(collection.datasets.length).toBe(0);
    expect(collection.xRange).toEqual([Infinity, -Infinity]);
    expect(collection.yRange).toEqual([Infinity, -Infinity]);
  });
});

describe('dataset numeric and ownership hardening', () => {
  it('normalizes the full finite number range without overflow', () => {
    const result = normalize(fromValues([-Number.MAX_VALUE, 0, Number.MAX_VALUE]));
    expect(result.toValues()).toEqual([0, 0.5, 1]);
  });

  it('keeps cumulative sums and moving averages finite', () => {
    expect(cumulative(fromValues([Number.MAX_VALUE, Number.MAX_VALUE])).toValues()).toEqual([Number.MAX_VALUE, Number.MAX_VALUE]);
    expect(
      movingAverage(fromValues([Number.MAX_VALUE, Number.MAX_VALUE]), 2)
        .toValues()
        .every(Number.isFinite),
    ).toBe(true);
  });

  it('does not expose mutable point references', () => {
    const ds = fromLabeled([{ label: 'A', value: 1 }]);
    const point = ds.at(0)! as { label?: string; y: number };
    point.y = 99;
    point.label = 'changed';
    expect(ds.at(0)).toEqual({ x: 0, y: 1, label: 'A' });
  });

  it('normalizes non-finite resample targets without looping', () => {
    expect(resample(fromValues([1, 2, 3]), Number.POSITIVE_INFINITY).length).toBe(0);
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('dataset with negative values', () => {
    const ds = fromValues([-10, -5, 0, 5, 10]);
    expect(ds.yRange).toEqual([-10, 10]);
    expect(ds.toValues()).toEqual([-10, -5, 0, 5, 10]);
  });

  it('dataset with very large values', () => {
    const ds = fromValues([1e15, 2e15, 3e15]);
    expect(ds.yRange).toEqual([1e15, 3e15]);
  });

  it('chaining transformations', () => {
    const ds = fromValues([10, 20, 30, 40, 50]);
    const result = normalize(ds.filter((p) => p.y >= 20));
    expect(result.length).toBe(4);
    expect(result.toValues()[0]).toBeCloseTo(0);
    expect(result.toValues()[3]).toBeCloseTo(1);
  });

  it('map preserves labels', () => {
    const ds = fromLabeled([
      { label: 'A', value: 10 },
      { label: 'B', value: 20 },
    ]);
    const mapped = ds.map((p) => ({ ...p, y: p.y * 2 }));
    expect(mapped.at(0)?.label).toBe('A');
    expect(mapped.at(0)?.y).toBe(20);
  });

  it('filter preserves timestamps', () => {
    const t1 = 1000;
    const t2 = 2000;
    const t3 = 3000;
    const ds = fromTimeSeries([
      { timestamp: t1, value: 5 },
      { timestamp: t2, value: 15 },
      { timestamp: t3, value: 25 },
    ]);
    const filtered = ds.filter((p) => p.y > 10);
    expect(filtered.length).toBe(2);
    expect(filtered.at(0)?.timestamp).toBe(t2);
    expect(filtered.at(1)?.timestamp).toBe(t3);
  });
});
