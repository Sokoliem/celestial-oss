import { describe, expect, it } from 'vitest';
import { type ShaderCell, type ShaderUniforms, shaders } from '../shader.js';
import type { LayoutEntry, LayoutPlan, LayoutRect } from '../vdom.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

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

function makeUniforms(cols: number, rows: number): ShaderUniforms {
  const plan = makeTrivialPlan(cols, rows);
  return {
    time: 0,
    tick: 0,
    cols,
    rows,
    plan,
    custom: {},
  };
}

function makeCell(overrides?: Partial<ShaderCell>): ShaderCell {
  return {
    char: 'X',
    fg: [255, 255, 255],
    bg: [0, 0, 0],
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    strikethrough: false,
    tint: null,
    style: {},
    ...overrides,
  };
}

const dummyNeighbors = () => null;

// ─── maskShader ──────────────────────────────────────────────────────────────

describe('shaders.mask', () => {
  it('passes through cells inside a circle shape (returns null)', () => {
    // Shape: circle centered at 0.5,0.5 with radius 0.5
    // Returns 1 for cells inside, 0 for outside
    const circleFn = (x: number, y: number, cols: number, rows: number): number => {
      const nx = (x + 0.5) / cols - 0.5;
      const ny = (y + 0.5) / rows - 0.5;
      const dist = Math.sqrt(nx * nx + ny * ny);
      const radius = 0.4;
      if (dist <= radius) return 1;
      return 0;
    };

    const shader = shaders.mask(circleFn);
    const uniforms = makeUniforms(20, 20);
    const cell = makeCell();

    // Center cell (10, 10) should be fully inside the circle
    const result = shader.fn(10, 10, cell, uniforms, dummyNeighbors);
    expect(result).toBeNull();
  });

  it('masks cells outside a circle shape (clears char and colors)', () => {
    const circleFn = (x: number, y: number, cols: number, rows: number): number => {
      const nx = (x + 0.5) / cols - 0.5;
      const ny = (y + 0.5) / rows - 0.5;
      const dist = Math.sqrt(nx * nx + ny * ny);
      const radius = 0.2;
      if (dist <= radius) return 1;
      return 0;
    };

    const shader = shaders.mask(circleFn);
    const uniforms = makeUniforms(20, 20);
    const cell = makeCell();

    // Corner cell (0, 0) should be outside the circle
    const result = shader.fn(0, 0, cell, uniforms, dummyNeighbors);
    expect(result).not.toBeNull();
    expect(result!.char).toBe(' ');
    expect(result!.fg).toBeNull();
    expect(result!.bg).toBeNull();
    expect(result!.bold).toBe(false);
    expect(result!.dim).toBe(false);
    expect(result!.italic).toBe(false);
    expect(result!.underline).toBe(false);
    expect(result!.strikethrough).toBe(false);
  });

  it('passes through cells inside a rectangle shape', () => {
    // Rectangle: inner 50% region
    const rectFn = (x: number, y: number, cols: number, rows: number): number => {
      const nx = (x + 0.5) / cols;
      const ny = (y + 0.5) / rows;
      if (nx >= 0.25 && nx <= 0.75 && ny >= 0.25 && ny <= 0.75) return 1;
      return 0;
    };

    const shader = shaders.mask(rectFn);
    const uniforms = makeUniforms(20, 20);
    const cell = makeCell();

    // Cell at center (10, 10) — normalized: (10.5/20)=0.525, inside [0.25, 0.75]
    const result = shader.fn(10, 10, cell, uniforms, dummyNeighbors);
    expect(result).toBeNull();
  });

  it('masks cells outside a rectangle shape', () => {
    const rectFn = (x: number, y: number, cols: number, rows: number): number => {
      const nx = (x + 0.5) / cols;
      const ny = (y + 0.5) / rows;
      if (nx >= 0.25 && nx <= 0.75 && ny >= 0.25 && ny <= 0.75) return 1;
      return 0;
    };

    const shader = shaders.mask(rectFn);
    const uniforms = makeUniforms(20, 20);
    const cell = makeCell();

    // Cell at (0, 0) — normalized: (0.5/20)=0.025, outside [0.25, 0.75]
    const result = shader.fn(0, 0, cell, uniforms, dummyNeighbors);
    expect(result).not.toBeNull();
    expect(result!.char).toBe(' ');
    expect(result!.fg).toBeNull();
    expect(result!.bg).toBeNull();
  });

  it('anti-aliases cells on the edge (dim applied for partial values)', () => {
    // Shape that returns 0.5 for all cells (edge case)
    const edgeFn = (): number => 0.5;

    const shader = shaders.mask(edgeFn);
    const uniforms = makeUniforms(10, 10);
    const cell = makeCell();

    const result = shader.fn(5, 5, cell, uniforms, dummyNeighbors);
    expect(result).not.toBeNull();
    expect(result!.dim).toBe(true);
    // Should NOT clear the character for partial values
    expect(result!.char).toBeUndefined();
  });

  it('conforms to the CellShader interface', () => {
    const shader = shaders.mask(() => 1);
    expect(shader.name).toBe('mask');
    expect(typeof shader.fn).toBe('function');
    expect(shader.processOpaque).toBe(true);
  });
});

