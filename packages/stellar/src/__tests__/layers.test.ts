import { color } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { canvas } from '../canvas.js';
import { InkLayer, pen } from '../ink.js';
import type { HitRegion } from '../interactive.js';
import {
  barDataLayer,
  barRange,
  type ChartLayer,
  composeChart,
  customCanvasLayer,
  customChromeLayer,
  dataRange,
  gridLayer,
  hitRegionLayer,
  inkShaderLayer,
  type LayerContext,
  legendLayer,
  lineDataLayer,
  scatterDataLayer,
  scatterRange,
  titleLayer,
  xAxisLayer,
  yAxisLayer,
} from '../layers.js';

// ── dataRange / scatterRange / barRange ─────────────────────────────────

describe('dataRange', () => {
  it('returns default for empty data', () => {
    const r = dataRange([]);
    expect(r.xRange).toEqual([0, 1]);
    expect(r.yRange).toEqual([0, 1]);
  });

  it('computes ranges for a simple series', () => {
    const r = dataRange([2, 5, 3, 8, 1]);
    expect(r.xRange).toEqual([0, 4]);
    expect(r.yRange).toEqual([1, 8]);
  });

  it('handles single-value data (prevents zero-range)', () => {
    const r = dataRange([7]);
    expect(r.xRange).toEqual([0, 1]);
    expect(r.yRange).toEqual([7, 8]); // maxY bumped to minY + 1
  });

  it('handles constant data (all same value)', () => {
    const r = dataRange([3, 3, 3]);
    expect(r.yRange[1]).toBeGreaterThan(r.yRange[0]);
  });
});

describe('scatterRange', () => {
  it('returns default for empty data', () => {
    const r = scatterRange([]);
    expect(r.xRange).toEqual([0, 1]);
    expect(r.yRange).toEqual([0, 1]);
  });

  it('computes ranges from scatter points', () => {
    const data: [number, number][] = [
      [1, 10],
      [5, 2],
      [3, 7],
    ];
    const r = scatterRange(data);
    expect(r.xRange).toEqual([1, 5]);
    expect(r.yRange).toEqual([2, 10]);
  });

  it('handles single-point scatter (prevents zero-range)', () => {
    const r = scatterRange([[4, 6]]);
    expect(r.xRange[1]).toBeGreaterThan(r.xRange[0]);
    expect(r.yRange[1]).toBeGreaterThan(r.yRange[0]);
  });
});

describe('barRange', () => {
  it('returns default for empty values', () => {
    const r = barRange([]);
    expect(r.xRange).toEqual([0, 1]);
    expect(r.yRange).toEqual([0, 1]);
  });

  it('computes ranges for positive bars', () => {
    const r = barRange([3, 7, 2]);
    expect(r.xRange).toEqual([0, 2]);
    expect(r.yRange[0]).toBeLessThanOrEqual(0);
    expect(r.yRange[1]).toBeGreaterThanOrEqual(7);
  });

  it('includes zero for negative bars', () => {
    const r = barRange([-5, -2, -8]);
    expect(r.yRange[0]).toBeLessThanOrEqual(-8);
    expect(r.yRange[1]).toBeGreaterThanOrEqual(0);
  });

  it('handles mixed positive/negative', () => {
    const r = barRange([-3, 5, -1, 4]);
    expect(r.yRange[0]).toBeLessThanOrEqual(-3);
    expect(r.yRange[1]).toBeGreaterThanOrEqual(5);
  });
});

// ── composeChart orchestrator ───────────────────────────────────────────

