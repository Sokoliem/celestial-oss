/**
 * Composable Chart Layer Architecture
 *
 * Provides a layer-based system for building charts from independent,
 * composable parts. Each layer draws onto a shared BrailleCanvas or
 * produces chrome (text around the chart) or post-processing shaders.
 *
 * Layers are sorted by z-index and rendered in order. The system
 * supports:
 *
 *  - **Canvas layers**: Draw directly onto the pixel grid (grid, data viz).
 *  - **Chrome layers**: Produce text lines above/below/left/right of the
 *    chart body (title, axes, legend).
 *  - **Overlay layers**: Produce hit regions or shaders for interactivity.
 *
 * Usage:
 * ```ts
 * const composed = composeChart(40, 10, [
 *   gridLayer({ horizontal: true, style: 'dotted' }),
 *   lineDataLayer([1,4,2,8,5], { filled: true }),
 *   titleLayer({ title: 'My Chart' }),
 *   axisLayer({ yFormat: v => `${v}%` }),
 * ]);
 * console.log(composed.toString());
 * ```
 */

import { type Color, cellWidth, sanitizeTerminalText, sliceCells } from '@celestial/corona';
import type { CellShader, VNode } from '@celestial/nebula';
import { column, text as textNode } from '@celestial/nebula';
import { type BrailleCanvas, type CanvasMode, canvas } from './canvas.js';
import type { ChartResult } from './chart.js';
import {
  type AxisConfig,
  computeTicks,
  defaultFormat,
  drawGrid,
  type GridConfig,
  type LegendConfig,
  renderLegend,
  renderTitle,
  renderXTickLabels,
  renderYTickLabels,
  type TitleConfig,
} from './chart-utils.js';
import type { InkLayer } from './ink.js';
import type { HitRegion } from './interactive.js';
import { safeMax, safeMin } from './math-utils.js';
import { chartSize, finiteNumber, finiteValues, nonNegativeInteger, rangeRatio } from './validation.js';

function normalizeRange(value: [number, number] | undefined, fallback: [number, number]): [number, number] {
  return [finiteNumber(value?.[0], fallback[0]), finiteNumber(value?.[1], fallback[1])];
}

function safeChromeLine(value: string): string {
  return sanitizeTerminalText(value, { allowSgr: true, allowHyperlinks: false, controlPolicy: 'strip' }).replace(/[\r\n]/g, ' ');
}

function fitChromeLine(value: string, width: number): string {
  return sliceCells(safeChromeLine(value), nonNegativeInteger(width, 0), { trusted: true })[0];
}

// ── Core Types ───────────────────────────────────────────────────────────

/** The plot area bounds in sub-pixel coordinates. */
export interface PlotBounds {
  /** Left edge in sub-pixels. */
  readonly x: number;
  /** Top edge in sub-pixels. */
  readonly y: number;
  /** Width in sub-pixels. */
  readonly width: number;
  /** Height in sub-pixels. */
  readonly height: number;
}

/** Shared context passed to all layers during render. */
export interface LayerContext {
  /** The braille/sextant canvas to draw on. */
  readonly canvas: BrailleCanvas;
  /** The full plot area within the canvas (sub-pixel coordinates). */
  readonly plotBounds: PlotBounds;
  /** Data X range [min, max]. */
  readonly xRange: [number, number];
  /** Data Y range [min, max]. */
  readonly yRange: [number, number];
  /** Canvas dimensions in terminal cells. */
  readonly cellWidth: number;
  /** Canvas dimensions in terminal cells. */
  readonly cellHeight: number;
}

/** Chrome lines positioned around the chart body. */
export interface ChromeLines {
  /** Lines above the chart (e.g., title). */
  above?: string[];
  /** Lines below the chart (e.g., x-axis labels). */
  below?: string[];
  /** Per-row labels left of the chart body. */
  left?: string[];
  /** Per-row labels right of the chart body. */
  right?: string[];
}

/** Discriminated union for what a layer produces. */
export type LayerOutput =
  | { type: 'canvas' }
  | { type: 'chrome'; lines: ChromeLines }
  | { type: 'hitRegions'; regions: HitRegion[] }
  | { type: 'shader'; shader: CellShader }
  | { type: 'none' };

