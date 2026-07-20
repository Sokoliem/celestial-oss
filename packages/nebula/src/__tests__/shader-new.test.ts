import { describe, expect, it } from 'vitest';
import type { NeighborFn, ShaderCell, ShaderUniforms } from '../shader.js';
import { shaders } from '../shader.js';
import type { LayoutEntry, LayoutPlan, LayoutRect } from '../vdom.js';

function makePlan(width: number, height: number): LayoutPlan {
  const rect: LayoutRect = { x: 0, y: 0, width, height };
  const root: LayoutEntry = { id: 'root', node: { kind: 'empty' }, rect, children: [] };
  return { root, index: new Map([['root', root]]), width, height, overlays: [] };
}

function makeUniforms(width = 5, height = 5): ShaderUniforms {
  const plan = makePlan(width, height);
  return { time: 0, tick: 0, cols: width, rows: height, plan, custom: {} };
}

function makeCell(overrides: Partial<ShaderCell> = {}): ShaderCell {
  return {
    char: 'X',
    fg: [120, 120, 120],
    bg: [20, 20, 20],
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

describe('new shader factories', () => {
  it('chromaticAberration offsets red and blue channels from neighbors', () => {
    const shader = shaders.chromaticAberration(1);
    const result = shader.fn(1, 1, makeCell({ fg: [50, 100, 150] }), makeUniforms(), ((dx) => {
      if (dx === -1) return makeCell({ fg: [200, 0, 0] });
      if (dx === 1) return makeCell({ fg: [0, 0, 220] });
      return null;
    }) as NeighborFn);

    expect(result?.fg).toEqual([200, 100, 220]);
  });

  it('bloom adds glow from bright neighbors', () => {
    const shader = shaders.bloom(180, 0.8);
    const result = shader.fn(1, 1, makeCell({ fg: [10, 10, 10] }), makeUniforms(), (() => makeCell({ fg: [255, 200, 120] })) as NeighborFn);

    expect(result?.fg?.[0]).toBeGreaterThan(10);
    expect(result?.fg?.[1]).toBeGreaterThan(10);
  });

  it('gradientMap remaps luminance through color stops', () => {
    const shader = shaders.gradientMap([
      [0, 0, 0],
      [255, 0, 0],
      [255, 255, 255],
    ]);
    const result = shader.fn(0, 0, makeCell({ fg: [180, 180, 180] }), makeUniforms(), (() => null) as NeighborFn);

    expect(result?.fg?.[0]).toBeGreaterThan(result?.fg?.[1] ?? 0);
    expect(result?.fg?.[0]).toBeGreaterThan(0);
  });

  it('barrelDistortion samples a displaced cell near the edge', () => {
    const shader = shaders.barrelDistortion(0.6);
    const result = shader.fn(0, 0, makeCell({ char: 'A', fg: [10, 10, 10] }), makeUniforms(10, 10), ((dx, dy) => {
      if (dx === 4 && dy === 4) return makeCell({ char: 'B', fg: [200, 150, 100], bold: true });
      return null;
    }) as NeighborFn);

    expect(result?.char).toBe('B');
    expect(result?.fg).toEqual([200, 150, 100]);
    expect(result?.bold).toBe(true);
  });

  it('pixelate averages colors inside a block', () => {
    const shader = shaders.pixelate(2);
    const result = shader.fn(1, 1, makeCell({ fg: [0, 0, 0], bg: [0, 0, 0] }), makeUniforms(), ((dx, dy) => {
      const samples = new Map<string, ShaderCell>([
        ['-1,-1', makeCell({ fg: [100, 0, 0], bg: [0, 0, 0], char: 'A' })],
        ['0,-1', makeCell({ fg: [0, 100, 0], bg: [0, 0, 0], char: 'B' })],
        ['-1,0', makeCell({ fg: [0, 0, 100], bg: [0, 0, 0], char: 'C' })],
        ['0,0', makeCell({ fg: [100, 100, 100], bg: [0, 0, 0], char: 'D' })],
      ]);
      return samples.get(`${dx},${dy}`) ?? null;
    }) as NeighborFn);

    expect(result?.fg).toEqual([50, 50, 50]);
    expect(result?.char).toBe('A');
  });

  it('colorTemperature warms and cools output naturally', () => {
    const warm = shaders.colorTemperature(3200);
    const cool = shaders.colorTemperature(9000);
    const cell = makeCell({ fg: [120, 120, 120] });

    const warmFg = warm.fn(0, 0, cell, makeUniforms(), (() => null) as NeighborFn)?.fg ?? [0, 0, 0];
    const coolFg = cool.fn(0, 0, cell, makeUniforms(), (() => null) as NeighborFn)?.fg ?? [0, 0, 0];

    expect(warmFg[0]).toBeGreaterThan(warmFg[2]);
    expect(coolFg[2]).toBeGreaterThan(coolFg[0]);
  });

  it('depthOfField blurs rows outside the focus range', () => {
    const shader = shaders.depthOfField(2, 0, 1);
    const result = shader.fn(1, 4, makeCell({ fg: [200, 50, 50] }), makeUniforms(5, 5), (() => makeCell({ fg: [50, 50, 200] })) as NeighborFn);

    expect(result?.fg?.[2]).toBeGreaterThan(50);
    expect(result?.dim).toBe(true);
  });

  it('sepia applies a warm vintage grade', () => {
    const shader = shaders.sepia(1);
    const result = shader.fn(0, 0, makeCell({ fg: [80, 90, 100] }), makeUniforms(), (() => null) as NeighborFn);

    expect(result?.fg?.[0]).toBeGreaterThan(result?.fg?.[2] ?? 0);
    expect(result?.fg).not.toEqual([80, 90, 100]);
  });
});
