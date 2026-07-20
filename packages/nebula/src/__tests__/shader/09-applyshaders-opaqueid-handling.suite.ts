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

// ─── opaqueId Handling ──────────────────────────────────────────────────────

describe('applyShaders opaqueId handling', () => {
  it('skips cells with opaqueId by default', () => {
    const grid = makeGrid(2, 1);
    grid.cells[0]![0] = { char: ' ', style: {}, opaqueId: 'img1' };
    grid.cells[0]![1] = { char: 'A', style: { fg: '\x1b[38;2;100;100;100m' } };
    const plan = makeTrivialPlan(2, 1);
    const uniforms = makeUniforms(plan);

    const shader: CellShader = {
      name: 'tint-all',
      fn: () => ({ fg: [255, 0, 0] as RGB }),
    };

    const result = applyShaders(grid, plan, [shader], uniforms);
    // Opaque cell should be unchanged
    expect(result.cells[0]![0]!.opaqueId).toBe('img1');
    // Non-opaque cell should be tinted
    expect(result.cells[0]![1]!.style.fg).toBe('\x1b[38;2;255;0;0m');
  });

  it('processes opaque cells when processOpaque is true', () => {
    const grid = makeGrid(1, 1);
    grid.cells[0]![0] = { char: ' ', style: { fg: '\x1b[38;2;50;50;50m' }, opaqueId: 'img1' };
    const plan = makeTrivialPlan(1, 1);
    const uniforms = makeUniforms(plan);

    const shader: CellShader = {
      name: 'process-opaque',
      fn: () => ({ fg: [255, 0, 0] as RGB }),
      processOpaque: true,
    };

    const result = applyShaders(grid, plan, [shader], uniforms);
    expect(result.cells[0]![0]!.style.fg).toBe('\x1b[38;2;255;0;0m');
  });
});
