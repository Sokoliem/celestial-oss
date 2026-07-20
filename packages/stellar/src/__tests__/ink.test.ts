import type { CellShader, NeighborFn, ShaderCell, ShaderUniforms } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { annotation, arrow, circle, highlight, InkLayer, pen, rect } from '../ink.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Create a minimal ShaderCell for testing the shader */
function makeCell(overrides: Partial<ShaderCell> = {}): ShaderCell {
  return {
    char: ' ',
    fg: null,
    bg: null,
    tint: null,
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    strikethrough: false,
    ...overrides,
  } as ShaderCell;
}

/** Minimal uniforms for shader testing */
function makeUniforms(overrides: Partial<ShaderUniforms> = {}): ShaderUniforms {
  return {
    time: 0,
    tick: 0,
    cols: 80,
    rows: 24,
    plan: { entries: [], index: new Map() } as any,
    custom: {},
    ...overrides,
  };
}

/** No-op neighbors function */
const noNeighbors: NeighborFn = () => null;

// ── InkLayer Lifecycle Tests ─────────────────────────────────────────────────

describe('InkLayer lifecycle', () => {
  it('new InkLayer() creates empty layer', () => {
    const layer = new InkLayer();
    expect(layer.count()).toBe(0);
    expect(layer.marks()).toEqual([]);
  });

  it('draw() adds a mark', () => {
    const layer = new InkLayer();
    const mark = pen({ from: { x: 0, y: 0 }, to: { x: 5, y: 0 }, color: [255, 0, 0] });
    layer.draw(mark);
    expect(layer.count()).toBe(1);
    expect(layer.marks()[0]).toBe(mark);
  });

  it('marks() returns all marks in order', () => {
    const layer = new InkLayer();
    const m1 = pen({ from: { x: 0, y: 0 }, to: { x: 5, y: 0 }, color: [255, 0, 0] });
    const m2 = annotation({ pos: { x: 1, y: 1 }, text: 'Hi', color: [0, 255, 0] });
    const m3 = circle({ center: { x: 10, y: 10 }, radius: 3, color: [0, 0, 255] });
    layer.draw(m1);
    layer.draw(m2);
    layer.draw(m3);
    expect(layer.marks()).toEqual([m1, m2, m3]);
  });

  it('count() returns correct count', () => {
    const layer = new InkLayer();
    expect(layer.count()).toBe(0);
    layer.draw(pen({ from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, color: [255, 0, 0] }));
    expect(layer.count()).toBe(1);
    layer.draw(pen({ from: { x: 0, y: 0 }, to: { x: 2, y: 0 }, color: [0, 255, 0] }));
    expect(layer.count()).toBe(2);
  });

  it('undo() removes and returns last mark', () => {
    const layer = new InkLayer();
    const m1 = pen({ from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, color: [255, 0, 0] });
    const m2 = pen({ from: { x: 0, y: 0 }, to: { x: 2, y: 0 }, color: [0, 255, 0] });
    layer.draw(m1);
    layer.draw(m2);
    const undone = layer.undo();
    expect(undone).toBe(m2);
    expect(layer.count()).toBe(1);
    expect(layer.marks()).toEqual([m1]);
  });

  it('undo() on empty returns undefined', () => {
    const layer = new InkLayer();
    expect(layer.undo()).toBeUndefined();
  });

  it('clear() removes all marks', () => {
    const layer = new InkLayer();
    layer.draw(pen({ from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, color: [255, 0, 0] }));
    layer.draw(pen({ from: { x: 0, y: 0 }, to: { x: 2, y: 0 }, color: [0, 255, 0] }));
    layer.clear();
    expect(layer.count()).toBe(0);
    expect(layer.marks()).toEqual([]);
  });

  it('save() and load() roundtrip preserves state', () => {
    const layer = new InkLayer({ blend: 'underlay', opacity: 0.5 });
    layer.draw(pen({ from: { x: 0, y: 0 }, to: { x: 5, y: 0 }, color: [255, 0, 0] }));
    layer.draw(annotation({ pos: { x: 1, y: 1 }, text: 'Test', color: [0, 255, 0] }));

    const saved = layer.save();
    const layer2 = new InkLayer();
    layer2.load(saved);

    expect(layer2.count()).toBe(2);
    expect(layer2.marks()).toEqual(layer.marks());
    expect(layer2.save().options).toEqual({ blend: 'underlay', opacity: 0.5 });
  });
});

// ── Drawing Rasterization Tests ──────────────────────────────────────────────

