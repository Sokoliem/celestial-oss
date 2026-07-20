// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { createParseCache, type ShaderUniforms } from '../../shader.js';
import type { Cell, CellGrid, LayoutEntry, LayoutPlan, LayoutRect } from '../../vdom.js';

function _makeGrid(width: number, height: number, fill?: Cell): CellGrid {
  const defaultCell: Cell = fill ?? { char: ' ', style: {} };
  const cells: Cell[][] = [];
  for (let r = 0; r < height; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < width; c++) {
      row.push({ ...defaultCell, style: { ...defaultCell.style } });
    }
    cells.push(row);
  }
  return { cells, width, height };
}

function _makeTrivialPlan(width: number, height: number): LayoutPlan {
  const rect: LayoutRect = { x: 0, y: 0, width, height };
  const root: LayoutEntry = {
    id: 'root',
    node: { kind: 'empty' },
    rect,
    children: [],
  };
  return { root, index: new Map([['root', root]]), width, height, overlays: [] };
}

function _makeUniforms(plan: LayoutPlan, overrides?: Partial<ShaderUniforms>): ShaderUniforms {
  return {
    time: 0,
    tick: 0,
    cols: plan.width,
    rows: plan.height,
    plan,
    custom: {},
    ...overrides,
  };
}

// ─── Parse Cache ────────────────────────────────────────────────────────────

describe('createParseCache', () => {
  it('returns same result for same string', () => {
    const cache = createParseCache();
    const ansi = '\x1b[38;2;10;20;30m';
    const r1 = cache.get(ansi);
    const r2 = cache.get(ansi);
    expect(r1).toEqual([10, 20, 30]);
    expect(r1).toBe(r2); // Same reference (cached)
  });

  it('returns null for undefined on repeated calls', () => {
    const cache = createParseCache();
    expect(cache.get(undefined)).toBeNull();
    expect(cache.get(undefined)).toBeNull();
  });

  it('works correctly after clear()', () => {
    const cache = createParseCache();
    const ansi = '\x1b[38;2;1;2;3m';
    const before = cache.get(ansi);
    cache.clear();
    const after = cache.get(ansi);
    expect(before).toEqual([1, 2, 3]);
    expect(after).toEqual([1, 2, 3]);
    // After clear, it's a fresh parse — not necessarily the same reference
  });
});
