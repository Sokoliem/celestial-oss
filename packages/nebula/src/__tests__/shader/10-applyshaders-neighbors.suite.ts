// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { applyShaders, type CellShader, type RGB, type ShaderCell, type ShaderUniforms } from '../../shader.js';
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

// ─── Neighbors ──────────────────────────────────────────────────────────────

describe('applyShaders neighbors', () => {
  it('provides access to neighbor cells', () => {
    // 3x3 grid with known fg values
    const grid = makeGrid(3, 3);
    // Set center cell
    grid.cells[1]![1] = { char: 'C', style: { fg: '\x1b[38;2;100;100;100m' } };
    // Set all cells to known values
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        grid.cells[r]![c] = {
          char: String.fromCharCode(65 + r * 3 + c), // A-I
          style: { fg: `\x1b[38;2;${r * 100};${c * 100};0m` },
        };
      }
    }
    const plan = makeTrivialPlan(3, 3);
    const uniforms = makeUniforms(plan);

    const neighborValues: Array<{ x: number; y: number; neighbors: Array<ShaderCell | null> }> = [];

    const neighborReadShader: CellShader = {
      name: 'neighbor-reader',
      fn: (x, y, _cell, _u, neighbors) => {
        if (x === 1 && y === 1) {
          // Read all 8 neighbors of center cell
          neighborValues.push({
            x,
            y,
            neighbors: [
              neighbors(-1, -1),
              neighbors(0, -1),
              neighbors(1, -1),
              neighbors(-1, 0),
              neighbors(1, 0),
              neighbors(-1, 1),
              neighbors(0, 1),
              neighbors(1, 1),
            ],
          });
        }
        return null;
      },
    };

    applyShaders(grid, plan, [neighborReadShader], uniforms);

    expect(neighborValues).toHaveLength(1);
    const nv = neighborValues[0]!;
    // All 8 neighbors of center should be non-null
    for (const n of nv.neighbors) {
      expect(n).not.toBeNull();
    }
    // Top-left neighbor (0,0) should have fg [0,0,0]
    expect(nv.neighbors[0]!.fg).toEqual([0, 0, 0]);
    // Top neighbor (1,0) should have fg [0,100,0]
    expect(nv.neighbors[1]!.fg).toEqual([0, 100, 0]);
    // Right neighbor (2,1) should have fg [100,200,0]
    expect(nv.neighbors[4]!.fg).toEqual([100, 200, 0]);
  });

  it('returns null for neighbors outside grid bounds', () => {
    const grid = makeGrid(2, 2, { char: 'A', style: { fg: '\x1b[38;2;50;50;50m' } });
    const plan = makeTrivialPlan(2, 2);
    const uniforms = makeUniforms(plan);

    let topLeftNeighbors: Array<ShaderCell | null> = [];

    const edgeShader: CellShader = {
      name: 'edge-test',
      fn: (x, y, _cell, _u, neighbors) => {
        if (x === 0 && y === 0) {
          topLeftNeighbors = [
            neighbors(-1, -1), // out of bounds
            neighbors(0, -1), // out of bounds
            neighbors(-1, 0), // out of bounds
            neighbors(1, 0), // in bounds
            neighbors(0, 1), // in bounds
          ];
        }
        return null;
      },
    };

    applyShaders(grid, plan, [edgeShader], uniforms);

    expect(topLeftNeighbors[0]).toBeNull(); // top-left
    expect(topLeftNeighbors[1]).toBeNull(); // top
    expect(topLeftNeighbors[2]).toBeNull(); // left
    expect(topLeftNeighbors[3]).not.toBeNull(); // right
    expect(topLeftNeighbors[4]).not.toBeNull(); // bottom
  });

  it('shader that averages with neighbors produces correct result', () => {
    // 3x1 grid: [100, 0, 0] | [0, 100, 0] | [0, 0, 100]
    const grid = makeGrid(3, 1);
    grid.cells[0]![0] = { char: ' ', style: { fg: '\x1b[38;2;100;0;0m' } };
    grid.cells[0]![1] = { char: ' ', style: { fg: '\x1b[38;2;0;100;0m' } };
    grid.cells[0]![2] = { char: ' ', style: { fg: '\x1b[38;2;0;0;100m' } };
    const plan = makeTrivialPlan(3, 1);
    const uniforms = makeUniforms(plan);

    // Average center cell with left and right neighbors
    const avgShader: CellShader = {
      name: 'avg',
      fn: (x, _y, cell, _u, neighbors) => {
        if (x !== 1) return null;
        const left = neighbors(-1, 0);
        const right = neighbors(1, 0);
        if (!cell.fg || !left?.fg || !right?.fg) return null;
        return {
          fg: [
            Math.round((cell.fg[0] + left.fg[0] + right.fg[0]) / 3),
            Math.round((cell.fg[1] + left.fg[1] + right.fg[1]) / 3),
            Math.round((cell.fg[2] + left.fg[2] + right.fg[2]) / 3),
          ] as RGB,
        };
      },
    };

    const result = applyShaders(grid, plan, [avgShader], uniforms);
    // Center cell: avg of [100,0,0], [0,100,0], [0,0,100] = [33, 33, 33]
    expect(result.cells[0]![1]!.style.fg).toBe('\x1b[38;2;33;33;33m');
    // Side cells unchanged
    expect(result.cells[0]![0]!.style.fg).toBe('\x1b[38;2;100;0;0m');
    expect(result.cells[0]![2]!.style.fg).toBe('\x1b[38;2;0;0;100m');
  });
});