/**
 * A composable chart layer.
 *
 * Layers are sorted by `zIndex` (lower = drawn first = further back)
 * and their `render()` is called in order against the shared context.
 */
export interface ChartLayer {
  /** Unique name for this layer (e.g., 'grid', 'data:line', 'axis-y'). */
  readonly name: string;
  /** Z-order for rendering (lower = drawn first). Default: 0. */
  readonly zIndex: number;
  /** Render this layer into the given context. */
  render(ctx: LayerContext): LayerOutput;
}

/** The result of composing chart layers. */
export interface ComposedChart extends ChartResult {
  /** All hit regions produced by interactive layers. */
  readonly hitRegions: HitRegion[];
  /** All shaders produced by shader layers. */
  readonly shaders: CellShader[];
  /** The underlying canvas for further manipulation. */
  readonly canvas: BrailleCanvas;
}

// ── composeChart Orchestrator ────────────────────────────────────────────

/**
 * Compose multiple layers into a final chart.
 *
 * 1. Creates a shared BrailleCanvas.
 * 2. Computes data ranges from data layers.
 * 3. Sorts layers by zIndex.
 * 4. Renders each layer, collecting canvas draws, chrome, hit regions,
 *    and shaders.
 * 5. Composes the final string output with chrome.
 *
 * @param width - Canvas width in terminal cells.
 * @param height - Canvas height in terminal cells.
 * @param layers - Array of chart layers to compose.
 * @param opts - Optional configuration.
 * @returns A ComposedChart with render methods and collected metadata.
 */
export function composeChart(
  width: number,
  height: number,
  layers: ChartLayer[],
  opts?: {
    mode?: CanvasMode;
    /** Override data X range. */
    xRange?: [number, number];
    /** Override data Y range. */
    yRange?: [number, number];
  },
): ComposedChart {
  const size = chartSize(width, height, 1, 1);
  const c = canvas(size.width, size.height, opts?.mode);
  const xRange = normalizeRange(opts?.xRange, [0, 1]);
  const yRange = normalizeRange(opts?.yRange, [0, 1]);

  const plotBounds: PlotBounds = {
    x: 0,
    y: 0,
    width: c.pixelWidth,
    height: c.pixelHeight,
  };

  const ctx: LayerContext = {
    canvas: c,
    plotBounds,
    xRange,
    yRange,
    cellWidth: size.width,
    cellHeight: size.height,
  };

  // Sort layers by z-index (stable sort preserves insertion order for equal z)
  const sorted = [...layers].sort((a, b) => finiteNumber(a.zIndex, 0) - finiteNumber(b.zIndex, 0));

  const allChrome: ChromeLines[] = [];
  const allHitRegions: HitRegion[] = [];
  const allShaders: CellShader[] = [];

  for (const layer of sorted) {
    const output = layer.render(ctx);
    switch (output.type) {
      case 'canvas':
        // Canvas layer already drew onto ctx.canvas
        break;
      case 'chrome':
        allChrome.push(output.lines);
        break;
      case 'hitRegions':
        allHitRegions.push(
          ...output.regions.map((region) => ({
            ...region,
            value: Array.isArray(region.value) ? ([...region.value] as [number, number]) : region.value,
          })),
        );
        break;
      case 'shader':
        allShaders.push(output.shader);
        break;
      case 'none':
        break;
    }
  }

  // Compose final string
  function composeString(): string {
    const chartBody = c.render();
    return applyChrome(chartBody, allChrome, size.width);
  }

  function composeVNode(): VNode {
    const content = composeString();
    if (!content.includes('\n')) return textNode(content);
    return column(...content.split('\n').map((line) => textNode(line)));
  }

  return {
    toString: composeString,
    toVNode: composeVNode,
    hitRegions: allHitRegions,
    shaders: allShaders,
    canvas: c,
  };
}

// ── Chrome Composition ───────────────────────────────────────────────────