describe('Drawing rasterization', () => {
  /** Helper: get all rasterized cells from the shader by scanning a range */
  function scanShader(layer: InkLayer, width: number, height: number): Map<string, ReturnType<NonNullable<CellShader['fn']>>> {
    const shader = layer.shader();
    const uniforms = makeUniforms({ cols: width, rows: height });
    const results = new Map<string, ReturnType<NonNullable<CellShader['fn']>>>();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const result = shader.fn(x, y, makeCell(), uniforms, noNeighbors);
        if (result) {
          results.set(`${x},${y}`, result);
        }
      }
    }
    return results;
  }

  describe('pen mark', () => {
    it('horizontal pen from (0,0) to (5,0) produces 6 cells', () => {
      const layer = new InkLayer();
      layer.draw(pen({ from: { x: 0, y: 0 }, to: { x: 5, y: 0 }, color: [255, 0, 0] }));
      const cells = scanShader(layer, 10, 5);

      // Should have exactly 6 cells at y=0, x=0..5
      for (let x = 0; x <= 5; x++) {
        expect(cells.has(`${x},0`)).toBe(true);
      }
      // No cells beyond the line
      expect(cells.has('6,0')).toBe(false);
      expect(cells.has('0,1')).toBe(false);
    });

    it('vertical pen from (0,0) to (0,5) produces 6 cells', () => {
      const layer = new InkLayer();
      layer.draw(pen({ from: { x: 0, y: 0 }, to: { x: 0, y: 5 }, color: [0, 255, 0] }));
      const cells = scanShader(layer, 5, 10);

      for (let y = 0; y <= 5; y++) {
        expect(cells.has(`0,${y}`)).toBe(true);
      }
      expect(cells.has('1,0')).toBe(false);
      expect(cells.has('0,6')).toBe(false);
    });

    it('pen with custom char uses that character', () => {
      const layer = new InkLayer();
      layer.draw(pen({ from: { x: 0, y: 0 }, to: { x: 2, y: 0 }, color: [255, 0, 0], char: '#' }));
      const cells = scanShader(layer, 5, 2);

      const cell = cells.get('1,0');
      expect(cell).toBeDefined();
      expect(cell!.char).toBe('#');
    });

    it('pen default char is *', () => {
      const layer = new InkLayer();
      layer.draw(pen({ from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, color: [255, 0, 0] }));
      const cells = scanShader(layer, 2, 2);

      const cell = cells.get('0,0');
      expect(cell).toBeDefined();
      expect(cell!.char).toBe('*');
    });
  });

  describe('highlight mark', () => {
    it('fills the specified rect with bg color', () => {
      const layer = new InkLayer();
      layer.draw(
        highlight({
          rect: { x: 2, y: 1, width: 3, height: 2 },
          color: [255, 255, 0],
        }),
      );
      const cells = scanShader(layer, 10, 10);

      // All 6 cells in the rect should have bg set
      for (let y = 1; y <= 2; y++) {
        for (let x = 2; x <= 4; x++) {
          const cell = cells.get(`${x},${y}`);
          expect(cell).toBeDefined();
          expect(cell!.bg).toEqual([255, 255, 0]);
          // Highlight should NOT change the character
          expect(cell!.char).toBeUndefined();
        }
      }
      // Outside should have no marks
      expect(cells.has('1,1')).toBe(false);
      expect(cells.has('5,1')).toBe(false);
    });
  });

  describe('arrow mark', () => {
    it('arrow from (0,0) to (10,0) ends with right arrow', () => {
      const layer = new InkLayer();
      layer.draw(arrow({ from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, color: [255, 0, 0] }));
      const cells = scanShader(layer, 15, 3);

      // The endpoint should have an arrow character
      const endCell = cells.get('10,0');
      expect(endCell).toBeDefined();
      expect(endCell!.char).toBe('→');
    });

    it('arrow from (10,0) to (0,0) ends with left arrow', () => {
      const layer = new InkLayer();
      layer.draw(arrow({ from: { x: 10, y: 0 }, to: { x: 0, y: 0 }, color: [255, 0, 0] }));
      const cells = scanShader(layer, 15, 3);

      const endCell = cells.get('0,0');
      expect(endCell).toBeDefined();
      expect(endCell!.char).toBe('←');
    });

    it('arrow from (0,0) to (0,5) ends with down arrow', () => {
      const layer = new InkLayer();
      layer.draw(arrow({ from: { x: 0, y: 0 }, to: { x: 0, y: 5 }, color: [255, 0, 0] }));
      const cells = scanShader(layer, 3, 10);

      const endCell = cells.get('0,5');
      expect(endCell).toBeDefined();
      expect(endCell!.char).toBe('↓');
    });

    it('arrow from (0,5) to (0,0) ends with up arrow', () => {
      const layer = new InkLayer();
      layer.draw(arrow({ from: { x: 0, y: 5 }, to: { x: 0, y: 0 }, color: [255, 0, 0] }));
      const cells = scanShader(layer, 3, 10);

      const endCell = cells.get('0,0');
      expect(endCell).toBeDefined();
      expect(endCell!.char).toBe('↑');
    });
  });

  describe('annotation mark', () => {
    it('at (5,3) with "Hello" places 5 chars starting at x=5', () => {
      const layer = new InkLayer();
      layer.draw(annotation({ pos: { x: 5, y: 3 }, text: 'Hello', color: [0, 255, 0] }));
      const cells = scanShader(layer, 20, 10);

      expect(cells.get('5,3')!.char).toBe('H');
      expect(cells.get('6,3')!.char).toBe('e');
      expect(cells.get('7,3')!.char).toBe('l');
      expect(cells.get('8,3')!.char).toBe('l');
      expect(cells.get('9,3')!.char).toBe('o');
      // All should have fg color
      expect(cells.get('5,3')!.fg).toEqual([0, 255, 0]);
      // Nothing beyond the text
      expect(cells.has('10,3')).toBe(false);
      expect(cells.has('4,3')).toBe(false);
    });
  });

  describe('rect mark', () => {
    it('draws 4 edges', () => {
      const layer = new InkLayer();
      layer.draw(rect({ rect: { x: 2, y: 2, width: 5, height: 4 }, color: [0, 0, 255] }));
      const cells = scanShader(layer, 15, 15);

      // Top edge: y=2, x=2..6
      for (let x = 2; x <= 6; x++) {
        expect(cells.has(`${x},2`)).toBe(true);
      }
      // Bottom edge: y=5, x=2..6
      for (let x = 2; x <= 6; x++) {
        expect(cells.has(`${x},5`)).toBe(true);
      }
      // Left edge: x=2, y=2..5
      for (let y = 2; y <= 5; y++) {
        expect(cells.has(`2,${y}`)).toBe(true);
      }
      // Right edge: x=6, y=2..5
      for (let y = 2; y <= 5; y++) {
        expect(cells.has(`6,${y}`)).toBe(true);
      }
      // Interior should be empty (not filled)
      expect(cells.has('4,3')).toBe(false);
      expect(cells.has('4,4')).toBe(false);
    });

    it('with fill=true also fills interior', () => {
      const layer = new InkLayer();
      layer.draw(
        rect({
          rect: { x: 2, y: 2, width: 5, height: 4 },
          color: [0, 0, 255],
          fill: true,
        }),
      );
      const cells = scanShader(layer, 15, 15);

      // Interior should be filled
      for (let y = 2; y <= 5; y++) {
        for (let x = 2; x <= 6; x++) {
          expect(cells.has(`${x},${y}`)).toBe(true);
        }
      }
    });
  });

  describe('circle mark', () => {
    it('at center (10,10) radius 5 produces roughly circular points', () => {
      const layer = new InkLayer();
      layer.draw(circle({ center: { x: 10, y: 10 }, radius: 5, color: [255, 0, 255] }));
      const cells = scanShader(layer, 25, 25);

      // Cardinal points should be present
      expect(cells.has('10,5')).toBe(true); // top
      expect(cells.has('10,15')).toBe(true); // bottom
      expect(cells.has('5,10')).toBe(true); // left
      expect(cells.has('15,10')).toBe(true); // right

      // Center should NOT be set (outline only)
      expect(cells.has('10,10')).toBe(false);

      // All cells should have the correct fg color
      for (const [, cell] of cells) {
        expect(cell!.fg).toEqual([255, 0, 255]);
      }
    });
  });
});