describe('composeChart', () => {
  it('returns a ComposedChart with toString and toVNode', () => {
    const result = composeChart(10, 5, []);
    expect(typeof result.toString).toBe('function');
    expect(typeof result.toVNode).toBe('function');
    expect(result.hitRegions).toEqual([]);
    expect(result.shaders).toEqual([]);
    expect(result.canvas).toBeDefined();
  });

  it('renders an empty chart as non-empty string', () => {
    const result = composeChart(10, 5, []);
    const str = result.toString();
    expect(typeof str).toBe('string');
    expect(str.length).toBeGreaterThan(0);
  });

  it('toVNode returns a VNode', () => {
    const result = composeChart(10, 5, []);
    const node = result.toVNode();
    expect(node).toBeDefined();
    expect(node.kind).toBeDefined();
  });

  it('respects xRange and yRange opts', () => {
    const result = composeChart(10, 5, [], {
      xRange: [0, 100],
      yRange: [-10, 50],
    });
    expect(result.toString()).toBeDefined();
  });

  it('sorts layers by zIndex', () => {
    const order: string[] = [];

    const layerA: ChartLayer = {
      name: 'a',
      zIndex: 10,
      render() {
        order.push('a');
        return { type: 'none' };
      },
    };

    const layerB: ChartLayer = {
      name: 'b',
      zIndex: -5,
      render() {
        order.push('b');
        return { type: 'none' };
      },
    };

    const layerC: ChartLayer = {
      name: 'c',
      zIndex: 0,
      render() {
        order.push('c');
        return { type: 'none' };
      },
    };

    composeChart(10, 5, [layerA, layerB, layerC]);
    expect(order).toEqual(['b', 'c', 'a']);
  });

  it('collects hit regions from hitRegion layers', () => {
    const regions: HitRegion[] = [{ x: 0, y: 0, width: 5, height: 5, id: 'r1', seriesIndex: 0, pointIndex: 0, value: 1 }];
    const result = composeChart(10, 5, [hitRegionLayer(regions)]);
    expect(result.hitRegions).toHaveLength(1);
    expect(result.hitRegions[0]!.id).toBe('r1');
  });

  it('collects shaders from shader layers', () => {
    const ink = new InkLayer();
    ink.draw(pen({ from: { x: 0, y: 0 }, to: { x: 5, y: 5 }, color: [255, 0, 0] }));

    const result = composeChart(10, 5, [inkShaderLayer(ink)]);
    expect(result.shaders).toHaveLength(1);
    expect(result.shaders[0]).toBeDefined();
  });
});

// ── Individual layer factories ──────────────────────────────────────────

describe('gridLayer', () => {
  it('creates a layer with name "grid" and negative zIndex', () => {
    const layer = gridLayer({ horizontal: true });
    expect(layer.name).toBe('grid');
    expect(layer.zIndex).toBe(-10);
  });

  it('renders without error', () => {
    const result = composeChart(20, 8, [gridLayer({ horizontal: true })], {
      xRange: [0, 10],
      yRange: [0, 100],
    });
    expect(result.toString()).toBeDefined();
  });

  it('respects custom zIndex', () => {
    const layer = gridLayer({ vertical: true }, 5);
    expect(layer.zIndex).toBe(5);
  });
});

describe('lineDataLayer', () => {
  it('creates a layer with name "data:line"', () => {
    const layer = lineDataLayer([1, 2, 3]);
    expect(layer.name).toBe('data:line');
    expect(layer.zIndex).toBe(0);
  });

  it('returns none for empty data', () => {
    const layer = lineDataLayer([]);
    const ctx = makeCtx(10, 5);
    expect(layer.render(ctx).type).toBe('none');
  });

  it('draws pixels onto canvas (filled mode)', () => {
    const data = [0, 5, 10, 5, 0];
    const ranges = dataRange(data);
    const result = composeChart(10, 5, [lineDataLayer(data, { filled: true })], ranges);
    const str = result.toString();
    // Should have braille characters (not all blank)
    expect(str).not.toBe(composeChart(10, 5, []).toString());
  });

  it('draws line mode (not filled)', () => {
    const data = [1, 4, 2, 8, 5];
    const ranges = dataRange(data);
    const result = composeChart(10, 5, [lineDataLayer(data, { filled: false })], ranges);
    expect(result.toString()).toBeDefined();
  });

  it('handles single data point', () => {
    const data = [42];
    const ranges = dataRange(data);
    const result = composeChart(10, 5, [lineDataLayer(data, { filled: false })], ranges);
    expect(result.toString()).toBeDefined();
  });
});

