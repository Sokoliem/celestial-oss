import { describe, expect, it } from 'vitest';
import { assertNodeCount, assertRenderWithinBudget } from '../budget-assertions.js';

describe('assertRenderWithinBudget', () => {
  it('passes when render is fast enough', () => {
    const result = assertRenderWithinBudget(() => {
      // trivial operation
      let x = 0;
      for (let i = 0; i < 100; i++) x += i;
      return x;
    }, 100); // generous 100ms budget

    expect(result.passed).toBe(true);
    expect(result.avgMs).toBeLessThan(100);
    expect(result.iterations).toBe(10);
    expect(result.budget).toBe(100);
  });

  it('returns correct structure with custom iterations', () => {
    const result = assertRenderWithinBudget(() => 'rendered', 50, { iterations: 5 });

    expect(result.iterations).toBe(5);
    expect(result.avgMs).toBeGreaterThanOrEqual(0);
    expect(result.maxMs).toBeGreaterThanOrEqual(result.avgMs);
  });

  it('clamps iterations to at least 1', () => {
    const result = assertRenderWithinBudget(() => 'ok', 100, { iterations: 0 });
    expect(result.iterations).toBe(1);
  });

  it('maxMs is >= avgMs', () => {
    const result = assertRenderWithinBudget(
      () => {
        return Math.random();
      },
      1000,
      { iterations: 20 },
    );

    expect(result.maxMs).toBeGreaterThanOrEqual(result.avgMs);
  });

  it('uses default of 10 iterations when not specified', () => {
    const result = assertRenderWithinBudget(() => null, 100);
    expect(result.iterations).toBe(10);
  });
});

describe('assertNodeCount', () => {
  it('passes when count is within limit', () => {
    const tree = {
      kind: 'row',
      children: [{ kind: 'text' }, { kind: 'text' }],
    };
    const result = assertNodeCount(tree, 10);

    expect(result.passed).toBe(true);
    expect(result.count).toBe(3); // root + 2 children
    expect(result.max).toBe(10);
  });

  it('fails when count exceeds limit', () => {
    const tree = {
      kind: 'row',
      children: [{ kind: 'text' }, { kind: 'text' }, { kind: 'text' }],
    };
    const result = assertNodeCount(tree, 2);

    expect(result.passed).toBe(false);
    expect(result.count).toBe(4);
    expect(result.max).toBe(2);
  });

  it('counts nested children recursively', () => {
    const tree = {
      kind: 'column',
      children: [
        {
          kind: 'row',
          children: [{ kind: 'text' }, { kind: 'text' }],
        },
        { kind: 'text' },
      ],
    };
    const result = assertNodeCount(tree, 100);

    // root(1) + row(1) + text(1) + text(1) + text(1) = 5
    expect(result.count).toBe(5);
  });

  it('counts single child via child property', () => {
    const tree = {
      kind: 'focus',
      child: {
        kind: 'text',
      },
    };
    const result = assertNodeCount(tree, 10);
    expect(result.count).toBe(2);
  });

  it('counts both children and child', () => {
    const tree = {
      kind: 'box',
      child: { kind: 'text' },
      children: [{ kind: 'text' }],
    };
    const result = assertNodeCount(tree, 10);
    // root(1) + child(1) + children[0](1) = 3
    expect(result.count).toBe(3);
  });

  it('handles null tree', () => {
    const result = assertNodeCount(null, 10);
    expect(result.passed).toBe(true);
    expect(result.count).toBe(0);
  });

  it('handles undefined tree', () => {
    const result = assertNodeCount(undefined, 10);
    expect(result.passed).toBe(true);
    expect(result.count).toBe(0);
  });

  it('handles a flat leaf node', () => {
    const result = assertNodeCount({ kind: 'text' }, 1);
    expect(result.passed).toBe(true);
    expect(result.count).toBe(1);
  });

  it('exact boundary: count equals max passes', () => {
    const tree = {
      kind: 'row',
      children: [{ kind: 'text' }],
    };
    const result = assertNodeCount(tree, 2);
    expect(result.passed).toBe(true);
    expect(result.count).toBe(2);
  });
});
