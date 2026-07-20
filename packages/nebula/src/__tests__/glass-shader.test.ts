import { describe, expect, it } from 'vitest';
import { glassShader } from '../glass-shader.js';
import { applyShaders, type CellShader, type NeighborFn, type ShaderCell, type ShaderUniforms } from '../shader.js';
import type { Cell, CellGrid, LayoutEntry, LayoutPlan, LayoutRect } from '../vdom.js';

// ─── Test Helpers ───────────────────────────────────────────────────────────

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

/** Create a ShaderCell for direct shader fn testing */
function makeShaderCell(overrides: Partial<ShaderCell> = {}): ShaderCell {
  return {
    char: ' ',
    fg: null,
    bg: null,
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

/** Create a no-op neighbor function that returns null for all directions */
function noNeighbors(): NeighborFn {
  return () => null;
}

// ─── Blur ───────────────────────────────────────────────────────────────────

describe('glassShader - blur', () => {
  it('averages neighbor background colors with blur effect', () => {
    const shader = glassShader();

    // Center cell has red bg, all neighbors have blue bg
    const center = makeShaderCell({
      bg: [255, 0, 0],
      style: { effects: { blur: 10 } },
    });
    const neighbor = makeShaderCell({ bg: [0, 0, 255] });
    const neighbors: NeighborFn = () => neighbor;

    const uniforms = makeUniforms(makeTrivialPlan(3, 3));
    const result = shader.fn(1, 1, center, uniforms, neighbors);

    expect(result).not.toBeNull();
    // With blur=10 (full blend), bg should approach the average of
    // 1 red center + 8 blue neighbors = [255/9, 0, 8*255/9]
    // avg = [28.3, 0, 226.7], blend = 1.0 from center toward avg
    const bg = result!.bg!;
    expect(bg[0]).toBeLessThan(255); // Red decreased
    expect(bg[2]).toBeGreaterThan(0); // Blue increased
  });

  it('returns no change with blur=0', () => {
    const shader = glassShader();
    const center = makeShaderCell({
      bg: [100, 100, 100],
      style: { effects: { blur: 0 } },
    });
    const uniforms = makeUniforms(makeTrivialPlan(3, 3));
    const result = shader.fn(1, 1, center, uniforms, noNeighbors());

    // blur=0 means no blur effect, and no other effects active
    expect(result).toBeNull();
  });

  it('handles null neighbor bg by using center bg as fallback', () => {
    const shader = glassShader();
    const center = makeShaderCell({
      bg: [100, 100, 100],
      style: { effects: { blur: 10 } },
    });
    // All neighbors return null bg (they use the center fallback)
    const uniforms = makeUniforms(makeTrivialPlan(3, 3));
    const result = shader.fn(1, 1, center, uniforms, noNeighbors());

    expect(result).not.toBeNull();
    // With null neighbors falling back to center, average == center, so
    // blending center toward center yields center
    const bg = result!.bg!;
    expect(bg[0]).toBe(100);
    expect(bg[1]).toBe(100);
    expect(bg[2]).toBe(100);
  });

  it('handles null center bg by treating it as black', () => {
    const shader = glassShader();
    const center = makeShaderCell({
      bg: null,
      style: { effects: { blur: 5 } },
    });
    const neighbor = makeShaderCell({ bg: [200, 200, 200] });
    const uniforms = makeUniforms(makeTrivialPlan(3, 3));
    const result = shader.fn(1, 1, center, uniforms, () => neighbor);

    expect(result).not.toBeNull();
    const bg = result!.bg!;
    // Center is black [0,0,0], neighbors are [200,200,200]
    // Average ~ [0+200*8]/9 ≈ 177.8, blend at 0.5
    // Result: 0 + (177.8 - 0) * 0.5 ≈ 89
    expect(bg[0]).toBeGreaterThan(0);
    expect(bg[0]).toBeLessThan(200);
  });

  it('clamps blur intensity to 0-10 range', () => {
    const shader = glassShader();
    // Blur of 20 should behave like blur of 10 (full average)
    const center = makeShaderCell({
      bg: [255, 0, 0],
      style: { effects: { blur: 20 } },
    });
    const neighbor = makeShaderCell({ bg: [0, 0, 255] });

    const uniforms = makeUniforms(makeTrivialPlan(3, 3));
    const result20 = shader.fn(1, 1, center, uniforms, () => neighbor);

    const center10 = makeShaderCell({
      bg: [255, 0, 0],
      style: { effects: { blur: 10 } },
    });
    const result10 = shader.fn(1, 1, center10, uniforms, () => neighbor);

    // Both should produce identical results
    expect(result20!.bg).toEqual(result10!.bg);
  });
});

// ─── Opacity ────────────────────────────────────────────────────────────────

describe('glassShader - opacity', () => {
  it('dims fg and bg toward black at opacity 0.5', () => {
    const shader = glassShader();
    const center = makeShaderCell({
      fg: [200, 100, 50],
      bg: [100, 200, 150],
      style: { effects: { opacity: 0.5 } },
    });
    const uniforms = makeUniforms(makeTrivialPlan(1, 1));
    const result = shader.fn(0, 0, center, uniforms, noNeighbors());

    expect(result).not.toBeNull();
    // At opacity 0.5, colors should be half of original (lerp from black)
    expect(result!.fg![0]).toBe(100);
    expect(result!.fg![1]).toBe(50);
    expect(result!.fg![2]).toBe(25);
    expect(result!.bg![0]).toBe(50);
    expect(result!.bg![1]).toBe(100);
    expect(result!.bg![2]).toBe(75);
  });

  it('produces black at opacity 0', () => {
    const shader = glassShader();
    const center = makeShaderCell({
      fg: [255, 128, 64],
      bg: [100, 200, 150],
      style: { effects: { opacity: 0 } },
    });
    const uniforms = makeUniforms(makeTrivialPlan(1, 1));
    const result = shader.fn(0, 0, center, uniforms, noNeighbors());

    expect(result).not.toBeNull();
    expect(result!.fg).toEqual([0, 0, 0]);
    expect(result!.bg).toEqual([0, 0, 0]);
  });

  it('returns no change at opacity 1', () => {
    const shader = glassShader();
    const center = makeShaderCell({
      fg: [255, 128, 64],
      bg: [100, 200, 150],
      style: { effects: { opacity: 1 } },
    });
    const uniforms = makeUniforms(makeTrivialPlan(1, 1));
    const result = shader.fn(0, 0, center, uniforms, noNeighbors());

    // opacity=1 means no change, no other effects → null
    expect(result).toBeNull();
  });

  it('handles null fg gracefully during opacity', () => {
    const shader = glassShader();
    const center = makeShaderCell({
      fg: null,
      bg: [200, 200, 200],
      style: { effects: { opacity: 0.5 } },
    });
    const uniforms = makeUniforms(makeTrivialPlan(1, 1));
    const result = shader.fn(0, 0, center, uniforms, noNeighbors());

    expect(result).not.toBeNull();
    // fg stays null (no fg to dim)
    expect(result!.fg).toBeUndefined();
    expect(result!.bg).toEqual([100, 100, 100]);
  });

  it('clamps opacity to 0-1 range', () => {
    const shader = glassShader();
    // Opacity > 1 should behave like 1 (no change)
    const center = makeShaderCell({
      fg: [100, 100, 100],
      bg: [100, 100, 100],
      style: { effects: { opacity: 1.5 } },
    });
    const uniforms = makeUniforms(makeTrivialPlan(1, 1));
    const result = shader.fn(0, 0, center, uniforms, noNeighbors());

    // opacity >= 1 means no dimming, and no other effects → null
    expect(result).toBeNull();
  });
});

// ─── Tint ───────────────────────────────────────────────────────────────────

describe('glassShader - tint', () => {
  it('overlays tint color onto background at 0.3 mix', () => {
    const shader = glassShader();
    const center = makeShaderCell({
      bg: [100, 100, 100],
      tint: [0, 0, 255],
      style: { effects: {} }, // tint is present on the ShaderCell, effects just needs to exist
    });
    const uniforms = makeUniforms(makeTrivialPlan(1, 1));
    const result = shader.fn(0, 0, center, uniforms, noNeighbors());

    expect(result).not.toBeNull();
    const bg = result!.bg!;
    // lerp(100, 0, 0.3) = 100 + (0-100)*0.3 = 70
    // lerp(100, 0, 0.3) = 70
    // lerp(100, 255, 0.3) = 100 + (255-100)*0.3 = 146.5 → 147
    expect(bg[0]).toBe(70);
    expect(bg[1]).toBe(70);
    expect(bg[2]).toBe(147);
  });

  it('handles null bg by treating as black for tint', () => {
    const shader = glassShader();
    const center = makeShaderCell({
      bg: null,
      tint: [255, 0, 0],
      style: { effects: {} },
    });
    const uniforms = makeUniforms(makeTrivialPlan(1, 1));
    const result = shader.fn(0, 0, center, uniforms, noNeighbors());

    expect(result).not.toBeNull();
    const bg = result!.bg!;
    // lerp(0, 255, 0.3) = 76.5 → 77
    expect(bg[0]).toBe(77);
    expect(bg[1]).toBe(0);
    expect(bg[2]).toBe(0);
  });

  it('does not apply tint when tint is null', () => {
    const shader = glassShader();
    const center = makeShaderCell({
      bg: [100, 100, 100],
      tint: null,
      style: { effects: {} },
    });
    const uniforms = makeUniforms(makeTrivialPlan(1, 1));
    const result = shader.fn(0, 0, center, uniforms, noNeighbors());

    // No tint, no other effects → null
    expect(result).toBeNull();
  });
});

// ─── Glass (Combined) ───────────────────────────────────────────────────────

describe('glassShader - glass mode', () => {
  it('applies blur + tint + opacity when glass is true', () => {
    const shader = glassShader();
    const center = makeShaderCell({
      fg: [200, 200, 200],
      bg: [100, 100, 100],
      tint: [0, 100, 200],
      style: { effects: { glass: true } },
    });
    const neighbor = makeShaderCell({ bg: [80, 80, 80] });
    const uniforms = makeUniforms(makeTrivialPlan(3, 3));
    const result = shader.fn(1, 1, center, uniforms, () => neighbor);

    expect(result).not.toBeNull();
    // Glass applies blur(3) + tint + opacity(0.7)
    // The bg should differ from the original
    expect(result!.bg).toBeDefined();
    // fg should be dimmed by opacity 0.7
    expect(result!.fg).toBeDefined();
    expect(result!.fg![0]).toBeLessThan(200);
  });

  it('glass uses default blur=3 when no explicit blur set', () => {
    const shader = glassShader();
    const center = makeShaderCell({
      bg: [255, 0, 0],
      style: { effects: { glass: true } },
    });
    const neighbor = makeShaderCell({ bg: [0, 0, 255] });
    const uniforms = makeUniforms(makeTrivialPlan(3, 3));
    const result = shader.fn(1, 1, center, uniforms, () => neighbor);

    expect(result).not.toBeNull();
    // With blur=3 (blend=0.3), bg should shift toward the average
    const bg = result!.bg!;
    expect(bg[0]).toBeLessThan(255);
    expect(bg[2]).toBeGreaterThan(0);
  });

  it('glass uses default opacity=0.7', () => {
    const shader = glassShader();
    const center = makeShaderCell({
      fg: [100, 100, 100],
      bg: [100, 100, 100],
      style: { effects: { glass: true } },
    });
    const uniforms = makeUniforms(makeTrivialPlan(1, 1));
    const result = shader.fn(0, 0, center, uniforms, noNeighbors());

    expect(result).not.toBeNull();
    // fg should be dimmed by 0.7 opacity
    expect(result!.fg![0]).toBe(70);
    expect(result!.fg![1]).toBe(70);
    expect(result!.fg![2]).toBe(70);
  });

  it('glass respects explicit blur/opacity overrides', () => {
    const shader = glassShader();
    const center = makeShaderCell({
      fg: [200, 200, 200],
      bg: [100, 100, 100],
      style: { effects: { glass: true, blur: 5, opacity: 0.5 } },
    });
    const uniforms = makeUniforms(makeTrivialPlan(1, 1));
    const result = shader.fn(0, 0, center, uniforms, noNeighbors());

    expect(result).not.toBeNull();
    // fg at 0.5 opacity = 100
    expect(result!.fg![0]).toBe(100);
  });
});

// ─── No Effect ──────────────────────────────────────────────────────────────

describe('glassShader - no effect', () => {
  it('returns null when no effects are set', () => {
    const shader = glassShader();
    const center = makeShaderCell({
      bg: [100, 100, 100],
      style: {},
    });
    const uniforms = makeUniforms(makeTrivialPlan(1, 1));
    const result = shader.fn(0, 0, center, uniforms, noNeighbors());

    expect(result).toBeNull();
  });

  it('returns null when effects is empty object', () => {
    const shader = glassShader();
    const center = makeShaderCell({
      bg: [100, 100, 100],
      tint: null,
      style: { effects: {} },
    });
    const uniforms = makeUniforms(makeTrivialPlan(1, 1));
    const result = shader.fn(0, 0, center, uniforms, noNeighbors());

    expect(result).toBeNull();
  });

  it('returns null when glass is false and no individual effects', () => {
    const shader = glassShader();
    const center = makeShaderCell({
      bg: [100, 100, 100],
      style: { effects: { glass: false } },
    });
    const uniforms = makeUniforms(makeTrivialPlan(1, 1));
    const result = shader.fn(0, 0, center, uniforms, noNeighbors());

    expect(result).toBeNull();
  });
});

// ─── Integration with applyShaders ──────────────────────────────────────────

describe('glassShader - integration', () => {
  it('works within applyShaders pipeline', () => {
    const grid = makeGrid(3, 3, {
      char: '#',
      style: {
        bg: '\x1b[48;2;100;100;100m',
        effects: { blur: 5 },
      },
    });
    const plan = makeTrivialPlan(3, 3);
    const uniforms = makeUniforms(plan);

    const result = applyShaders(grid, plan, [glassShader()], uniforms);

    // Center cell (1,1) should have blurred bg
    const centerCell = result.cells[1]![1]!;
    // Since all cells have the same color and blur averages neighbors,
    // the result should stay close to the original (all same color)
    expect(centerCell.style.bg).toBeDefined();
  });

  it('composes with other shaders', () => {
    const grid = makeGrid(3, 3, {
      char: 'A',
      style: {
        fg: '\x1b[38;2;200;200;200m',
        bg: '\x1b[48;2;50;50;50m',
        effects: { opacity: 0.5 },
      },
    });
    const plan = makeTrivialPlan(3, 3);
    const uniforms = makeUniforms(plan);

    // Glass shader then a custom shader
    const customShader: CellShader = {
      name: 'noop-after',
      fn: (_x, _y, cell) => {
        // Verify the glass shader output has been applied to the cell
        // at this point (fg should be dimmed)
        if (cell.fg && cell.fg[0] < 200) {
          return null; // Glass shader ran first, fg is dimmed
        }
        return { fg: [255, 0, 0] }; // Should not happen
      },
    };

    const result = applyShaders(grid, plan, [glassShader(), customShader], uniforms);

    // The cell fg should be dimmed by opacity 0.5 (from glass shader),
    // and the noop-after should not have changed it
    const cell = result.cells[1]![1]!;
    expect(cell.style.fg).toBe('\x1b[38;2;100;100;100m');
  });
});