function applyChrome(chartBody: string, chromes: ChromeLines[], width: number): string {
  // Merge all chrome into a single set
  const above: string[] = [];
  const below: string[] = [];
  const leftPerRow: string[][] = [];
  const rightPerRow: string[][] = [];

  for (const chrome of chromes) {
    if (chrome.above) above.push(...chrome.above.map((line) => safeChromeLine(line)));
    if (chrome.below) below.push(...chrome.below.map((line) => safeChromeLine(line)));
    if (chrome.left) {
      for (let i = 0; i < chrome.left.length; i++) {
        if (!leftPerRow[i]) leftPerRow[i] = [];
        leftPerRow[i]!.push(fitChromeLine(chrome.left[i]!, width));
      }
    }
    if (chrome.right) {
      for (let i = 0; i < chrome.right.length; i++) {
        if (!rightPerRow[i]) rightPerRow[i] = [];
        rightPerRow[i]!.push(safeChromeLine(chrome.right[i]!));
      }
    }
  }

  const bodyLines = chartBody.split('\n');
  const lines: string[] = [];

  // Above
  lines.push(...above);

  // Compute left padding width
  let leftWidth = 0;
  for (const row of leftPerRow) {
    if (row) {
      for (const label of row) {
        leftWidth = Math.max(leftWidth, cellWidth(label));
      }
    }
  }
  const pad = leftWidth > 0 ? leftWidth + 1 : 0;

  // Body with left/right chrome
  for (let i = 0; i < bodyLines.length; i++) {
    const leftLabels = leftPerRow[i];
    const rightLabels = rightPerRow[i];

    let prefix = '';
    if (pad > 0) {
      if (leftLabels && leftLabels.length > 0) {
        const label = leftLabels[leftLabels.length - 1]!;
        prefix = `${' '.repeat(Math.max(0, leftWidth - cellWidth(label)))}${label} `;
      } else {
        prefix = ' '.repeat(pad);
      }
    }

    let suffix = '';
    if (rightLabels && rightLabels.length > 0) {
      suffix = '  ' + rightLabels.join('  ');
    }

    lines.push(prefix + bodyLines[i] + suffix);
  }

  // Below
  if (below.length > 0) {
    for (const line of below) {
      lines.push(' '.repeat(pad) + line);
    }
  }

  return lines.join('\n');
}

// ── Layer Factories ──────────────────────────────────────────────────────

/**
 * Create a grid layer that draws horizontal/vertical grid lines.
 * Uses the existing `drawGrid()` infrastructure from chart-utils.
 *
 * @param config - Grid configuration (style, horizontal, vertical).
 * @param zIndex - Z-order (default: -10, drawn before data).
 */
export function gridLayer(config: GridConfig, zIndex: number = -10): ChartLayer {
  return {
    name: 'grid',
    zIndex,
    render(ctx: LayerContext): LayerOutput {
      const { canvas: c, plotBounds, xRange, yRange } = ctx;
      const [minX, maxX] = xRange;
      const [minY, maxY] = yRange;
      const xTicks = computeTicks(minX, maxX, 5).map((v) => rangeRatio(v, minX, maxX));
      const yTicks = computeTicks(minY, maxY, 5).map((v) => rangeRatio(v, minY, maxY));

      drawGrid(c, config, xTicks, yTicks, plotBounds.x, plotBounds.y, plotBounds.width, plotBounds.height);

      return { type: 'canvas' };
    },
  };
}

/**
 * Create a line data layer that draws a line chart onto the canvas.
 *
 * @param data - Y values for the line.
 * @param opts - Optional color, filled mode.
 * @param zIndex - Z-order (default: 0).
 */
