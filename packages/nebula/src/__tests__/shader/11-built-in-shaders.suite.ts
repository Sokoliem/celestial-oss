// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { type NeighborFn, type RGB, type ShaderCell, type ShaderUniforms, shaders } from '../../shader.js';
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

function makeShaderCell(fg: RGB | null, bg: RGB | null, char = 'X'): ShaderCell {
  return { char, fg, bg, bold: false, dim: false, italic: false, underline: false, strikethrough: false, tint: null, style: {} };
}

function makeSimpleUniforms(cols = 80, rows = 24): ShaderUniforms {
  return {
    time: 0,
    tick: 0,
    cols,
    rows,
    plan: makeTrivialPlan(cols, rows),
    custom: {},
  };
}

const noNeighbors: NeighborFn = () => null;

describe('built-in shaders', () => {
  // ─── dim ─────────────────────────────────────────────────────────────────
  describe('dim', () => {
    it('reduces lightness of fg and bg', () => {
      const shader = shaders.dim(50);
      expect(shader.name).toBe('dim');
      // Bright white (L=100 in HSL) should become darker
      const cell = makeShaderCell([255, 255, 255], [255, 255, 255]);
      const uniforms = makeSimpleUniforms();
      const result = shader.fn(0, 0, cell, uniforms, noNeighbors);
      expect(result).not.toBeNull();
      // After dimming by 50 lightness points, lightness goes from 100 to 50
      // HSL(0, 0%, 50%) = RGB(128, 128, 128)
      expect(result!.fg).toEqual([128, 128, 128]);
      expect(result!.bg).toEqual([128, 128, 128]);
    });

    it('handles null colors by returning null for that channel', () => {
      const shader = shaders.dim(30);
      const cell = makeShaderCell(null, null);
      const uniforms = makeSimpleUniforms();
      const result = shader.fn(0, 0, cell, uniforms, noNeighbors);
      // If both are null, shader should return null for both channels
      expect(result).not.toBeNull();
      expect(result!.fg).toBeNull();
      expect(result!.bg).toBeNull();
    });

    it('clamps lightness to zero (does not go negative)', () => {
      const shader = shaders.dim(100);
      // Dark gray: HSL roughly (0, 0%, ~10%)
      const cell = makeShaderCell([25, 25, 25], [25, 25, 25]);
      const uniforms = makeSimpleUniforms();
      const result = shader.fn(0, 0, cell, uniforms, noNeighbors);
      expect(result).not.toBeNull();
      // Lightness should clamp to 0, producing black
      expect(result!.fg).toEqual([0, 0, 0]);
      expect(result!.bg).toEqual([0, 0, 0]);
    });

    it('dim(0) is identity', () => {
      const shader = shaders.dim(0);
      const cell = makeShaderCell([100, 150, 200], [50, 75, 100]);
      const uniforms = makeSimpleUniforms();
      const result = shader.fn(0, 0, cell, uniforms, noNeighbors);
      expect(result).not.toBeNull();
      expect(result!.fg).toEqual([100, 150, 200]);
      expect(result!.bg).toEqual([50, 75, 100]);
    });
  });

  // ─── vignette ────────────────────────────────────────────────────────────
  describe('vignette', () => {
    it('darkens corners more than center', () => {
      const shader = shaders.vignette(1.0, 0.0);
      const uniforms = makeSimpleUniforms(10, 10);
      const cell = makeShaderCell([200, 200, 200], [200, 200, 200]);

      // Center cell (5, 5) — near center, minimal darkening
      const centerResult = shader.fn(5, 5, cell, uniforms, noNeighbors);
      // Corner cell (0, 0) — maximum darkening
      const cornerResult = shader.fn(0, 0, cell, uniforms, noNeighbors);

      expect(centerResult).not.toBeNull();
      expect(cornerResult).not.toBeNull();

      // Corner should be darker than center
      const centerBrightness = centerResult!.fg![0] + centerResult!.fg![1] + centerResult!.fg![2];
      const cornerBrightness = cornerResult!.fg![0] + cornerResult!.fg![1] + cornerResult!.fg![2];
      expect(cornerBrightness).toBeLessThan(centerBrightness);
    });

    it('strength=0 produces no darkening', () => {
      const shader = shaders.vignette(0, 0.8);
      const uniforms = makeSimpleUniforms(10, 10);
      const cell = makeShaderCell([200, 200, 200], [200, 200, 200]);

      // Any cell should be unchanged
      const result = shader.fn(0, 0, cell, uniforms, noNeighbors);
      expect(result).not.toBeNull();
      expect(result!.fg).toEqual([200, 200, 200]);
      expect(result!.bg).toEqual([200, 200, 200]);
    });

    it('has name "vignette"', () => {
      const shader = shaders.vignette();
      expect(shader.name).toBe('vignette');
    });

    it('handles null colors', () => {
      const shader = shaders.vignette();
      const uniforms = makeSimpleUniforms(10, 10);
      const cell = makeShaderCell(null, null);
      const result = shader.fn(0, 0, cell, uniforms, noNeighbors);
      expect(result).not.toBeNull();
      expect(result!.fg).toBeNull();
      expect(result!.bg).toBeNull();
    });
  });

  // ─── scanline ────────────────────────────────────────────────────────────
  describe('scanline', () => {
    it('only affects every Nth row', () => {
      const shader = shaders.scanline(0.5, 2);
      const uniforms = makeSimpleUniforms();
      const cell = makeShaderCell([200, 200, 200], [200, 200, 200]);

      // Row 0 (0 % 2 === 0) → affected
      const row0 = shader.fn(0, 0, cell, uniforms, noNeighbors);
      // Row 1 (1 % 2 !== 0) → not affected (null)
      const row1 = shader.fn(0, 1, cell, uniforms, noNeighbors);
      // Row 2 (2 % 2 === 0) → affected
      const row2 = shader.fn(0, 2, cell, uniforms, noNeighbors);

      expect(row0).not.toBeNull();
      expect(row0!.fg![0]).toBeLessThan(200);
      expect(row1).toBeNull();
      expect(row2).not.toBeNull();
      expect(row2!.fg![0]).toBeLessThan(200);
    });

    it('preserves unaffected rows', () => {
      const shader = shaders.scanline(0.5, 3);
      const uniforms = makeSimpleUniforms();
      const cell = makeShaderCell([100, 150, 200], [50, 75, 100]);

      // Row 1 (1 % 3 !== 0) → null (no change)
      const result = shader.fn(0, 1, cell, uniforms, noNeighbors);
      expect(result).toBeNull();
    });

    it('applies correct dimming factor', () => {
      const opacity = 0.5;
      const shader = shaders.scanline(opacity, 1); // every row affected
      const uniforms = makeSimpleUniforms();
      const cell = makeShaderCell([200, 200, 200], [100, 100, 100]);

      const result = shader.fn(0, 0, cell, uniforms, noNeighbors);
      expect(result).not.toBeNull();
      // dimRgb(rgb, 1 - opacity) = dimRgb([200,200,200], 0.5) = [100, 100, 100]
      expect(result!.fg).toEqual([100, 100, 100]);
      expect(result!.bg).toEqual([50, 50, 50]);
    });

    it('has name "scanline"', () => {
      const shader = shaders.scanline();
      expect(shader.name).toBe('scanline');
    });

    it('handles null colors', () => {
      const shader = shaders.scanline(0.5, 1);
      const uniforms = makeSimpleUniforms();
      const cell = makeShaderCell(null, null);
      const result = shader.fn(0, 0, cell, uniforms, noNeighbors);
      expect(result).not.toBeNull();
      expect(result!.fg).toBeNull();
      expect(result!.bg).toBeNull();
    });
  });

  // ─── hueShift ────────────────────────────────────────────────────────────
  describe('hueShift', () => {
    it('rotates hue correctly', () => {
      const shader = shaders.hueShift(120);
      expect(shader.name).toBe('hueShift');
      // Pure red (hue ~0) + 120° → should become green-ish
      const cell = makeShaderCell([255, 0, 0], null);
      const uniforms = makeSimpleUniforms();
      const result = shader.fn(0, 0, cell, uniforms, noNeighbors);
      expect(result).not.toBeNull();
      // Red → hue shifts to ~120° → green
      expect(result!.fg![1]).toBeGreaterThan(result!.fg![0]); // G > R
      expect(result!.fg![1]).toBeGreaterThan(result!.fg![2]); // G > B
    });

    it('360 degree shift is identity', () => {
      const shader = shaders.hueShift(360);
      const cell = makeShaderCell([100, 150, 200], [50, 75, 100]);
      const uniforms = makeSimpleUniforms();
      const result = shader.fn(0, 0, cell, uniforms, noNeighbors);
      expect(result).not.toBeNull();
      // Should be the same (within rounding tolerance)
      expect(result!.fg![0]).toBeCloseTo(100, 0);
      expect(result!.fg![1]).toBeCloseTo(150, 0);
      expect(result!.fg![2]).toBeCloseTo(200, 0);
    });

    it('handles null colors', () => {
      const shader = shaders.hueShift(90);
      const cell = makeShaderCell(null, null);
      const uniforms = makeSimpleUniforms();
      const result = shader.fn(0, 0, cell, uniforms, noNeighbors);
      expect(result).not.toBeNull();
      expect(result!.fg).toBeNull();
      expect(result!.bg).toBeNull();
    });

    it('negative degrees work (wraps around)', () => {
      const shader = shaders.hueShift(-120);
      // Pure green (hue ~120°) - 120° → red-ish
      const cell = makeShaderCell([0, 255, 0], null);
      const uniforms = makeSimpleUniforms();
      const result = shader.fn(0, 0, cell, uniforms, noNeighbors);
      expect(result).not.toBeNull();
      expect(result!.fg![0]).toBeGreaterThan(result!.fg![1]); // R > G
    });
  });

  // ─── tint ────────────────────────────────────────────────────────────────
  describe('tint', () => {
    it('blends toward target color', () => {
      const shader = shaders.tint([255, 0, 0], 0.5);
      expect(shader.name).toBe('tint');
      // Black + tint(red, 0.5) → [128, 0, 0] approximately
      const cell = makeShaderCell([0, 0, 0], [0, 0, 0]);
      const uniforms = makeSimpleUniforms();
      const result = shader.fn(0, 0, cell, uniforms, noNeighbors);
      expect(result).not.toBeNull();
      expect(result!.fg).toEqual([128, 0, 0]);
      expect(result!.bg).toEqual([128, 0, 0]);
    });

    it('amount=0 is identity', () => {
      const shader = shaders.tint([255, 0, 0], 0);
      const cell = makeShaderCell([100, 150, 200], [50, 75, 100]);
      const uniforms = makeSimpleUniforms();
      const result = shader.fn(0, 0, cell, uniforms, noNeighbors);
      expect(result).not.toBeNull();
      expect(result!.fg).toEqual([100, 150, 200]);
      expect(result!.bg).toEqual([50, 75, 100]);
    });

    it('amount=1 replaces color entirely', () => {
      const shader = shaders.tint([255, 0, 0], 1);
      const cell = makeShaderCell([0, 255, 0], [0, 0, 255]);
      const uniforms = makeSimpleUniforms();
      const result = shader.fn(0, 0, cell, uniforms, noNeighbors);
      expect(result).not.toBeNull();
      expect(result!.fg).toEqual([255, 0, 0]);
      expect(result!.bg).toEqual([255, 0, 0]);
    });

    it('handles null colors', () => {
      const shader = shaders.tint([255, 0, 0], 0.5);
      const cell = makeShaderCell(null, null);
      const uniforms = makeSimpleUniforms();
      const result = shader.fn(0, 0, cell, uniforms, noNeighbors);
      expect(result).not.toBeNull();
      expect(result!.fg).toBeNull();
      expect(result!.bg).toBeNull();
    });
  });

  // ─── invert ──────────────────────────────────────────────────────────────
  describe('invert', () => {
    it('inverts all channels', () => {
      const shader = shaders.invert();
      expect(shader.name).toBe('invert');
      const cell = makeShaderCell([255, 0, 0], [0, 255, 255]);
      const uniforms = makeSimpleUniforms();
      const result = shader.fn(0, 0, cell, uniforms, noNeighbors);
      expect(result).not.toBeNull();
      expect(result!.fg).toEqual([0, 255, 255]);
      expect(result!.bg).toEqual([255, 0, 0]);
    });

    it('double invert is identity', () => {
      const s1 = shaders.invert();
      const s2 = shaders.invert();
      const original: RGB = [100, 150, 200];
      const cell = makeShaderCell(original, original);
      const uniforms = makeSimpleUniforms();

      const first = s1.fn(0, 0, cell, uniforms, noNeighbors);
      expect(first).not.toBeNull();
      const inverted = makeShaderCell(first!.fg!, first!.bg!);
      const second = s2.fn(0, 0, inverted, uniforms, noNeighbors);
      expect(second).not.toBeNull();
      expect(second!.fg).toEqual(original);
      expect(second!.bg).toEqual(original);
    });

    it('handles null colors', () => {
      const shader = shaders.invert();
      const cell = makeShaderCell(null, null);
      const uniforms = makeSimpleUniforms();
      const result = shader.fn(0, 0, cell, uniforms, noNeighbors);
      expect(result).not.toBeNull();
      expect(result!.fg).toBeNull();
      expect(result!.bg).toBeNull();
    });
  });

  // ─── grayscale ───────────────────────────────────────────────────────────
  describe('grayscale', () => {
    it('output has r===g===b', () => {
      const shader = shaders.grayscale();
      expect(shader.name).toBe('grayscale');
      const cell = makeShaderCell([255, 0, 0], [0, 128, 255]);
      const uniforms = makeSimpleUniforms();
      const result = shader.fn(0, 0, cell, uniforms, noNeighbors);
      expect(result).not.toBeNull();
      expect(result!.fg![0]).toBe(result!.fg![1]);
      expect(result!.fg![1]).toBe(result!.fg![2]);
      expect(result!.bg![0]).toBe(result!.bg![1]);
      expect(result!.bg![1]).toBe(result!.bg![2]);
    });

    it('preserves luminance: white stays white, black stays black', () => {
      const shader = shaders.grayscale();
      const uniforms = makeSimpleUniforms();

      const whiteCell = makeShaderCell([255, 255, 255], [0, 0, 0]);
      const whiteResult = shader.fn(0, 0, whiteCell, uniforms, noNeighbors);
      expect(whiteResult).not.toBeNull();
      expect(whiteResult!.fg).toEqual([255, 255, 255]);
      expect(whiteResult!.bg).toEqual([0, 0, 0]);
    });

    it('computes correct luminance for pure red', () => {
      const shader = shaders.grayscale();
      const uniforms = makeSimpleUniforms();
      const cell = makeShaderCell([255, 0, 0], null);
      const result = shader.fn(0, 0, cell, uniforms, noNeighbors);
      expect(result).not.toBeNull();
      // gray = round(0.299 * 255 + 0.587 * 0 + 0.114 * 0) = round(76.245) = 76
      expect(result!.fg).toEqual([76, 76, 76]);
    });

    it('handles null colors', () => {
      const shader = shaders.grayscale();
      const cell = makeShaderCell(null, null);
      const uniforms = makeSimpleUniforms();
      const result = shader.fn(0, 0, cell, uniforms, noNeighbors);
      expect(result).not.toBeNull();
      expect(result!.fg).toBeNull();
      expect(result!.bg).toBeNull();
    });
  });

  // ─── blur ────────────────────────────────────────────────────────────────
  describe('blur', () => {
    it('averages with cardinal neighbors', () => {
      const shader = shaders.blur();
      expect(shader.name).toBe('blur');
      const uniforms = makeSimpleUniforms();

      // Center: [200, 200, 200], all 4 neighbors: [100, 100, 100]
      const center = makeShaderCell([200, 200, 200], [200, 200, 200]);
      const neighbor = makeShaderCell([100, 100, 100], [100, 100, 100]);
      const neighborFn: NeighborFn = (dx, dy) => {
        if (Math.abs(dx) + Math.abs(dy) === 1) return neighbor;
        return null;
      };

      const result = shader.fn(5, 5, center, uniforms, neighborFn);
      expect(result).not.toBeNull();
      // center=0.5*200=100, 4 neighbors=4*0.125*100=50 → total=150
      expect(result!.fg).toEqual([150, 150, 150]);
      expect(result!.bg).toEqual([150, 150, 150]);
    });

    it('handles edge cells (only 2 neighbors at corner)', () => {
      const shader = shaders.blur();
      const uniforms = makeSimpleUniforms();

      // Corner cell: only right and bottom neighbors exist
      const center = makeShaderCell([200, 200, 200], [200, 200, 200]);
      const neighbor = makeShaderCell([100, 100, 100], [100, 100, 100]);
      const cornerNeighbors: NeighborFn = (dx, dy) => {
        // Top-left corner: only right (1,0) and bottom (0,1) exist
        if (dx === 1 && dy === 0) return neighbor;
        if (dx === 0 && dy === 1) return neighbor;
        return null;
      };

      const result = shader.fn(0, 0, center, uniforms, cornerNeighbors);
      expect(result).not.toBeNull();
      // 2 missing neighbors → their weight (2*0.125=0.25) added to center
      // center_weight = 0.5 + 0.25 = 0.75
      // center: 0.75 * 200 = 150
      // 2 neighbors: 2 * 0.125 * 100 = 25
      // total = 175
      expect(result!.fg).toEqual([175, 175, 175]);
      expect(result!.bg).toEqual([175, 175, 175]);
    });

    it('handles null colors in center cell', () => {
      const shader = shaders.blur();
      const uniforms = makeSimpleUniforms();
      const cell = makeShaderCell(null, null);
      const result = shader.fn(0, 0, cell, uniforms, noNeighbors);
      expect(result).not.toBeNull();
      expect(result!.fg).toBeNull();
      expect(result!.bg).toBeNull();
    });

    it('handles mixed null/non-null neighbors', () => {
      const shader = shaders.blur();
      const uniforms = makeSimpleUniforms();
      const center = makeShaderCell([200, 0, 0], null);
      // Only one neighbor has color
      const colorNeighbor = makeShaderCell([0, 200, 0], null);
      const nullNeighbor = makeShaderCell(null, null);
      const mixedNeighbors: NeighborFn = (dx, dy) => {
        if (dx === 1 && dy === 0) return colorNeighbor;
        if (dx === -1 && dy === 0) return nullNeighbor;
        if (dx === 0 && dy === 1) return nullNeighbor;
        if (dx === 0 && dy === -1) return nullNeighbor;
        return null;
      };

      const result = shader.fn(5, 5, center, uniforms, mixedNeighbors);
      expect(result).not.toBeNull();
      // For fg: 3 neighbors have null fg → their weight goes to center
      // center_weight = 0.5 + 3*0.125 = 0.875
      // center: 0.875 * 200 = 175 (R), 0.875 * 0 = 0 (G), 0
      // 1 neighbor: 0.125 * 0 = 0 (R), 0.125 * 200 = 25 (G), 0
      // total = [175, 25, 0]
      expect(result!.fg).toEqual([175, 25, 0]);
    });
  });
});