// ── Shader Tests ─────────────────────────────────────────────────────────────

describe('Shader behavior', () => {
  it('shader() returns a CellShader with name "ink"', () => {
    const layer = new InkLayer();
    const shader = layer.shader();
    expect(shader.name).toBe('ink');
    expect(typeof shader.fn).toBe('function');
  });

  it('overlay mode: ink fg overrides render fg at marked positions', () => {
    const layer = new InkLayer({ blend: 'overlay' });
    layer.draw(annotation({ pos: { x: 0, y: 0 }, text: 'X', color: [255, 0, 0] }));

    const shader = layer.shader();
    const renderCell = makeCell({ char: 'A', fg: [0, 255, 0] });
    const result = shader.fn(0, 0, renderCell, makeUniforms(), noNeighbors);

    expect(result).not.toBeNull();
    expect(result!.char).toBe('X');
    expect(result!.fg).toEqual([255, 0, 0]);
  });

  it('overlay mode: unmarked positions pass through unchanged', () => {
    const layer = new InkLayer({ blend: 'overlay' });
    layer.draw(annotation({ pos: { x: 5, y: 5 }, text: 'X', color: [255, 0, 0] }));

    const shader = layer.shader();
    const renderCell = makeCell({ char: 'A', fg: [0, 255, 0] });
    const result = shader.fn(0, 0, renderCell, makeUniforms(), noNeighbors);

    // No ink at (0,0), should return null (pass through)
    expect(result).toBeNull();
  });

  it('underlay mode: render fg takes priority over ink fg', () => {
    const layer = new InkLayer({ blend: 'underlay' });
    layer.draw(annotation({ pos: { x: 0, y: 0 }, text: 'X', color: [255, 0, 0] }));

    const shader = layer.shader();
    // Render cell HAS fg — underlay should not override it
    const renderCell = makeCell({ char: 'A', fg: [0, 255, 0], bg: [0, 0, 128] });
    const result = shader.fn(0, 0, renderCell, makeUniforms(), noNeighbors);

    // Render has both fg and bg, so underlay should NOT override
    expect(result).toBeNull();
  });

  it('underlay mode: ink shows through when render has no fg/bg', () => {
    const layer = new InkLayer({ blend: 'underlay' });
    layer.draw(annotation({ pos: { x: 0, y: 0 }, text: 'X', color: [255, 0, 0] }));

    const shader = layer.shader();
    // Render cell has NO fg/bg — underlay should fill in
    const renderCell = makeCell({ char: ' ', fg: null, bg: null });
    const result = shader.fn(0, 0, renderCell, makeUniforms(), noNeighbors);

    expect(result).not.toBeNull();
    expect(result!.char).toBe('X');
    expect(result!.fg).toEqual([255, 0, 0]);
  });

  it('replace mode: ink completely replaces render cell', () => {
    const layer = new InkLayer({ blend: 'replace' });
    layer.draw(annotation({ pos: { x: 0, y: 0 }, text: 'X', color: [255, 0, 0] }));

    const shader = layer.shader();
    const renderCell = makeCell({ char: 'A', fg: [0, 255, 0], bg: [0, 0, 128] });
    const result = shader.fn(0, 0, renderCell, makeUniforms(), noNeighbors);

    expect(result).not.toBeNull();
    expect(result!.char).toBe('X');
    expect(result!.fg).toEqual([255, 0, 0]);
  });

  it('replace mode: should return null when ink cell has no properties set', () => {
    // S6 Bug: replace mode returns empty ShaderOutput {} when no ink properties
    // are set, signaling a mutation when nothing actually changed. The overlay
    // and underlay modes correctly return null in this case, but replace does not.
    // This wastes render cycles on no-op shader outputs.
    const layer = new InkLayer({ blend: 'replace' });
    // Draw a highlight mark (sets only bg, no char or fg) at position (5,5)
    layer.draw(
      highlight({
        rect: { x: 5, y: 5, width: 1, height: 1 },
        color: [255, 255, 0],
      }),
    );

    const shader = layer.shader();
    // Query a position that IS in the ink grid but where the ink cell
    // has bg set. This should return a result with bg.
    const resultAtInk = shader.fn(5, 5, makeCell(), makeUniforms(), noNeighbors);
    expect(resultAtInk).not.toBeNull();
    expect(resultAtInk!.bg).toEqual([255, 255, 0]);

    // Now query a position NOT in the ink grid at all -- should return null
    const resultEmpty = shader.fn(0, 0, makeCell(), makeUniforms(), noNeighbors);
    expect(resultEmpty).toBeNull();
  });

  it('shader respects global opacity (mix colors)', () => {
    const layer = new InkLayer({ blend: 'overlay', opacity: 0.5 });
    layer.draw(annotation({ pos: { x: 0, y: 0 }, text: 'X', color: [255, 0, 0] }));

    const shader = layer.shader();
    const renderCell = makeCell({ char: 'A', fg: [0, 0, 0] });
    const result = shader.fn(0, 0, renderCell, makeUniforms(), noNeighbors);

    expect(result).not.toBeNull();
    // fg should be blended: 50% of [255,0,0] + 50% of [0,0,0] ≈ [128,0,0]
    expect(result!.fg![0]).toBeGreaterThanOrEqual(126);
    expect(result!.fg![0]).toBeLessThanOrEqual(128);
    expect(result!.fg![1]).toBe(0);
    expect(result!.fg![2]).toBe(0);
  });

  it('multiple marks composited correctly (later marks on top)', () => {
    const layer = new InkLayer();
    // First: red annotation at (0,0)
    layer.draw(annotation({ pos: { x: 0, y: 0 }, text: 'A', color: [255, 0, 0] }));
    // Second: green annotation at (0,0) — should override
    layer.draw(annotation({ pos: { x: 0, y: 0 }, text: 'B', color: [0, 255, 0] }));

    const shader = layer.shader();
    const result = shader.fn(0, 0, makeCell(), makeUniforms(), noNeighbors);

    expect(result).not.toBeNull();
    expect(result!.char).toBe('B');
    expect(result!.fg).toEqual([0, 255, 0]);
  });
});