export function lineDataLayer(data: number[], opts?: { color?: Color; filled?: boolean }, zIndex: number = 0): ChartLayer {
  const values = finiteValues(data);
  return {
    name: 'data:line',
    zIndex,
    render(ctx: LayerContext): LayerOutput {
      if (values.length === 0) return { type: 'none' };

      const c = ctx.canvas;
      const { plotBounds, yRange } = ctx;
      const [minY, maxY] = yRange;
      const pxW = plotBounds.width;
      const pxH = plotBounds.height;
      const ox = plotBounds.x;
      const oy = plotBounds.y;

      if (opts?.color) c.setColor(opts.color);

      const filled = opts?.filled !== false;

      if (filled) {
        for (let px = 0; px < pxW; px++) {
          const dataProgress = (px / Math.max(pxW - 1, 1)) * (values.length - 1);
          const i = Math.min(Math.floor(dataProgress), values.length - 1);
          const frac = dataProgress - i;
          const val = i + 1 < values.length ? values[i]! * (1 - frac) + values[i + 1]! * frac : values[i]!;
          const y = oy + pxH - 1 - Math.round(rangeRatio(val, minY, maxY) * (pxH - 1));
          for (let py = y; py < oy + pxH; py++) {
            c.set(ox + px, py);
          }
        }
      } else {
        for (let i = 0; i < values.length - 1; i++) {
          const x1 = ox + Math.round((i / Math.max(values.length - 1, 1)) * (pxW - 1));
          const y1 = oy + pxH - 1 - Math.round(rangeRatio(values[i]!, minY, maxY) * (pxH - 1));
          const x2 = ox + Math.round(((i + 1) / Math.max(values.length - 1, 1)) * (pxW - 1));
          const y2 = oy + pxH - 1 - Math.round(rangeRatio(values[i + 1]!, minY, maxY) * (pxH - 1));
          c.line(x1, y1, x2, y2);
        }
        if (values.length === 1) {
          c.set(ox + Math.round((pxW - 1) / 2), oy + Math.round((pxH - 1) / 2));
        }
      }

      return { type: 'canvas' };
    },
  };
}

/**
 * Create a bar data layer that draws a bar chart onto the canvas.
 *
 * @param values - Bar values.
 * @param opts - Optional color(s).
 * @param zIndex - Z-order (default: 0).
 */
export function barDataLayer(values: number[], opts?: { color?: Color; colors?: Color[] }, zIndex: number = 0): ChartLayer {
  const data = finiteValues(values);
  return {
    name: 'data:bar',
    zIndex,
    render(ctx: LayerContext): LayerOutput {
      if (data.length === 0) return { type: 'none' };

      const c = ctx.canvas;
      const { plotBounds } = ctx;
      const pxW = plotBounds.width;
      const pxH = plotBounds.height;
      const ox = plotBounds.x;
      const oy = plotBounds.y;

      const min = safeMin(data);
      const max = safeMax(data);
      if (min === 0 && max === 0) return { type: 'none' };

      const barWidth = Math.max(1, Math.floor(pxW / data.length));
      const gap = Math.max(0, Math.floor(barWidth * 0.2));
      const effectiveBarWidth = Math.max(1, barWidth - gap);

      const effectiveMin = Math.min(min, 0);
      const effectiveMax = Math.max(max, 0);
      const zeroProgress = rangeRatio(0, effectiveMin, effectiveMax);
      const zeroY = oy + Math.round((1 - zeroProgress) * (pxH - 1));

      for (let i = 0; i < data.length; i++) {
        const barColor = opts?.colors?.[i] ?? opts?.color;
        if (barColor) c.setColor(barColor);

        const val = data[i]!;
        const x = ox + i * barWidth;

        if (val >= 0) {
          const barHeight = Math.round(Math.abs(rangeRatio(val, effectiveMin, effectiveMax) - zeroProgress) * (pxH - 1));
          const y = zeroY - barHeight;
          for (let py = Math.max(oy, y); py <= zeroY && py < oy + pxH; py++) {
            for (let px = x; px < x + effectiveBarWidth; px++) {
              if (px < ox + pxW) c.set(px, py);
            }
          }
        } else {
          const barHeight = Math.round(Math.abs(rangeRatio(val, effectiveMin, effectiveMax) - zeroProgress) * (pxH - 1));
          const yEnd = zeroY + barHeight;
          for (let py = zeroY; py <= Math.min(yEnd, oy + pxH - 1); py++) {
            for (let px = x; px < x + effectiveBarWidth; px++) {
              if (px < ox + pxW) c.set(px, py);
            }
          }
        }
      }

      return { type: 'canvas' };
    },
  };
}

/**
 * Create a scatter data layer that draws scatter points onto the canvas.
 *
 * @param data - Array of [x, y] data points.
 * @param opts - Optional color, dot radius.
 * @param zIndex - Z-order (default: 0).
 */
