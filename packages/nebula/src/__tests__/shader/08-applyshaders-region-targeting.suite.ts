// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { applyShaders, type CellShader, type RGB, type ShaderUniforms } from '../../shader.js';
import type { Cell, CellGrid, LayoutEntry, LayoutPlan, LayoutRect } from '../../vdom.js';

function makeGrid(width: number, height: number, fill?: Cell): CellGrid {
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

function makeTrivialPlan(width: number, height: number): LayoutPlan {
  const rect: LayoutRect = { x: 0, y: 0, width, height };
  const root: LayoutEntry = {
    id: 'root',
    node: { kind: 'empty' },
    rect,
    children: [],
  };
  return { root, index: new Map([['root', root]]), width, height, overlays: [] };
}

function makeUniforms(plan: LayoutPlan, overrides?: Partial<ShaderUniforms>): ShaderUniforms {
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

// ─── Region Targeting ───────────────────────────────────────────────────────

describe('applyShaders region targeting', () => {
  it('only applies shader to cells within the named region', () => {
    // 4x4 grid
    const grid = makeGrid(4, 4, { char: '.', style: { fg: '\x1b[38;2;100;100;100m' } });
    // Create a plan with a named region 'panel' covering (1,1)-(2,2) (2x2 area)
    const panelRect: LayoutRect = { x: 1, y: 1, width: 2, height: 2 };
    const panelEntry: LayoutEntry = {
      id: 'panel',
      node: { kind: 'empty' },
      rect: panelRect,
      children: [],
    };
    const rootEntry: LayoutEntry = {
      id: 'root',
      node: { kind: 'empty' },
      rect: { x: 0, y: 0, width: 4, height: 4 },
      children: [panelEntry],
    };
    const plan: LayoutPlan = {
      root: rootEntry,
      index: new Map([
        ['root', rootEntry],
        ['panel', panelEntry],
      ]),
      width: 4,
      height: 4,
      overlays: [],
    };
    const uniforms = makeUniforms(plan);

    const regionShader: CellShader = {
      name: 'region-tint',
      fn: () => ({ fg: [255, 0, 0] as RGB }),
      regions: ['panel'],
    };

    const result = applyShaders(grid, plan, [regionShader], uniforms);

    // Cells outside region should be unchanged
    expect(result.cells[0]![0]!.style.fg).toBe('\x1b[38;2;100;100;100m');
    expect(result.cells[0]![1]!.style.fg).toBe('\x1b[38;2;100;100;100m');
    expect(result.cells[3]![3]!.style.fg).toBe('\x1b[38;2;100;100;100m');

    // Cells inside region should be tinted
    expect(result.cells[1]![1]!.style.fg).toBe('\x1b[38;2;255;0;0m');
    expect(result.cells[1]![2]!.style.fg).toBe('\x1b[38;2;255;0;0m');
    expect(result.cells[2]![1]!.style.fg).toBe('\x1b[38;2;255;0;0m');
    expect(result.cells[2]![2]!.style.fg).toBe('\x1b[38;2;255;0;0m');
  });

  it('ignores region names not found in plan.index', () => {
    const grid = makeGrid(2, 2, { char: '.', style: { fg: '\x1b[38;2;50;50;50m' } });
    const plan = makeTrivialPlan(2, 2);
    const uniforms = makeUniforms(plan);

    const regionShader: CellShader = {
      name: 'missing-region',
      fn: () => ({ fg: [255, 0, 0] as RGB }),
      regions: ['nonexistent'],
    };

    const result = applyShaders(grid, plan, [regionShader], uniforms);
    // Nothing should change since the region doesn't exist
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        expect(result.cells[r]![c]!.style.fg).toBe('\x1b[38;2;50;50;50m');
      }
    }
  });
});