describe('barDataLayer', () => {
  it('creates a layer with name "data:bar"', () => {
    const layer = barDataLayer([3, 7, 2]);
    expect(layer.name).toBe('data:bar');
  });

  it('returns none for empty values', () => {
    const layer = barDataLayer([]);
    const ctx = makeCtx(10, 5);
    expect(layer.render(ctx).type).toBe('none');
  });

  it('returns none for all-zero values', () => {
    const layer = barDataLayer([0, 0, 0]);
    const ctx = makeCtx(10, 5);
    expect(layer.render(ctx).type).toBe('none');
  });

  it('draws bars onto canvas', () => {
    const values = [3, 7, 2, 5];
    const ranges = barRange(values);
    const result = composeChart(20, 8, [barDataLayer(values)], ranges);
    const str = result.toString();
    expect(str).not.toBe(composeChart(20, 8, []).toString());
  });

  it('handles negative values', () => {
    const values = [-3, 5, -1, 4];
    const ranges = barRange(values);
    const result = composeChart(20, 8, [barDataLayer(values)], ranges);
    expect(result.toString()).toBeDefined();
  });
});

describe('scatterDataLayer', () => {
  it('creates a layer with name "data:scatter"', () => {
    const layer = scatterDataLayer([
      [1, 2],
      [3, 4],
    ]);
    expect(layer.name).toBe('data:scatter');
  });

  it('returns none for empty data', () => {
    const layer = scatterDataLayer([]);
    const ctx = makeCtx(10, 5);
    expect(layer.render(ctx).type).toBe('none');
  });

  it('draws scatter points onto canvas', () => {
    const data: [number, number][] = [
      [1, 10],
      [5, 2],
      [3, 7],
    ];
    const ranges = scatterRange(data);
    const result = composeChart(20, 8, [scatterDataLayer(data)], ranges);
    const str = result.toString();
    expect(str).not.toBe(composeChart(20, 8, []).toString());
  });

  it('handles dotRadius=0 (single pixel per point)', () => {
    const data: [number, number][] = [
      [0, 0],
      [10, 10],
    ];
    const ranges = scatterRange(data);
    const result = composeChart(20, 8, [scatterDataLayer(data, { dotRadius: 0 })], ranges);
    expect(result.toString()).toBeDefined();
  });
});

// ── Chrome layers ───────────────────────────────────────────────────────

describe('titleLayer', () => {
  it('creates a layer named "chrome:title"', () => {
    const layer = titleLayer({ title: 'Test' });
    expect(layer.name).toBe('chrome:title');
    expect(layer.zIndex).toBe(100);
  });

  it('adds title above the chart body', () => {
    const result = composeChart(20, 5, [titleLayer({ title: 'My Title' })]);
    const str = result.toString();
    expect(str).toContain('My Title');
  });

  it('returns none when no title given', () => {
    const layer = titleLayer({} as any);
    const ctx = makeCtx(20, 5);
    const output = layer.render(ctx);
    // Should either be none or chrome with empty above
    expect(output.type === 'none' || output.type === 'chrome').toBe(true);
  });
});

describe('yAxisLayer', () => {
  it('creates a layer named "chrome:y-axis"', () => {
    const layer = yAxisLayer();
    expect(layer.name).toBe('chrome:y-axis');
    expect(layer.zIndex).toBe(90);
  });

  it('produces left chrome labels', () => {
    const result = composeChart(20, 5, [yAxisLayer()], {
      xRange: [0, 10],
      yRange: [0, 100],
    });
    const str = result.toString();
    expect(str.length).toBeGreaterThan(0);
  });
});

describe('xAxisLayer', () => {
  it('creates a layer named "chrome:x-axis"', () => {
    const layer = xAxisLayer();
    expect(layer.name).toBe('chrome:x-axis');
    expect(layer.zIndex).toBe(90);
  });

  it('produces below chrome labels', () => {
    const result = composeChart(20, 5, [xAxisLayer()], {
      xRange: [0, 10],
      yRange: [0, 100],
    });
    const str = result.toString();
    const lines = str.split('\n');
    // Below chrome adds lines after the chart body
    expect(lines.length).toBeGreaterThan(5);
  });

  it('includes xLabel when provided', () => {
    const result = composeChart(30, 5, [xAxisLayer({ xLabel: 'Time (s)' })], {
      xRange: [0, 10],
      yRange: [0, 100],
    });
    expect(result.toString()).toContain('Time (s)');
  });
});