export function scatterDataLayer(data: [number, number][], opts?: { color?: Color; dotRadius?: number }, zIndex: number = 0): ChartLayer {
  const points = data.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)).map(([x, y]): [number, number] => [x, y]);
  return {
    name: 'data:scatter',
    zIndex,
    render(ctx: LayerContext): LayerOutput {
      if (points.length === 0) return { type: 'none' };

      const c = ctx.canvas;
      const { plotBounds, xRange, yRange } = ctx;
      const [minX, maxX] = xRange;
      const [minY, maxY] = yRange;
      const pxW = plotBounds.width;
      const pxH = plotBounds.height;
      const ox = plotBounds.x;
      const oy = plotBounds.y;

      if (opts?.color) c.setColor(opts.color);

      for (const [dx, dy] of points) {
        const px = ox + Math.round(rangeRatio(dx, minX, maxX) * (pxW - 1));
        const py = oy + pxH - 1 - Math.round(rangeRatio(dy, minY, maxY) * (pxH - 1));
        const r = nonNegativeInteger(opts?.dotRadius, 1);
        if (r <= 0) {
          c.set(px, py);
        } else {
          c.fillCircle(px, py, r);
        }
      }

      return { type: 'canvas' };
    },
  };
}

/**
 * Create a title chrome layer.
 *
 * @param config - Title configuration (title, subtitle).
 * @param zIndex - Z-order (default: 100, rendered after data layers).
 */
export function titleLayer(config: TitleConfig, zIndex: number = 100): ChartLayer {
  return {
    name: 'chrome:title',
    zIndex,
    render(ctx: LayerContext): LayerOutput {
      const lines = renderTitle(config, ctx.cellWidth);
      if (lines.length === 0) return { type: 'none' };
      return { type: 'chrome', lines: { above: lines } };
    },
  };
}

/**
 * Create a Y-axis chrome layer that produces left-side tick labels.
 *
 * @param config - Axis configuration (yFormat, tickCount).
 * @param zIndex - Z-order (default: 90).
 */
export function yAxisLayer(config?: AxisConfig, zIndex: number = 90): ChartLayer {
  return {
    name: 'chrome:y-axis',
    zIndex,
    render(ctx: LayerContext): LayerOutput {
      const [minY, maxY] = ctx.yRange;
      const tickCount = config?.tickCount ?? 5;
      const format = config?.yFormat ?? defaultFormat;
      const ticks = computeTicks(minY, maxY, tickCount);
      const labels = renderYTickLabels(ticks, minY, maxY, ctx.cellHeight, format);

      // Build per-row left labels
      const left: string[] = new Array(ctx.cellHeight).fill('');
      for (const { row, label } of labels) {
        if (row >= 0 && row < ctx.cellHeight) {
          left[row] = label;
        }
      }

      return { type: 'chrome', lines: { left } };
    },
  };
}

/**
 * Create an X-axis chrome layer that produces bottom tick labels.
 *
 * @param config - Axis configuration (xFormat, xLabel, tickCount).
 * @param zIndex - Z-order (default: 90).
 */
export function xAxisLayer(config?: AxisConfig, zIndex: number = 90): ChartLayer {
  return {
    name: 'chrome:x-axis',
    zIndex,
    render(ctx: LayerContext): LayerOutput {
      const [minX, maxX] = ctx.xRange;
      const tickCount = config?.tickCount ?? 5;
      const format = config?.xFormat ?? defaultFormat;
      const ticks = computeTicks(minX, maxX, tickCount);
      const tickLine = renderXTickLabels(ticks, minX, maxX, ctx.cellWidth, format);

      const below: string[] = [tickLine];
      if (config?.xLabel) {
        const label = fitChromeLine(config.xLabel, ctx.cellWidth);
        const pad = Math.max(0, Math.floor((ctx.cellWidth - cellWidth(label)) / 2));
        below.push(' '.repeat(pad) + label);
      }

      return { type: 'chrome', lines: { below } };
    },
  };
}

/**
 * Create a legend chrome layer.
 *
 * @param config - Legend configuration (entries, position).
 * @param zIndex - Z-order (default: 95).
 */