// ── Convenience Function Tests ───────────────────────────────────────────────

describe('Convenience functions', () => {
  it('pen() returns correct InkMark type', () => {
    const mark = pen({ from: { x: 0, y: 0 }, to: { x: 5, y: 0 }, color: [255, 0, 0] });
    expect(mark.type).toBe('pen');
    if (mark.type === 'pen') {
      expect(mark.from).toEqual({ x: 0, y: 0 });
      expect(mark.to).toEqual({ x: 5, y: 0 });
      expect(mark.color).toEqual([255, 0, 0]);
    }
  });

  it('pen() with custom char includes char', () => {
    const mark = pen({ from: { x: 0, y: 0 }, to: { x: 5, y: 0 }, color: [255, 0, 0], char: '#' });
    if (mark.type === 'pen') {
      expect(mark.char).toBe('#');
    }
  });

  it('highlight() returns correct InkMark type', () => {
    const mark = highlight({
      rect: { x: 0, y: 0, width: 5, height: 3 },
      color: [255, 255, 0],
      opacity: 0.5,
    });
    expect(mark.type).toBe('highlight');
    if (mark.type === 'highlight') {
      expect(mark.rect).toEqual({ x: 0, y: 0, width: 5, height: 3 });
      expect(mark.color).toEqual([255, 255, 0]);
      expect(mark.opacity).toBe(0.5);
    }
  });

  it('arrow() returns correct InkMark type', () => {
    const mark = arrow({ from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, color: [0, 0, 255] });
    expect(mark.type).toBe('arrow');
    if (mark.type === 'arrow') {
      expect(mark.from).toEqual({ x: 0, y: 0 });
      expect(mark.to).toEqual({ x: 10, y: 0 });
      expect(mark.color).toEqual([0, 0, 255]);
    }
  });

  it('annotation() returns correct InkMark type', () => {
    const mark = annotation({ pos: { x: 5, y: 3 }, text: 'Hello', color: [0, 255, 0] });
    expect(mark.type).toBe('annotation');
    if (mark.type === 'annotation') {
      expect(mark.pos).toEqual({ x: 5, y: 3 });
      expect(mark.text).toBe('Hello');
      expect(mark.color).toEqual([0, 255, 0]);
    }
  });

  it('rect() returns correct InkMark type', () => {
    const mark = rect({ rect: { x: 0, y: 0, width: 5, height: 3 }, color: [128, 128, 128] });
    expect(mark.type).toBe('rect');
    if (mark.type === 'rect') {
      expect(mark.rect).toEqual({ x: 0, y: 0, width: 5, height: 3 });
      expect(mark.fill).toBeUndefined();
    }
  });

  it('rect() with fill returns correct InkMark type', () => {
    const mark = rect({ rect: { x: 0, y: 0, width: 5, height: 3 }, color: [128, 128, 128], fill: true });
    if (mark.type === 'rect') {
      expect(mark.fill).toBe(true);
    }
  });

  it('circle() returns correct InkMark type', () => {
    const mark = circle({ center: { x: 10, y: 10 }, radius: 5, color: [255, 0, 255] });
    expect(mark.type).toBe('circle');
    if (mark.type === 'circle') {
      expect(mark.center).toEqual({ x: 10, y: 10 });
      expect(mark.radius).toBe(5);
      expect(mark.color).toEqual([255, 0, 255]);
    }
  });
});