describe('legendLayer', () => {
  it('creates a layer named "chrome:legend"', () => {
    const layer = legendLayer({ entries: [{ label: 'A', color: color.red }] });
    expect(layer.name).toBe('chrome:legend');
    expect(layer.zIndex).toBe(95);
  });

  it('places legend at bottom by default', () => {
    const result = composeChart(30, 5, [legendLayer({ entries: [{ label: 'Series A', color: color.red }] })]);
    const str = result.toString();
    expect(str).toContain('Series A');
  });

  it('places legend at top when position=top', () => {
    const result = composeChart(30, 5, [
      legendLayer({
        entries: [{ label: 'Top Legend', color: color.green }],
        position: 'top',
      }),
    ]);
    const str = result.toString();
    expect(str).toContain('Top Legend');
  });
});

// ── Overlay layers ──────────────────────────────────────────────────────

describe('hitRegionLayer', () => {
  it('creates a layer named "interactive:hit-regions"', () => {
    const layer = hitRegionLayer([]);
    expect(layer.name).toBe('interactive:hit-regions');
    expect(layer.zIndex).toBe(80);
  });

  it('returns hitRegions output', () => {
    const regions: HitRegion[] = [
      { x: 0, y: 0, width: 10, height: 10, id: 'bar-0', seriesIndex: 0, pointIndex: 0, value: 1 },
      { x: 10, y: 0, width: 10, height: 10, id: 'bar-1', seriesIndex: 0, pointIndex: 1, value: 2 },
    ];
    const layer = hitRegionLayer(regions);
    const ctx = makeCtx(20, 5);
    const output = layer.render(ctx);
    expect(output.type).toBe('hitRegions');
    if (output.type === 'hitRegions') {
      expect(output.regions).toHaveLength(2);
    }
  });
});

describe('inkShaderLayer', () => {
  it('creates a layer named "shader:ink"', () => {
    const ink = new InkLayer();
    const layer = inkShaderLayer(ink);
    expect(layer.name).toBe('shader:ink');
    expect(layer.zIndex).toBe(50);
  });

  it('returns shader output', () => {
    const ink = new InkLayer();
    ink.draw(pen({ from: { x: 0, y: 0 }, to: { x: 10, y: 10 }, color: [255, 0, 0] }));
    const layer = inkShaderLayer(ink);
    const ctx = makeCtx(20, 5);
    const output = layer.render(ctx);
    expect(output.type).toBe('shader');
    if (output.type === 'shader') {
      expect(output.shader).toBeDefined();
    }
  });
});

// ── Custom layers ───────────────────────────────────────────────────────

describe('customCanvasLayer', () => {
  it('calls drawFn with the context', () => {
    let received: LayerContext | null = null;
    const layer = customCanvasLayer('custom', (ctx) => {
      received = ctx;
    });
    expect(layer.name).toBe('custom');

    composeChart(10, 5, [layer]);
    expect(received).not.toBeNull();
    expect(received!.canvas).toBeDefined();
  });

  it('returns canvas output type', () => {
    const layer = customCanvasLayer('my-draw', () => {});
    const ctx = makeCtx(10, 5);
    expect(layer.render(ctx).type).toBe('canvas');
  });
});

describe('customChromeLayer', () => {
  it('calls chromeFn and returns chrome output', () => {
    const layer = customChromeLayer('custom-chrome', (ctx) => ({
      above: [`Width: ${ctx.cellWidth}`],
    }));
    expect(layer.name).toBe('custom-chrome');

    const result = composeChart(20, 5, [layer]);
    expect(result.toString()).toContain('Width: 20');
  });
});

// ── Integration: multiple layers composed ───────────────────────────────