export function legendLayer(config: LegendConfig, zIndex: number = 95): ChartLayer {
  return {
    name: 'chrome:legend',
    zIndex,
    render(ctx: LayerContext): LayerOutput {
      const legendStr = renderLegend(config);
      const pos = config.position ?? 'bottom';

      if (pos === 'top') {
        return { type: 'chrome', lines: { above: [legendStr, ''] } };
      } else if (pos === 'right') {
        // Place on the first row
        const right: string[] = new Array(ctx.cellHeight).fill('');
        right[0] = legendStr;
        return { type: 'chrome', lines: { right } };
      } else {
        return { type: 'chrome', lines: { below: ['', legendStr] } };
      }
    },
  };
}

/**
 * Create an ink annotation layer that produces a CellShader.
 *
 * @param ink - An InkLayer instance with marks.
 * @param zIndex - Z-order (default: 50, after data layers).
 */
export function inkShaderLayer(ink: InkLayer, zIndex: number = 50): ChartLayer {
  return {
    name: 'shader:ink',
    zIndex,
    render(_ctx: LayerContext): LayerOutput {
      return { type: 'shader', shader: ink.shader() };
    },
  };
}

/**
 * Create a hit regions layer for interactivity.
 *
 * @param regions - Hit regions to expose.
 * @param zIndex - Z-order (default: 80).
 */
export function hitRegionLayer(regions: HitRegion[], zIndex: number = 80): ChartLayer {
  return {
    name: 'interactive:hit-regions',
    zIndex,
    render(_ctx: LayerContext): LayerOutput {
      return { type: 'hitRegions', regions };
    },
  };
}

/**
 * Create a custom canvas layer with an arbitrary draw function.
 *
 * @param name - Layer name.
 * @param drawFn - Function that draws onto the canvas.
 * @param zIndex - Z-order (default: 0).
 */
export function customCanvasLayer(name: string, drawFn: (ctx: LayerContext) => void, zIndex: number = 0): ChartLayer {
  return {
    name,
    zIndex,
    render(ctx: LayerContext): LayerOutput {
      drawFn(ctx);
      return { type: 'canvas' };
    },
  };
}

/**
 * Create a custom chrome layer with arbitrary text positioning.
 *
 * @param name - Layer name.
 * @param chromeFn - Function that produces ChromeLines.
 * @param zIndex - Z-order (default: 90).
 */
export function customChromeLayer(name: string, chromeFn: (ctx: LayerContext) => ChromeLines, zIndex: number = 90): ChartLayer {
  return {
    name,
    zIndex,
    render(ctx: LayerContext): LayerOutput {
      const lines = chromeFn(ctx);
      return { type: 'chrome', lines };
    },
  };
}

// ── Convenience: auto-range from data ────────────────────────────────────

/**
 * Compute data ranges from a line data series.
 * Returns [xRange, yRange] suitable for `composeChart` opts.
 */
export function dataRange(data: number[]): { xRange: [number, number]; yRange: [number, number] } {
  const values = finiteValues(data);
  if (values.length === 0) return { xRange: [0, 1], yRange: [0, 1] };
  const minY = safeMin(values);
  const maxY = safeMax(values);
  return {
    xRange: [0, Math.max(values.length - 1, 1)],
    yRange: [minY, maxY === minY ? minY + 1 : maxY],
  };
}

/**
 * Compute data ranges from scatter data points.
 */
export function scatterRange(data: [number, number][]): { xRange: [number, number]; yRange: [number, number] } {
  const points = data.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (points.length === 0) return { xRange: [0, 1], yRange: [0, 1] };
  const xs = points.map((d) => d[0]);
  const ys = points.map((d) => d[1]);
  const minX = safeMin(xs);
  const maxX = safeMax(xs);
  const minY = safeMin(ys);
  const maxY = safeMax(ys);
  return {
    xRange: [minX, maxX === minX ? minX + 1 : maxX],
    yRange: [minY, maxY === minY ? minY + 1 : maxY],
  };
}

/**
 * Compute data ranges from bar values.
 */
export function barRange(values: number[]): { xRange: [number, number]; yRange: [number, number] } {
  const data = finiteValues(values);
  if (data.length === 0) return { xRange: [0, 1], yRange: [0, 1] };
  const min = safeMin(data);
  const max = safeMax(data);
  return {
    xRange: [0, Math.max(data.length - 1, 1)],
    yRange: [Math.min(min, 0), Math.max(max, 0) || 1],
  };
}