// ─── revealShader ────────────────────────────────────────────────────────────

describe('shaders.reveal', () => {
  // Distance function: radial from center, returns 0 at center, 1 at edges
  const radialDist = (x: number, y: number, cols: number, rows: number): number => {
    const nx = (x + 0.5) / cols - 0.5;
    const ny = (y + 0.5) / rows - 0.5;
    return Math.sqrt(nx * nx + ny * ny) / Math.sqrt(0.5 * 0.5 + 0.5 * 0.5);
  };

  it('at progress=0 everything is masked (all outside)', () => {
    const shader = shaders.reveal(radialDist, 0);
    const uniforms = makeUniforms(20, 20);
    const cell = makeCell();

    // Even the center cell should be masked at progress=0
    const centerResult = shader.fn(10, 10, cell, uniforms, dummyNeighbors);
    expect(centerResult).not.toBeNull();
    expect(centerResult!.char).toBe(' ');
    expect(centerResult!.fg).toBeNull();
    expect(centerResult!.bg).toBeNull();

    // Corner cell should definitely be masked
    const cornerResult = shader.fn(0, 0, cell, uniforms, dummyNeighbors);
    expect(cornerResult).not.toBeNull();
    expect(cornerResult!.char).toBe(' ');
  });

  it('at progress=0.5 roughly half is revealed', () => {
    const shader = shaders.reveal(radialDist, 0.5);
    const uniforms = makeUniforms(20, 20);
    const cell = makeCell();

    // Center cell (dist ~0) should be fully visible at progress=0.5
    const centerResult = shader.fn(10, 10, cell, uniforms, dummyNeighbors);
    expect(centerResult).toBeNull(); // null = no change = visible

    // Far corner cell (dist ~1) should be masked at progress=0.5
    const cornerResult = shader.fn(0, 0, cell, uniforms, dummyNeighbors);
    expect(cornerResult).not.toBeNull();
    expect(cornerResult!.char).toBe(' ');
    expect(cornerResult!.fg).toBeNull();
  });

  it('at progress=1 everything is visible (all inside)', () => {
    const shader = shaders.reveal(radialDist, 1);
    const uniforms = makeUniforms(20, 20);
    const cell = makeCell();

    // Center should be visible
    const centerResult = shader.fn(10, 10, cell, uniforms, dummyNeighbors);
    expect(centerResult).toBeNull();

    // Corner should also be visible at full progress
    const cornerResult = shader.fn(19, 19, cell, uniforms, dummyNeighbors);
    expect(cornerResult).toBeNull();
  });

  it('conforms to the CellShader interface', () => {
    const shader = shaders.reveal(radialDist, 0.5);
    expect(shader.name).toBe('reveal');
    expect(typeof shader.fn).toBe('function');
    expect(shader.processOpaque).toBe(true);
  });
});