describe('layer composition integration', () => {
  it('composes data + grid + title + axes + legend', () => {
    const data = [2, 5, 3, 8, 5, 1];
    const ranges = dataRange(data);
    const result = composeChart(
      30,
      8,
      [
        gridLayer({ horizontal: true }),
        lineDataLayer(data, { filled: true }),
        titleLayer({ title: 'Revenue' }),
        yAxisLayer({ yFormat: (v: number) => `$${v}` }),
        xAxisLayer(),
        legendLayer({
          entries: [{ label: 'Q1', color: color.blue }],
          position: 'bottom',
        }),
      ],
      ranges,
    );

    const str = result.toString();
    expect(str).toContain('Revenue');
    expect(str).toContain('Q1');
    // Should have more lines than just the chart body (chrome added)
    const lines = str.split('\n');
    expect(lines.length).toBeGreaterThan(8);
  });

  it('composes bar data with custom canvas overlay', () => {
    const values = [4, 7, 2, 9];
    const ranges = barRange(values);
    let customCalled = false;

    const result = composeChart(
      20,
      6,
      [
        barDataLayer(values),
        customCanvasLayer(
          'threshold',
          (ctx) => {
            customCalled = true;
            // Draw a horizontal threshold line
            const y = Math.round(ctx.plotBounds.height * 0.5);
            for (let x = 0; x < ctx.plotBounds.width; x++) {
              ctx.canvas.set(x, y);
            }
          },
          5,
        ),
      ],
      ranges,
    );

    expect(customCalled).toBe(true);
    expect(result.toString()).toBeDefined();
  });

  it('collects hit regions and shaders from mixed layers', () => {
    const regions: HitRegion[] = [{ x: 0, y: 0, width: 5, height: 5, id: 'r1', seriesIndex: 0, pointIndex: 0, value: 1 }];
    const ink = new InkLayer();
    ink.draw(pen({ from: { x: 0, y: 0 }, to: { x: 5, y: 5 }, color: [255, 0, 0] }));

    const result = composeChart(20, 8, [lineDataLayer([1, 2, 3]), hitRegionLayer(regions), inkShaderLayer(ink)], dataRange([1, 2, 3]));

    expect(result.hitRegions).toHaveLength(1);
    expect(result.shaders).toHaveLength(1);
  });

  it('handles layers with same zIndex (stable sort)', () => {
    const order: string[] = [];

    const a: ChartLayer = {
      name: 'a',
      zIndex: 0,
      render() {
        order.push('a');
        return { type: 'none' };
      },
    };
    const b: ChartLayer = {
      name: 'b',
      zIndex: 0,
      render() {
        order.push('b');
        return { type: 'none' };
      },
    };
    const c: ChartLayer = {
      name: 'c',
      zIndex: 0,
      render() {
        order.push('c');
        return { type: 'none' };
      },
    };

    composeChart(10, 5, [a, b, c]);
    // Stable sort should preserve insertion order for equal zIndex
    expect(order).toEqual(['a', 'b', 'c']);
  });
});

// ── Chrome composition (applyChrome internals via integration) ──────────

describe('chrome composition', () => {
  it('left chrome pads body lines with Y-axis labels', () => {
    const result = composeChart(20, 5, [yAxisLayer()], {
      xRange: [0, 10],
      yRange: [0, 100],
    });
    const str = result.toString();
    // Left chrome should add padding before chart body lines
    const lines = str.split('\n');
    // At least some lines should have leading label + space
    const hasLeading = lines.some((l) => /^\s*\d/.test(l));
    expect(hasLeading).toBe(true);
  });

  it('below chrome appears after the chart body', () => {
    const result = composeChart(20, 5, [xAxisLayer()], {
      xRange: [0, 10],
      yRange: [0, 100],
    });
    const lines = result.toString().split('\n');
    // 5 body lines + at least 1 below line
    expect(lines.length).toBeGreaterThan(5);
  });

  it('right chrome appended to body lines', () => {
    const result = composeChart(20, 5, [
      legendLayer({
        entries: [{ label: 'R', color: color.red }],
        position: 'right',
      }),
    ]);
    const lines = result.toString().split('\n');
    // First body line should have legend appended
    const firstLine = lines[0]!;
    expect(firstLine).toContain('R');
  });
});

// ── Helper to build a minimal LayerContext for unit-testing layers ───────

function makeCtx(width: number, height: number): LayerContext {
  const c = canvas(width, height);
  return {
    canvas: c,
    plotBounds: { x: 0, y: 0, width: c.pixelWidth, height: c.pixelHeight },
    xRange: [0, 10],
    yRange: [0, 100],
    cellWidth: width,
    cellHeight: height,
  };
}
