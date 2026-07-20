import { describe, expect, it, vi } from 'vitest';
import { composeSelectors, createSelector } from '../selector.js';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createSelector', () => {
  it('computes on first call', () => {
    const compute = vi.fn((deps: number) => deps * 2);
    const selector = createSelector((model: { count: number }) => model.count, compute);

    const result = selector({ count: 5 });
    expect(result).toBe(10);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('returns cached result on same deps', () => {
    const compute = vi.fn((deps: number) => deps * 2);
    const selector = createSelector((model: { count: number }) => model.count, compute);

    const model = { count: 5 };
    const result1 = selector(model);
    const result2 = selector(model);

    expect(result1).toBe(10);
    expect(result2).toBe(10);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('recomputes when deps change', () => {
    const compute = vi.fn((deps: number) => deps * 2);
    const selector = createSelector((model: { count: number }) => model.count, compute);

    const result1 = selector({ count: 5 });
    const result2 = selector({ count: 10 });

    expect(result1).toBe(10);
    expect(result2).toBe(20);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('invalidate forces recomputation', () => {
    const compute = vi.fn((deps: number) => deps * 2);
    const selector = createSelector((model: { count: number }) => model.count, compute);

    const model = { count: 5 };
    selector(model);
    expect(compute).toHaveBeenCalledTimes(1);

    selector.invalidate();
    selector(model);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('custom isEqual function is used for comparison', () => {
    const compute = vi.fn((deps: { ids: number[] }) => deps.ids.join(','));

    // Custom equality: compare arrays by content
    const isEqual = (a: { ids: number[] }, b: { ids: number[] }) => a.ids.length === b.ids.length && a.ids.every((id, i) => id === b.ids[i]);

    const selector = createSelector((model: { items: number[] }) => ({ ids: model.items }), compute, isEqual);

    // Same content, different array references
    const result1 = selector({ items: [1, 2, 3] });
    const result2 = selector({ items: [1, 2, 3] });

    expect(result1).toBe('1,2,3');
    expect(result2).toBe('1,2,3');
    // Should only compute once because custom isEqual considers them equal
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('without custom isEqual, different references trigger recompute', () => {
    const compute = vi.fn((deps: number[]) => deps.join(','));
    const selector = createSelector((model: { items: number[] }) => model.items, compute);

    const result1 = selector({ items: [1, 2, 3] });
    const result2 = selector({ items: [1, 2, 3] }); // new array reference

    expect(result1).toBe('1,2,3');
    expect(result2).toBe('1,2,3');
    // Default Object.is sees different references, so recompute happens
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('works with complex multi-field deps', () => {
    interface Model {
      a: number;
      b: string;
    }
    const compute = vi.fn((deps: [number, string]) => `${deps[0]}-${deps[1]}`);
    const selector = createSelector((model: Model): [number, string] => [model.a, model.b], compute);

    // Tuple is a new array each time, so without custom isEqual it recomputes
    const result1 = selector({ a: 1, b: 'x' });
    const result2 = selector({ a: 1, b: 'x' });
    expect(result1).toBe('1-x');
    expect(result2).toBe('1-x');
    expect(compute).toHaveBeenCalledTimes(2); // new tuple references
  });
});

describe('composeSelectors', () => {
  it('chains two selectors', () => {
    const getCount = createSelector(
      (model: { count: number }) => model.count,
      (count) => count,
    );

    const doubled = composeSelectors(getCount, (count) => count * 2);

    const result = doubled({ count: 5 });
    expect(result).toBe(10);
  });

  it('composed selector has invalidate', () => {
    const compute = vi.fn((count: number) => count);
    const getCount = createSelector((model: { count: number }) => model.count, compute);

    const doubled = composeSelectors(getCount, (count) => count * 2);

    const model = { count: 5 };
    doubled(model);
    doubled(model);

    // getCount caches, so compute only called once
    expect(compute).toHaveBeenCalledTimes(1);

    doubled.invalidate();
    doubled(model);
    // After invalidate, getCount recomputes
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('composed selector recomputes when deps change', () => {
    const compute = vi.fn((count: number) => count);
    const getCount = createSelector((model: { count: number }) => model.count, compute);

    const doubled = composeSelectors(getCount, (count) => count * 2);

    expect(doubled({ count: 3 })).toBe(6);
    expect(doubled({ count: 7 })).toBe(14);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
