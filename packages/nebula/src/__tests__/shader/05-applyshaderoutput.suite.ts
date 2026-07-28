// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { applyShaderOutput, type ShaderOutput, type ShaderUniforms } from '../../shader.js';
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

describe('applyShaderOutput', () => {
  it('merges ShaderOutput fg change back into Cell', () => {
    const original: Cell = {
      char: 'X',
      style: {
        fg: '\x1b[38;2;100;100;100m',
        bg: '\x1b[48;2;50;50;50m',
        bold: true,
      },
    };
    const output: ShaderOutput = {
      fg: [255, 0, 0],
    };
    const result = applyShaderOutput(original, output);
    expect(result.style.fg).toBe('\x1b[38;2;255;0;0m');
    // Unchanged properties preserved
    expect(result.style.bg).toBe('\x1b[48;2;50;50;50m');
    expect(result.style.bold).toBe(true);
    expect(result.char).toBe('X');
  });

  it('can change char', () => {
    const original: Cell = { char: 'A', style: {} };
    const output: ShaderOutput = { char: 'B' };
    const result = applyShaderOutput(original, output);
    expect(result.char).toBe('B');
  });

  it('can set fg to null (clear color)', () => {
    const original: Cell = {
      char: ' ',
      style: { fg: '\x1b[38;2;255;0;0m' },
    };
    const output: ShaderOutput = { fg: null };
    const result = applyShaderOutput(original, output);
    expect(result.style.fg).toBeUndefined();
  });

  it('can set bg to null (clear color)', () => {
    const original: Cell = {
      char: ' ',
      style: { bg: '\x1b[48;2;0;255;0m' },
    };
    const output: ShaderOutput = { bg: null };
    const result = applyShaderOutput(original, output);
    expect(result.style.bg).toBeUndefined();
  });

  it('changes boolean style attrs', () => {
    const original: Cell = { char: ' ', style: { bold: false, italic: false } };
    const output: ShaderOutput = { bold: true, underline: true, blink: true, reverse: true, hidden: true };
    const result = applyShaderOutput(original, output);
    expect(result.style.bold).toBe(true);
    expect(result.style.italic).toBe(false);
    expect(result.style.underline).toBe(true);
    expect(result.style.blink).toBe(true);
    expect(result.style.reverse).toBe(true);
    expect(result.style.hidden).toBe(true);
  });
});
