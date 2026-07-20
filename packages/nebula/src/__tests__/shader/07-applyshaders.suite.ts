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

// ─── applyShaders Composition ───────────────────────────────────────────────

describe('applyShaders', () => {
  it('returns grid unchanged with empty shader list', () => {
    const grid = makeGrid(3, 3, { char: 'A', style: { fg: '\x1b[38;2;100;100;100m' } });
    const plan = makeTrivialPlan(3, 3);
    const uniforms = makeUniforms(plan);
    const result = applyShaders(grid, plan, [], uniforms);

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        expect(result.cells[r]![c]!.char).toBe('A');
        expect(result.cells[r]![c]!.style.fg).toBe('\x1b[38;2;100;100;100m');
      }
    }
  });

  it('returns grid unchanged when shader returns null for all cells', () => {
    const grid = makeGrid(2, 2, { char: 'Z', style: {} });
    const plan = makeTrivialPlan(2, 2);
    const uniforms = makeUniforms(plan);
    const nullShader: CellShader = {
      name: 'noop',
      fn: () => null,
    };
    const result = applyShaders(grid, plan, [nullShader], uniforms);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        expect(result.cells[r]![c]!.char).toBe('Z');
      }
    }
  });

  it('applies a single shader that inverts colors', () => {
    const fg = '\x1b[38;2;200;100;50m';
    const bg = '\x1b[48;2;10;20;30m';
    const grid = makeGrid(2, 2, { char: '#', style: { fg, bg } });
    const plan = makeTrivialPlan(2, 2);
    const uniforms = makeUniforms(plan);

    const invertShader: CellShader = {
      name: 'invert',
      fn: (_x, _y, cell) => ({
        fg: cell.fg ? ([255 - cell.fg[0], 255 - cell.fg[1], 255 - cell.fg[2]] as RGB) : null,
        bg: cell.bg ? ([255 - cell.bg[0], 255 - cell.bg[1], 255 - cell.bg[2]] as RGB) : null,
      }),
    };

    const result = applyShaders(grid, plan, [invertShader], uniforms);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        expect(result.cells[r]![c]!.style.fg).toBe('\x1b[38;2;55;155;205m');
        expect(result.cells[r]![c]!.style.bg).toBe('\x1b[48;2;245;235;225m');
      }
    }
  });

  it('composes two shaders in order (left to right)', () => {
    // Start with fg [100, 100, 100]
    const grid = makeGrid(1, 1, { char: 'X', style: { fg: '\x1b[38;2;100;100;100m' } });
    const plan = makeTrivialPlan(1, 1);
    const uniforms = makeUniforms(plan);

    // Shader 1: set fg to [200, 0, 0]
    const tintShader: CellShader = {
      name: 'tint',
      fn: () => ({ fg: [200, 0, 0] as RGB }),
    };

    // Shader 2: invert fg
    const invertShader: CellShader = {
      name: 'invert',
      fn: (_x, _y, cell) => ({
        fg: cell.fg ? ([255 - cell.fg[0], 255 - cell.fg[1], 255 - cell.fg[2]] as RGB) : null,
      }),
    };

    // Applied in order: tint then invert → [55, 255, 255]
    const result = applyShaders(grid, plan, [tintShader, invertShader], uniforms);
    expect(result.cells[0]![0]!.style.fg).toBe('\x1b[38;2;55;255;255m');

    // Reversed order: invert(100,100,100)=[155,155,155], then tint overrides to [200,0,0]
    const result2 = applyShaders(grid, plan, [invertShader, tintShader], uniforms);
    expect(result2.cells[0]![0]!.style.fg).toBe('\x1b[38;2;200;0;0m');
  });

  it('skips shaders with enabled === false', () => {
    const grid = makeGrid(1, 1, { char: 'A', style: { fg: '\x1b[38;2;10;20;30m' } });
    const plan = makeTrivialPlan(1, 1);
    const uniforms = makeUniforms(plan);

    const disabledShader: CellShader = {
      name: 'disabled',
      fn: () => ({ fg: [255, 0, 0] as RGB }),
      enabled: false,
    };

    const result = applyShaders(grid, plan, [disabledShader], uniforms);
    expect(result.cells[0]![0]!.style.fg).toBe('\x1b[38;2;10;20;30m');
  });

  it('does not mutate the input grid', () => {
    const grid = makeGrid(1, 1, { char: 'A', style: { fg: '\x1b[38;2;10;20;30m' } });
    const plan = makeTrivialPlan(1, 1);
    const uniforms = makeUniforms(plan);

    const shader: CellShader = {
      name: 'change',
      fn: () => ({ char: 'B', fg: [255, 255, 255] as RGB }),
    };

    applyShaders(grid, plan, [shader], uniforms);
    // Original grid should be unchanged
    expect(grid.cells[0]![0]!.char).toBe('A');
    expect(grid.cells[0]![0]!.style.fg).toBe('\x1b[38;2;10;20;30m');
  });

  it('preserves rawBlobs from input grid', () => {
    const grid = makeGrid(2, 2);
    grid.rawBlobs = new Map([['blob1', { content: 'raw', row: 0, col: 0, width: 1, height: 1 }]]);
    const plan = makeTrivialPlan(2, 2);
    const uniforms = makeUniforms(plan);

    const result = applyShaders(grid, plan, [], uniforms);
    expect(result.rawBlobs).toBeDefined();
    expect(result.rawBlobs!.get('blob1')).toEqual({ content: 'raw', row: 0, col: 0, width: 1, height: 1 });
  });
});
