// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { rgbToBgAnsi, type ShaderUniforms } from '../../shader.js';
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

describe('rgbToBgAnsi', () => {
  it('emits truecolor BG escape', () => {
    expect(rgbToBgAnsi([0, 255, 0])).toBe('\x1b[48;2;0;255;0m');
  });

  it('handles max values', () => {
    expect(rgbToBgAnsi([255, 255, 255])).toBe('\x1b[48;2;255;255;255m');
  });
});
