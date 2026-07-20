// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { cellToShaderCell, createParseCache, type ShaderUniforms } from '../../shader.js';
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

// ─── cellToShaderCell + applyShaderOutput roundtrip ─────────────────────────

describe('cellToShaderCell', () => {
  it('converts a truecolor Cell to ShaderCell', () => {
    const cell: Cell = {
      char: 'A',
      style: {
        fg: '\x1b[38;2;100;200;50m',
        bg: '\x1b[48;2;10;20;30m',
        bold: true,
        dim: false,
        italic: true,
        underline: false,
        strikethrough: false,
      },
    };
    const cache = createParseCache();
    const sc = cellToShaderCell(cell, cache);

    expect(sc.char).toBe('A');
    expect(sc.fg).toEqual([100, 200, 50]);
    expect(sc.bg).toEqual([10, 20, 30]);
    expect(sc.bold).toBe(true);
    expect(sc.italic).toBe(true);
    expect(sc.dim).toBe(false);
    expect(sc.underline).toBe(false);
    expect(sc.strikethrough).toBe(false);
  });

  it('converts a Cell with no colors to ShaderCell with null fg/bg', () => {
    const cell: Cell = { char: ' ', style: {} };
    const cache = createParseCache();
    const sc = cellToShaderCell(cell, cache);
    expect(sc.fg).toBeNull();
    expect(sc.bg).toBeNull();
  });
});
