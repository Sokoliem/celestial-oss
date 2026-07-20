# @celestial/stellar

Terminal canvas with sub-cell pixel rendering, charting, and dashboard composition. Provides braille/sextant/quarter-block canvas, 15+ chart types, interactive gestures, composable layers, and a full export pipeline.

## Installation

Celestial is pre-release and not published to npm yet. Clone the monorepo, run the root install flow in [`README.md`](../../README.md), then use this package from a workspace app or example inside the repo.

## Features

- **Canvas** - Sub-cell pixel rendering via braille, sextant, quarter-block, or half-block codecs
- **Drawing** - Lines, rectangles, circles, text (standard + HD bitmap font)
- **Charts** - Line, bar, scatter, stacked bar, pie, area, heatmap, sparkline, arc gauge, bar gauge, box plot, candlestick, histogram, bullet, waterfall
- **Interactivity** - Hit regions, tooltips, crosshairs, selection, Nexus HitMap integration
- **Streaming** - Real-time sliding-window chart updates via `push()`/`onUpdate()`
- **Animation** - Eased bar/line chart animations via `@celestial/aurora`
- **Ink Layer** - Persistent annotations (pen, highlight, arrow, text, shapes) as a CellShader
- **Shapes** - Anti-aliased hit-testing (circle, ellipse, polygon, star, ring, rounded rect) with boolean ops
- **Gestures** - Pure state machine for range selection, pan, long-press, scroll-zoom
- **Responsive** - Breakpoint-based chart sizing with layout feedback subscriptions
- **Dataset** - Unified data abstraction with transforms (normalize, cumulative, moving average, resample via LTTB)
- **Layers** - Composable chart architecture (grid, data, chrome, hit regions, shaders)
- **Elm Components** - `embedChart()` and `chartAppConfig()` for full Elm Architecture integration
- **Accessibility** - Colorblind palettes, WCAG contrast validation, screen reader descriptions, reduced motion
- **Export** - ANSI, plain text, HTML, SVG, pixel data
- **Dashboard** - Multi-panel grid/stack/row layout with Elm Architecture wiring

## Canvas & Drawing

### Creating a Canvas

```typescript
import { canvas, type BrailleCanvas, type CanvasMode } from '@celestial/stellar';

const cvs = canvas(80, 24);
const sextant = canvas(80, 24, 'sextant');
```

`canvas(width: number, height: number, mode?: CanvasMode): BrailleCanvas`

| Mode | Sub-pixels/cell | Characters |
|------|-----------------|------------|
| `'braille'` (default) | 2x4 | U+2800-U+28FF |
| `'sextant'` | 2x3 | U+1FB00-U+1FB3B |
| `'quarter'` | 2x2 | U+2596-U+259F |
| `'halfblock'` | 1x2 | U+2580/U+2584 |

### BrailleCanvas API

```typescript
cvs.set(px, py)
cvs.clear(px, py)
cvs.toggle(px, py)
cvs.get(px, py): boolean
cvs.line(x1, y1, x2, y2)
cvs.rect(x, y, w, h)
cvs.fillRect(x, y, w, h)
cvs.circle(cx, cy, r)
cvs.fillCircle(cx, cy, r)
cvs.circleCorrect(cx, cy, r)
cvs.fillCircleCorrect(cx, cy, r)
cvs.text(x, y, str)
cvs.setColor(color)
cvs.setBackground(color)
cvs.render(): string
cvs.toVNode(): VNode
cvs.reset()
cvs.getCellBitmask(row, col): number
cvs.getCellColor(row, col): CellColor | undefined
cvs.getCodec(): CellCodec
```

Coordinates are in sub-pixel space. `pixelWidth` and `pixelHeight` give the total sub-pixel dimensions.

### Drawing Primitives

Drawing functions take a `BrailleCanvas` — no color parameter. Use `cvs.setColor()` before drawing.

```typescript
import { canvas, drawLine, drawRect, fillRect, drawCircle, fillCircle, drawText, drawTextHD } from '@celestial/stellar';
import { color } from '@celestial/corona';

const cvs = canvas(80, 24);

cvs.setColor(color.hex('#00ff88'));
drawLine(cvs, 0, 1, 78, 1);

cvs.setColor(color.hex('#ff8800'));
drawRect(cvs, 10, 5, 30, 10);

cvs.setColor(color.hex('#0088ff'));
fillCircle(cvs, 40, 12, 8);

cvs.setColor(color.hex('#ffffff'));
drawText(cvs, 5, 20, 'Hello');
```

| Function | Signature |
|----------|-----------|
| `drawLine` | `(c: BrailleCanvas, x1: number, y1: number, x2: number, y2: number) => void` |
| `drawRect` | `(c: BrailleCanvas, x: number, y: number, w: number, h: number) => void` |
| `fillRect` | `(c: BrailleCanvas, x: number, y: number, w: number, h: number) => void` |
| `drawCircle` | `(c: BrailleCanvas, cx: number, cy: number, r: number) => void` |
| `fillCircle` | `(c: BrailleCanvas, cx: number, cy: number, r: number) => void` |
| `drawText` | `(c: BrailleCanvas, x: number, y: number, str: string) => void` |
| `drawTextHD` | `(c: BrailleCanvas, x: number, y: number, str: string) => void` |

### Bitmap Fonts

```typescript
import { getGlyph, GLYPH_SPACING, type Glyph, getGlyphHD, GLYPH_HD_SPACING, type GlyphHD } from '@celestial/stellar';

const g: Glyph | undefined = getGlyph('A');
const hd: GlyphHD | undefined = getGlyphHD('A');
```

- `getGlyph(ch)` — 3x5 pixel bitmap font, ASCII 32-126
- `getGlyphHD(ch)` — 8x14 pixel HD bitmap font, ASCII 32-126 + braille/box-drawing/block elements

### Cell Codecs

```typescript
import { getCodec, type CellCodec, type CanvasMode } from '@celestial/stellar';

const codec: CellCodec = getCodec('braille');
codec.subCols   // 2
codec.subRows   // 4
codec.pixelAspect // 1.0
codec.dotBit(dy, dx): number
codec.toChar(bitmask): string
```

### Color Map

```typescript
import { ColorMap, type CellColor } from '@celestial/stellar';

interface CellColor {
  fg?: Color;
  bg?: Color;
}
```

`ColorMap` is used internally by the canvas for per-cell color tracking. Not typically used directly.

## Math Utilities

```typescript
import { safeMin, safeMax, safeMinMax } from '@celestial/stellar';

safeMin([1, 5, 3])           // 1
safeMax([1, 5, 3])           // 5
safeMinMax([1, 5, 3])        // [1, 5]
```

Stack-safe alternatives to `Math.min(...arr)` / `Math.max(...arr)` that avoid RangeError on large arrays.

## Core Charts

### `chart` (namespace)

The `chart` object provides `.line()`, `.bar()`, `.scatter()`, `.stackedBar()`, and `.sparkline()` methods. All return `ChartResult` with `toString()` and `toVNode()`.

#### Line Chart

```typescript
import { chart } from '@celestial/stellar';

const result = chart.line({
  data: [10, 20, 15, 30, 25],
  width: 60,
  height: 15,
  color: color.hex('#00ff88'),
  filled: true,
  mode: 'braille',
});
console.log(result.toString());
```

`LineChartOpts`: `{ data: number[]; width?: number; height?: number; color?: Color; axes?: boolean; filled?: boolean; mode?: CanvasMode }`

#### Bar Chart

```typescript
const result = chart.bar({
  data: [5, 8, 12, 6],
  width: 60,
  height: 10,
  color: color.hex('#ff8800'),
});

const labeled = chart.bar({
  data: [{ label: 'A', value: 5 }, { label: 'B', value: 8 }],
  colors: [color.hex('#ff0000'), color.hex('#00ff00')],
});
```

`BarChartOpts`: `{ data: number[] | { label: string; value: number }[]; width?: number; height?: number; color?: Color; colors?: Color[]; mode?: CanvasMode }`

#### Scatter Chart

```typescript
const result = chart.scatter({
  data: [[0, 10], [1, 20], [2, 15], [3, 30]],
  width: 60,
  height: 15,
  dotRadius: 2,
});
```

`ScatterChartOpts`: `{ data: [number, number][]; width?: number; height?: number; color?: Color; axes?: boolean; dotRadius?: number; mode?: CanvasMode }`

#### Stacked Bar Chart

```typescript
const result = chart.stackedBar({
  series: [
    { label: 'Q1', data: [10, 20, 15], color: color.hex('#4e79a7') },
    { label: 'Q2', data: [5, 10, 20], color: color.hex('#f28e2b') },
  ],
  width: 40,
  height: 10,
});
```

`StackedBarChartOpts`: `{ series: { label?: string; data: number[]; color?: Color }[]; width?: number; height?: number; mode?: CanvasMode }`

#### Block Sparkline (inline)

```typescript
const spark = chart.sparkline([10, 20, 15, 25, 18, 30], 30);
```

Returns a plain `string` (not a `ChartResult`). Uses block characters.

## Chart Infrastructure

```typescript
import {
  computeTicks,
  defaultFormat,
  drawGrid,
  renderTitle,
  renderXTickLabels,
  renderYTickLabels,
  renderLegend,
  responsiveSize,
  composeChartChrome,
} from '@celestial/stellar';
```

| Function | Signature |
|----------|-----------|
| `computeTicks` | `(min: number, max: number, count?: number) => number[]` |
| `defaultFormat` | `(value: number) => string` |
| `drawGrid` | `(c: BrailleCanvas, config: GridConfig, xTicks: number[], yTicks: number[], plotX: number, plotY: number, plotW: number, plotH: number) => void` |
| `renderTitle` | `(config: TitleConfig, width: number) => string[]` |
| `renderXTickLabels` | `(ticks: number[], min: number, max: number, width: number, format?: TickFormatter) => string` |
| `renderYTickLabels` | `(ticks: number[], min: number, max: number, height: number, format?: TickFormatter) => { row: number; label: string }[]` |
| `renderLegend` | `(config: LegendConfig) => string` |
| `responsiveSize` | `(availableWidth: number, availableHeight: number, aspectRatio?: number) => { width: number; height: number }` |
| `composeChartChrome` | `(chartBody: string, chrome: ChartChrome, opts: { width: number; height: number; minX?: number; maxX?: number; minY?: number; maxY?: number }) => string` |

Types: `AxisConfig`, `TitleConfig`, `GridConfig`, `GridStyle`, `LegendConfig`, `LegendEntry`, `LegendPosition`, `TickFormatter`, `ChartChrome`.

## New Chart Types

### Pie / Donut Chart

```typescript
import { pieChart } from '@celestial/stellar';

const result = pieChart({
  segments: [
    { value: 30, label: 'A', color: color.hex('#ff0000') },
    { value: 40, label: 'B', color: color.hex('#00ff00') },
    { value: 30, label: 'C', color: color.hex('#0000ff') },
  ],
  width: 20,
  height: 10,
  donut: 0.5,
  showLabels: true,
});
console.log(result.percentages); // [30, 40, 30]
```

`pieChart(opts: PieChartOpts): PieChartResult`

`PieChartOpts`: `{ segments: PieSegment[]; width?: number; height?: number; mode?: CanvasMode; donut?: number; showLabels?: boolean }`

`PieSegment`: `{ value: number; label?: string; color?: Color }`

`PieChartResult`: `{ toString(): string; toVNode(): VNode; percentages: number[] }`

### Area Chart

```typescript
import { areaChart } from '@celestial/stellar';

const result = areaChart({
  series: [
    { data: [1, 4, 2, 8, 5], color: color.hex('#4e79a7') },
    { data: [3, 2, 6, 3, 7], color: color.hex('#f28e2b') },
  ],
  width: 60,
  height: 15,
  stacked: true,
});
```

`areaChart(opts: AreaChartOpts): AreaChartResult`

`AreaChartOpts`: `{ series: AreaSeries[]; width?: number; height?: number; mode?: CanvasMode; stacked?: boolean }`

`AreaSeries`: `{ data: number[]; color?: Color; label?: string }`

### Heatmap

```typescript
import { heatmap } from '@celestial/stellar';

const result = heatmap({
  data: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
  rowLabels: ['Row A', 'Row B', 'Row C'],
  colLabels: ['X', 'Y', 'Z'],
  colorStops: [
    { at: 0, color: color.hex('#0000ff') },
    { at: 1, color: color.hex('#ff0000') },
  ],
  cellWidth: 2,
});
```

`heatmap(opts: HeatmapOpts): HeatmapResult`

`HeatmapOpts`: `{ data: number[][]; rowLabels?: string[]; colLabels?: string[]; min?: number; max?: number; colorStops?: HeatmapColorStop[]; cellChar?: string; cellWidth?: number }`

`HeatmapColorStop`: `{ at: number; color: Color }`

### Braille Sparkline

```typescript
import { sparkline } from '@celestial/stellar';

const result = sparkline({
  data: [10, 20, 15, 25, 18, 30],
  width: 30,
  height: 3,
  color: color.hex('#00ff88'),
  filled: true,
  showRange: true,
});
console.log(result.min, result.max);
```

`sparkline(opts: SparklineOpts): SparklineResult`

`SparklineOpts`: `{ data: number[]; width?: number; height?: number; color?: Color; mode?: CanvasMode; filled?: boolean; showRange?: boolean }`

`SparklineResult`: `{ toString(): string; toVNode(): VNode; min: number; max: number }`

### Gauges

```typescript
import { arcGauge, barGauge } from '@celestial/stellar';

const arc = arcGauge({
  value: 72,
  min: 0,
  max: 100,
  width: 20,
  height: 6,
  color: color.hex('#00ff88'),
  bgColor: color.hex('#333333'),
  showValue: true,
});
console.log(arc.normalized); // 0.72

const bar = barGauge({
  value: 72,
  width: 30,
  color: color.hex('#00ff88'),
});
```

`arcGauge(opts: ArcGaugeOpts): GaugeResult`

`ArcGaugeOpts`: `{ value: number; min?: number; max?: number; width?: number; height?: number; mode?: CanvasMode; color?: Color; bgColor?: Color; showValue?: boolean; format?: (value: number) => string }`

`barGauge(opts: BarGaugeOpts): GaugeResult`

`BarGaugeOpts`: `{ value: number; min?: number; max?: number; width?: number; color?: Color; bgColor?: Color; showValue?: boolean; format?: (value: number) => string }`

`GaugeResult`: `{ toString(): string; toVNode(): VNode; normalized: number }`

## Statistical Charts

All return `StatsChartResult` with `toString()` and `toVNode()`.

### Box Plot

```typescript
import { boxPlot } from '@celestial/stellar';

const result = boxPlot({
  data: [
    { min: 1, q1: 3, median: 5, q3: 7, max: 10, outliers: [0, 11] },
    { min: 2, q1: 4, median: 6, q3: 8, max: 9 },
  ],
  width: 40,
  height: 10,
  color: color.hex('#4e79a7'),
  whiskers: true,
});
```

`BoxPlotOpts`: `{ data: BoxPlotDatum[]; width?: number; height?: number; color?: Color; mode?: CanvasMode; whiskers?: boolean }`

`BoxPlotDatum`: `{ min: number; q1: number; median: number; q3: number; max: number; outliers?: number[]; color?: Color }`

### Candlestick

```typescript
import { candlestick } from '@celestial/stellar';

const result = candlestick({
  data: [
    { open: 100, high: 110, low: 95, close: 105 },
    { open: 105, high: 115, low: 100, close: 102 },
  ],
  bullColor: color.hex('#00ff00'),
  bearColor: color.hex('#ff0000'),
});
```

`CandlestickOpts`: `{ data: CandleDatum[]; width?: number; height?: number; bullColor?: Color; bearColor?: Color; mode?: CanvasMode }`

`CandleDatum`: `{ open: number; high: number; low: number; close: number }`

### Histogram

```typescript
import { histogram } from '@celestial/stellar';

const result = histogram({
  data: [1, 2, 2, 3, 3, 3, 4, 4, 5],
  bins: 5,
  color: color.hex('#4e79a7'),
});
console.log(result.counts);
console.log(result.edges);
```

`HistogramOpts`: `{ data: number[]; width?: number; height?: number; bins?: number; preBinned?: boolean; color?: Color; mode?: CanvasMode }`

`HistogramResult` extends `StatsChartResult` with `counts: number[]` and `edges: number[]`.

### Bullet Chart

```typescript
import { bullet } from '@celestial/stellar';

const result = bullet({
  value: 75,
  target: 90,
  ranges: [30, 60, 100],
  rangeColors: [color.hex('#cccccc'), color.hex('#ffcc00'), color.hex('#ff9900')],
  color: color.hex('#4e79a7'),
  targetColor: color.hex('#000000'),
  orientation: 'horizontal',
});
```

`BulletOpts`: `{ value: number; target?: number; ranges?: number[]; min?: number; max?: number; width?: number; height?: number; color?: Color; targetColor?: Color; rangeColors?: Color[]; mode?: CanvasMode; orientation?: 'horizontal' | 'vertical' }`

### Waterfall Chart

```typescript
import { waterfall } from '@celestial/stellar';

const result = waterfall({
  data: [
    { label: 'Start', value: 100, isTotal: true },
    { label: 'Cost A', value: -30 },
    { label: 'Cost B', value: -20 },
    { label: 'End', value: 50, isTotal: true },
  ],
  positiveColor: color.hex('#4e79a7'),
  negativeColor: color.hex('#e15759'),
  totalColor: color.hex('#333333'),
  connectors: true,
});
```

`WaterfallOpts`: `{ data: WaterfallDatum[]; width?: number; height?: number; positiveColor?: Color; negativeColor?: Color; totalColor?: Color; mode?: CanvasMode; connectors?: boolean }`

`WaterfallDatum`: `{ label?: string; value: number; isTotal?: boolean; color?: Color }`

## Interactivity

### Creating an Interactive Chart

```typescript
import { createInteractiveChart, buildPointHitRegions, buildBarHitRegions } from '@celestial/stellar';

const interactive = createInteractiveChart({
  chartX: 5,
  chartY: 0,
  chartWidth: 55,
  chartHeight: 10,
  regions: hitRegions,
  formatTooltip: (region) => `Value: ${region.value}`,
  hitStrategy: 'hitmap',
});

interactive.hitTest(col, row)
interactive.getTooltip(col, row)
interactive.handleClick(col, row)
interactive.updateCrosshair(col, row)
interactive.renderCrosshair()
interactive.cellToData(col, row)
interactive.selection
interactive.crosshair
interactive.nexusHitMap
interactive.hitRegions
```

`createInteractiveChart(opts: InteractiveChartOpts): InteractiveChart`

`InteractiveChartOpts`: `{ chartX: number; chartY: number; chartWidth: number; chartHeight: number; regions: HitRegion[]; formatTooltip?: (region: HitRegion) => string; coordMap?: { cellToData(col: number, row: number): { x: number; y: number } | null }; hitStrategy?: HitTestStrategy }`

### Interactivity Types

`TooltipData`: `{ region: HitRegion; text: string; col: number; row: number }` — tooltip content for a data point, returned by `getTooltip()`.

`CrosshairState`: `{ col: number; row: number; visible: boolean }` — crosshair cursor state, returned by `updateCrosshair()`.

`SelectionState`: `{ selected: HitRegion | null }` — click-to-select state, returned by `handleClick()`.

`InteractiveChart`: Return type of `createInteractiveChart()`. Exposes `hitTest()`, `getTooltip()`, `handleClick()`, `updateCrosshair()`, `renderCrosshair()`, `cellToData()`, and readonly `selection`, `crosshair`, `nexusHitMap`, `hitRegions`.

`HitTestStrategy`: `'hitmap' | 'cell'` — `'hitmap'` uses Nexus HitMap (linear scan, default); `'cell'` uses O(1) grid lookup for large region counts.

### Building Hit Regions

```typescript
const pointRegions = buildPointHitRegions(
  [[0, 10], [1, 20], [2, 15], [3, 30]],
  5, 0, 55, 10,
  0, 3, 10, 30,
  0,
);

const barRegions = buildBarHitRegions(
  [5, 8, 12, 6],
  5, 0, 55, 10,
  ['A', 'B', 'C', 'D'],
);
```

`buildPointHitRegions(data: [number, number][], chartX: number, chartY: number, chartWidth: number, chartHeight: number, dataMinX: number, dataMaxX: number, dataMinY: number, dataMaxY: number, seriesIndex?: number): HitRegion[]`

`buildBarHitRegions(values: number[], chartX: number, chartY: number, chartWidth: number, chartHeight: number, labels?: string[]): HitRegion[]`

`HitRegion`: `{ id: string; seriesIndex: number; pointIndex: number; x: number; y: number; width: number; height: number; value: number | [number, number]; label?: string }`

## Streaming

```typescript
import { createStreamingChart } from '@celestial/stellar';

const stream = createStreamingChart({
  type: 'line',
  maxPoints: 100,
  width: 60,
  height: 10,
  color: color.hex('#00ff88'),
  minInterval: 16,
});

stream.push(42, 47, 39);
stream.setData([10, 20, 30, 40]);
stream.getData()
stream.render()
stream.clear()
stream.totalPoints
stream.windowSize

stream.onUpdate((data, chart) => {
  console.log(`Points: ${data.length}`);
});

stream.offUpdate(callback);
```

`createStreamingChart(opts?: StreamingChartOpts): StreamingChart`

`StreamingChartOpts`: `{ type?: StreamingChartType; maxPoints?: number; width?: number; height?: number; color?: Color; mode?: CanvasMode; filled?: boolean; minInterval?: number }`

`StreamingChartType`: `'line' | 'bar'`

`StreamingUpdateCallback`: `(data: number[], chart: ChartResult) => void`

`StreamingChart.setData(data: number[])` — Replace all data with the provided array, resetting the total counter and applying the sliding window.

## Animation

```typescript
import { animateData, animateBarChart, animateLineChart } from '@celestial/stellar';
import { easing } from '@celestial/aurora';

const animated = animateData([10, 20, 15, 30], tick, 30, easing.easeOut);
const barResult = animateBarChart({ data: [5, 8, 12], tick: 15, duration: 30 });
const lineResult = animateLineChart({ data: [10, 20, 15, 30], tick: 15, duration: 30 });
```

| Function | Signature |
|----------|-----------|
| `animateData` | `(data: number[], tick: number, duration: number, easingFn?: EasingFn) => number[]` |
| `animateBarChart` | `(config: AnimateBarChartConfig) => ChartResult` |
| `animateLineChart` | `(config: AnimateLineChartConfig) => ChartResult` |

## Ink Layer

Persistent drawing/annotation layer that composites with the render via Nebula's shader pipeline. Marks persist until explicitly cleared.

```typescript
import { InkLayer, pen, highlight, arrow, annotation, inkRect, inkCircle } from '@celestial/stellar';

const ink = new InkLayer({ blend: 'overlay', opacity: 0.8 });

ink.draw(pen({ from: { x: 0, y: 0 }, to: { x: 20, y: 10 }, color: [255, 0, 0] }));
ink.draw(highlight({ rect: { x: 5, y: 5, width: 10, height: 3 }, color: [255, 255, 0] }));
ink.draw(arrow({ from: { x: 10, y: 0 }, to: { x: 10, y: 8 }, color: [0, 255, 0] }));
ink.draw(annotation({ pos: { x: 15, y: 2 }, text: 'Note', color: [255, 255, 255] }));
ink.draw(inkRect({ rect: { x: 0, y: 0, width: 30, height: 15 }, color: [255, 0, 0], fill: true }));
ink.draw(inkCircle({ center: { x: 40, y: 10 }, radius: 5, color: [0, 0, 255] }));

ink.undo(): InkMark | undefined  // returns removed mark, or undefined if empty
ink.clear();
ink.marks()
ink.count()
ink.save(): InkState
ink.load(state: InkState)
ink.shader(): CellShader
```

Mark types: `pen`, `highlight`, `arrow`, `annotation`, `inkRect`, `inkCircle`.

`InkMark` is a discriminated union by `type` field. `BlendMode`: `'overlay' | 'underlay' | 'replace'`.

`InkState`: `{ marks: InkMark[]; options: InkOptions }` — serializable snapshot returned by `save()` and consumed by `load()`.

### Ink Types

`Point`: `{ x: number; y: number }` — a position in the terminal grid, used by ink mark builders.

`InkOptions`: `{ blend?: BlendMode; opacity?: number }` — options for creating an `InkLayer`. `blend` defaults to `'overlay'`, `opacity` defaults to `1.0`.

## Shape Hit-Testing

Each function returns 0-1: 0 = outside, 1 = inside, 0-1 = edge (anti-aliased via smoothstep).

```typescript
import {
  isInsideCircle, isInsideEllipse, isInsidePolygon, isInsideStar,
  isInsideRing, isInsideRoundedRect,
  shapeUnion, shapeIntersect, shapeSubtract,
  shapeCircle, shapeEllipse, shapePolygon, shapeStar, shapeRing, shapeRoundedRect,
  type ShapeTestFn,
} from '@celestial/stellar';

const test: ShapeTestFn = shapeCircle({ cx: 10, cy: 10, r: 5 });
test(10, 10); // 1.0

const starTest: ShapeTestFn = shapeStar({ cx: 10, cy: 10, points: 5, outerR: 8, innerR: 4 });
const roundedRectTest: ShapeTestFn = shapeRoundedRect({ x: 0, y: 0, w: 20, h: 10, r: 2 });

const combined = shapeUnion(shapeCircle({ cx: 0, cy: 0, r: 5 }), shapeCircle({ cx: 8, cy: 0, r: 5 }));
const ring = shapeSubtract(shapeCircle({ cx: 0, cy: 0, r: 10 }), shapeCircle({ cx: 0, cy: 0, r: 5 }));
```

| Function | Signature |
|----------|-----------|
| `isInsideCircle` | `(x, y, cx, cy, r) => number` |
| `isInsideEllipse` | `(x, y, cx, cy, rx, ry) => number` |
| `isInsidePolygon` | `(x, y, points: [number, number][]) => number` |
| `isInsideStar` | `(x, y, cx, cy, numPoints, outerR, innerR) => number` |
| `isInsideRing` | `(x, y, cx, cy, outerR, innerR) => number` |
| `isInsideRoundedRect` | `(x, y, rx, ry, w, h, cornerR) => number` — `rx, ry` is top-left corner (not radii) |
| `shapeUnion` | `(...fns: ShapeTestFn[]) => ShapeTestFn` |
| `shapeIntersect` | `(...fns: ShapeTestFn[]) => ShapeTestFn` |
| `shapeSubtract` | `(base: ShapeTestFn, cut: ShapeTestFn) => ShapeTestFn` |

## Chart Gestures

Pure Elm-compatible state machine for mouse-driven chart interactions.

```typescript
import {
  createCoordinateMap,
  createChartGestureState,
  chartGestureUpdate,
  checkChartLongPress,
  renderRangeSelection,
  renderPanIndicator,
  registerChartRegions,
} from '@celestial/stellar';
```

### Coordinate Map

```typescript
const map = createCoordinateMap({
  chartX: 5, chartY: 0, chartWidth: 55, chartHeight: 10,
  dataMinX: 0, dataMaxX: 3, dataMinY: 10, dataMaxY: 30,
});

map.cellToData(10, 5);  // { x: ..., y: ... }
map.dataToCell(1.5, 20); // { col: ..., row: ... }
```

`createCoordinateMap(opts: CoordinateMapOpts): ChartCoordinateMap`

### Gesture State Machine

```typescript
const gestureState = createChartGestureState(coordMap, {
  rangeSelect: true,
  pan: false,
  longPress: true,
  scrollZoom: false,
  dragThreshold: 2,
  longPressMs: 500,
});

const { state, messages } = chartGestureUpdate(gestureState, mouseEvent);
const { message, state: newState } = checkChartLongPress(gestureState);
```

`chartGestureUpdate(state: ChartGestureState, event: MouseEventData, now?: number): { state: ChartGestureState; messages: ChartGestureMsg[] }`

`ChartGestureMsg` is a discriminated union: `'chart:click'`, `'chart:hover'`, `'chart:long-press'`, `'chart:range-selecting'`, `'chart:range-selected'`, `'chart:panning'`, `'chart:pan-end'`, `'chart:scroll-zoom'`.

### Gesture Types

`ChartGestureConfig`: `{ rangeSelect: boolean; pan: boolean; longPress: boolean; scrollZoom: boolean; dragThreshold: number; longPressMs: number }` — passed to `createChartGestureState()`. `rangeSelect` and `longPress` default to `true`; `pan` and `scrollZoom` default to `false`.

`ChartGesturePhase`: `'idle' | 'pending' | 'range-selecting' | 'panning'` — current phase of the gesture state machine.

### Visual Overlays

```typescript
renderRangeSelection(gestureState): string
renderPanIndicator(gestureState): string
```

### Layer Types

`ChromeLines`: `{ above?: string[]; below?: string[]; left?: string[]; right?: string[] }` — text lines positioned around the chart body, produced by chrome layers.

`LayerOutput`: Discriminated union produced by each layer's `render()` method:
- `{ type: 'canvas' }` — draws onto the shared BrailleCanvas
- `{ type: 'chrome'; lines: ChromeLines }` — produces text chrome (title, axes, legend)
- `{ type: 'hitRegions'; regions: HitRegion[] }` — provides interactive hit regions
- `{ type: 'shader'; shader: CellShader }` — provides a post-processing shader
- `{ type: 'none' }` — no output for this render pass

`ChartLayer`: `{ readonly name: string; readonly zIndex: number; render(ctx: LayerContext): LayerOutput }` — interface for composable chart layers.

`ComposedChart`: Extends `ChartResult` with `hitRegions: HitRegion[]`, `shaders: CellShader[]`, and `canvas: BrailleCanvas`.

### Nexus Bridge

```typescript
registerChartRegions(regions, hitMap, messageMapper);
```

`registerChartRegions<M>(regions: HitRegion[], hitMap: HitMap<M>, messageMapper: (region: HitRegion) => M): void`

## Responsive Charts

```typescript
import {
  responsiveChart, chartLayoutSub, initChartSizes, updateChartSize, getChartSize,
  lineChartFactory, barChartFactory, scatterChartFactory,
  type ChartSize, type ChartFactory, type ResponsiveChartConfig, type ChartSizeState,
} from '@celestial/stellar';

const vnode = responsiveChart(
  { id: 'my-chart', factory: lineChartFactory({ data: [1, 4, 2, 8, 5], color: ... }), defaultSize: { width: 60, height: 10 } },
  currentSize,
);

const sub = chartLayoutSub(['chart-1', 'chart-2'], (id, size) => ({ type: 'chart:resize', id, size }));
```

| Function | Signature |
|----------|-----------|
| `responsiveChart` | `(config: ResponsiveChartConfig, currentSize: ChartSize) => VNode` |
| `chartLayoutSub` | `<M>(chartIds: string[], toMsg: (id: string, size: ChartSize) => M) => Sub<M>` |
| `initChartSizes` | `() => ChartSizeState` |
| `updateChartSize` | `(state: ChartSizeState, id: string, size: ChartSize) => ChartSizeState` |
| `getChartSize` | `(state: ChartSizeState, id: string, defaultSize?: ChartSize) => ChartSize \| undefined` |
| `lineChartFactory` | `(opts: Omit<LineChartOpts, 'width' \| 'height'>) => ChartFactory` |
| `barChartFactory` | `(opts: Omit<BarChartOpts, 'width' \| 'height'>) => ChartFactory` |
| `scatterChartFactory` | `(opts: Omit<ScatterChartOpts, 'width' \| 'height'>) => ChartFactory` |

`ResponsiveChartConfig`: `{ id: string; factory: ChartFactory; defaultSize?: ChartSize; minSize?: { width?: number; height?: number }; aspectRatio?: number; breakpoints?: { compact?: { maxWidth: number; factory: ChartFactory }; detail?: { minWidth: number; factory: ChartFactory } } }`

## Dataset Abstraction

```typescript
import {
  fromValues, fromPairs, fromLabeled, fromTimeSeries,
  normalize, cumulative, movingAverage, percentChange, resample, mergeDatasets,
  type Dataset, type DataPoint, type DatasetCollection,
} from '@celestial/stellar';

const ds = fromValues([10, 20, 15, 30], { id: 'temp', name: 'Temperature' });
ds.length   // 4
ds.xRange  // [0, 3]
ds.yRange  // [10, 30]
ds.at(1)   // { x: 1, y: 20 }
for (const point of ds) { /* iterate all DataPoints */ }
ds.toValues() // [10, 20, 15, 30]
ds.toPairs()  // [[0, 10], [1, 20], [2, 15], [3, 30]]
ds.map(p => ({ ...p, y: p.y * 2 }));
ds.filter(p => p.y > 15);
ds.slice(0, 2);

const normalized = normalize(ds);
const cum = cumulative(ds);
const ma = movingAverage(ds, 3);
const pct = percentChange(ds);
const resampled = resample(ds, 50);

const collection = mergeDatasets(ds1, ds2);
collection.datasets  // readonly Dataset[]
collection.xRange
collection.yRange
```

| Function | Signature |
|----------|-----------|
| `fromValues` | `(values: number[], opts?: { id?: string; name?: string }) => Dataset` |
| `fromPairs` | `(pairs: [number, number][], opts?: { id?: string; name?: string }) => Dataset` |
| `fromLabeled` | `(items: { label: string; value: number }[], opts?: { id?: string; name?: string }) => Dataset` |
| `fromTimeSeries` | `(entries: { timestamp: number; value: number }[], opts?: { id?: string; name?: string }) => Dataset` |
| `normalize` | `(ds: Dataset) => Dataset` |
| `cumulative` | `(ds: Dataset) => Dataset` |
| `movingAverage` | `(ds: Dataset, window: number) => Dataset` |
| `percentChange` | `(ds: Dataset) => Dataset` |
| `resample` | `(ds: Dataset, targetPoints: number) => Dataset` |
| `mergeDatasets` | `(...datasets: Dataset[]) => DatasetCollection` |

`DataPoint`: `{ readonly x: number; readonly y: number; readonly label?: string; readonly timestamp?: number }`

`Dataset`: `{ readonly id: string; readonly name: string; readonly length: number; at(index: number): DataPoint | undefined; [Symbol.iterator](): Iterator<DataPoint>; readonly xRange: [number, number]; readonly yRange: [number, number]; toValues(): number[]; toPairs(): [number, number][]; map(fn: (point: DataPoint, index: number) => DataPoint): Dataset; filter(fn: (point: DataPoint, index: number) => boolean): Dataset; slice(start?: number, end?: number): Dataset }`

`DatasetCollection`: `{ readonly datasets: readonly Dataset[]; readonly xRange: [number, number]; readonly yRange: [number, number] }`

## Composable Chart Layers

Build charts from independent, composable layers. Each layer draws onto a shared canvas, produces chrome (text), hit regions, or shaders.

```typescript
import {
  composeChart,
  gridLayer, lineDataLayer, barDataLayer, scatterDataLayer,
  titleLayer, yAxisLayer, xAxisLayer, legendLayer,
  inkShaderLayer, hitRegionLayer, customCanvasLayer, customChromeLayer,
  dataRange, scatterRange, barRange,
  type PlotBounds, type LayerContext, type ChartLayer, type ComposedChart,
} from '@celestial/stellar';

const composed = composeChart(40, 10, [
  gridLayer({ horizontal: true, style: 'dotted' }),
  lineDataLayer([1, 4, 2, 8, 5], { filled: true }),
  titleLayer({ title: 'Revenue' }),
  yAxisLayer({ yFormat: v => `${v}%` }),
  legendLayer({ entries: [{ label: 'Revenue', color: color.hex('#4e79a7') }] }),
], { mode: 'braille', xRange: [0, 4], yRange: [1, 8] });

composed.toString();
composed.toVNode();
composed.hitRegions;
composed.shaders;
composed.canvas;
```

| Layer Factory | Signature |
|---------------|-----------|
| `gridLayer` | `(config: GridConfig, zIndex?: number) => ChartLayer` |
| `lineDataLayer` | `(data: number[], opts?: { color?: Color; filled?: boolean }, zIndex?: number) => ChartLayer` |
| `barDataLayer` | `(values: number[], opts?: { color?: Color; colors?: Color[] }, zIndex?: number) => ChartLayer` |
| `scatterDataLayer` | `(data: [number, number][], opts?: { color?: Color; dotRadius?: number }, zIndex?: number) => ChartLayer` |
| `titleLayer` | `(config: TitleConfig, zIndex?: number) => ChartLayer` |
| `yAxisLayer` | `(config?: AxisConfig, zIndex?: number) => ChartLayer` |
| `xAxisLayer` | `(config?: AxisConfig, zIndex?: number) => ChartLayer` |
| `legendLayer` | `(config: LegendConfig, zIndex?: number) => ChartLayer` |
| `inkShaderLayer` | `(ink: InkLayer, zIndex?: number) => ChartLayer` |
| `hitRegionLayer` | `(regions: HitRegion[], zIndex?: number) => ChartLayer` |
| `customCanvasLayer` | `(name: string, drawFn: (ctx: LayerContext) => void, zIndex?: number) => ChartLayer` |
| `customChromeLayer` | `(name: string, chromeFn: (ctx: LayerContext) => ChromeLines, zIndex?: number) => ChartLayer` |

Range helpers:

| Function | Signature |
|----------|-----------|
| `dataRange` | `(data: number[]) => { xRange: [number, number]; yRange: [number, number] }` |
| `scatterRange` | `(data: [number, number][]) => { xRange: [number, number]; yRange: [number, number] }` |
| `barRange` | `(values: number[]) => { xRange: [number, number]; yRange: [number, number] }` |

`composeChart(width, height, layers, opts?)` — `opts`: `{ mode?: CanvasMode; xRange?: [number, number]; yRange?: [number, number] }`.

## Elm Architecture Chart Components

### `embedChart()`

```typescript
import { embedChart, isChartMsg, type ChartModel, type ChartMsg, type EmbedChartConfig } from '@celestial/stellar';

const myChart = embedChart({
  id: 'revenue',
  layers: (model) => [
    gridLayer({ horizontal: true }),
    lineDataLayer(model.data, { filled: true }),
    titleLayer({ title: 'Revenue' }),
  ],
  initialData: [1, 4, 2, 8, 5],
  interactive: {
    coordMapOpts: { chartX: 5, chartY: 0, chartWidth: 55, chartHeight: 10, dataMinX: 0, dataMaxX: 3, dataMinY: 0, dataMaxY: 8 },
  },
  animated: true,
  animationDuration: 30,
});

const [model, cmd] = myChart.init();
const [newModel, newCmd] = myChart.update({ type: 'chart:setData', data: [5, 3, 7] }, model);
const vnode = myChart.view(model);
const subs = myChart.subscriptions(model);
const shaders = myChart.shaders(model);
```

`embedChart<D = number[]>(config: EmbedChartConfig<D>): EmbeddedChart<D>`

`EmbedChartConfig`: `{ id: string; layers: (model: ChartModel<D>) => ChartLayer[]; initialData: D; initialSize?: ChartSize; interactive?: InteractiveConfig | false; animated?: boolean; animationDuration?: number; animationEasing?: EasingFn; mode?: CanvasMode; onGesture?: (msg: ChartGestureMsg) => void }`

`isChartMsg(msg: unknown): msg is ChartMsg` — type guard for routing in a parent app's update function.

### Chart Component Types

`ChartAnimationState`: `{ active: boolean; tick: number; duration: number; easing: EasingFn; progress: number }` — animation state within a chart component, tracking frame progress.

`EmbeddedChart<D>`: Return type of `embedChart()`. Exposes `init()`, `update()`, `view()`, `subscriptions()`, and `shaders()`.

`InteractiveConfig`: `{ coordMapOpts: CoordinateMapOpts; gestureConfig?: Partial<ChartGestureConfig> }` — interactive mode configuration for `embedChart()`.

### `chartAppConfig()`

Convenience wrapper that returns a standalone `AppConfig` ready for `app()`.

```typescript
import { chartAppConfig } from '@celestial/stellar';

const config = chartAppConfig({
  id: 'demo',
  layers: (model) => [lineDataLayer(model.data)],
  initialData: [1, 4, 2, 8],
});
```

## Chart Accessibility & Theming

### Color Palettes

```typescript
import {
  VIVID_PALETTE, COLORBLIND_PALETTE, PASTEL_PALETTE, MONOCHROME_PALETTE,
  getPalette, seriesColor,
  type ChartPalette, type PaletteName,
} from '@celestial/stellar';

const palette: ChartPalette = getPalette('colorblind');
const c = seriesColor(palette, 3);
```

### Theme Integration

```typescript
import { chartThemeFromSemantic, themeChartColors, type ChartTheme } from '@celestial/stellar';

const theme: ChartTheme = chartThemeFromSemantic();
const colors = themeChartColors(theme.theme);
```

### Color Degradation

```typescript
import { degradePalette, autoDegradePalette } from '@celestial/stellar';

const degraded = degradePalette(VIVID_PALETTE, '256');
const auto = autoDegradePalette(VIVID_PALETTE);
```

### Reduced Motion

```typescript
import { shouldAnimate } from '@celestial/stellar';

if (shouldAnimate()) {
  // enable animation
}
```

Returns `false` if `NO_MOTION=1` or `REDUCE_MOTION=1` is set.

### Screen Reader Support

```typescript
import { describeChart, announceChartUpdate } from '@celestial/stellar';

const description = describeChart({
  title: 'Revenue',
  chartType: 'line',
  series: [{ label: 'Monthly', values: [10, 20, 15, 30] }],
  xAxisLabel: 'Month',
  yAxisLabel: 'Revenue ($)',
});

const announcement = announceChartUpdate('Chart updated: revenue increased by 15%');
```

`DescribeChartOpts`: `{ title?: string; chartType?: string; series?: ReadonlyArray<{ label?: string; values: readonly number[] }>; xAxisLabel?: string; yAxisLabel?: string; summary?: string }` — options for `describeChart()`.

### High Contrast

```typescript
import { highContrastChrome, stripChrome } from '@celestial/stellar';

const bold = highContrastChrome(styledLines);
const plain = stripChrome(styledLines);
```

### RGB Bridge

```typescript
import { colorToRgb, rgbToColor, paletteToRgb, rgbToPalette } from '@celestial/stellar';

const rgb = colorToRgb(color.hex('#ff0000')); // [255, 0, 0]
const c = rgbToColor([255, 0, 0]);
const rgbs = paletteToRgb(VIVID_PALETTE);
const pal = rgbToPalette(rgbs);
```

### WCAG Contrast Validation

```typescript
import { validateContrast, accessiblePalette } from '@celestial/stellar';

const results = validateContrast(COLORBLIND_PALETTE, color.hex('#ffffff'), 'AA');
const safe = accessiblePalette(VIVID_PALETTE, color.hex('#ffffff'), 'AAA');
```

`ContrastResult`: `{ color: Color; index: number; ratio: number; passes: boolean }` — result of validating a single palette color against a background. `ratio` is the WCAG contrast ratio (1–21).

## Export Pipeline

```typescript
import {
  toAnsi, toPlainText, toHtml, toSvg, toPixelData,
  exportChartAsPlainText, exportChartAsHtml,
  type PixelGrid, type ColorPixelGrid,
} from '@celestial/stellar';
```

### Canvas Exports

```typescript
const cvs = canvas(40, 10);

toAnsi(cvs)
toPlainText(cvs, { trailingNewline: true })
toHtml(cvs, { fullDocument: false, background: '#1e1e2e', defaultForeground: '#cdd6f4' })
toSvg(cvs, { pixelSize: 4, pixelGap: 0.5, background: '#1e1e2e', xmlDeclaration: false })
toPixelData(cvs, { includeColors: true })
```

### Chart Result Exports

```typescript
exportChartAsPlainText(chartResult)
exportChartAsHtml(chartResult, { fullDocument: true })
```

### Export Option Types

| Type | Key Options |
|------|-------------|
| `SvgExportOpts` | `pixelSize`, `pixelGap`, `background`, `defaultForeground`, `xmlDeclaration`, `className` |
| `HtmlExportOpts` | `fullDocument`, `fontFamily`, `fontSize`, `background`, `defaultForeground`, `className`, `lineHeight` |
| `PlainTextExportOpts` | `trailingNewline` |
| `PixelDataExportOpts` | `includeColors` |

## Dashboard Composition

```typescript
import {
  chartPanel, staticPanel, dashboardGrid, dashboardStack, dashboardRow, panelFrame,
  dashboardAppConfig, isDashboardMsg, getPanelModel, updatePanelData, getPanelIds, getChartPanelCount,
  type DashboardModel, type DashboardMsg, type DashboardLayoutMode, type DashboardConfig,
} from '@celestial/stellar';
```

### Panel Descriptors

```typescript
const chartPnl = chartPanel<D = number[]>({
  id: 'cpu',
  title: 'CPU Usage',
  chart: embedChart({ id: 'cpu', layers: ..., initialData: [10, 20, 15] }),
  minWidth: 20,
  minHeight: 5,
  colSpan: 1,
});

const staticPnl = staticPanel({
  id: 'info',
  title: 'Status',
  content: text('OK'),
  colSpan: 2,
});
```

`ChartPanelConfig<D>`: `{ id: string; title?: string; chart: EmbeddedChart<D>; minWidth?: number; minHeight?: number; colSpan?: number }` — config for a chart-backed panel.

`StaticPanelConfig`: `{ id: string; title?: string; content: VNode; minWidth?: number; minHeight?: number; colSpan?: number }` — config for a static (non-chart) panel.

`DashboardPanelDescriptor<D>`: Discriminated union — `{ kind: 'chart'; config: ChartPanelConfig<D> }` | `{ kind: 'static'; config: StaticPanelConfig }`.

`PanelState`: `{ kind: 'chart'; id: string; title: string | undefined; model: ChartModel<D>; chart: EmbeddedChart<D>; colSpan: number }` | `{ kind: 'static'; id: string; title: string | undefined; content: VNode; colSpan: number }`.

### Layout Helpers

```typescript
dashboardGrid(panels, { columns: 2, gap: 1 })
dashboardStack(panels, { gap: 1 })
dashboardRow(panels, { gap: 1 })
panelFrame(content, { title: 'Title', bordered: true, width: 40 })
```

### Dashboard App Config

```typescript
const dashboard = dashboardAppConfig({
  panels: [chartPnl, staticPnl],
  layout: 'grid',
  columns: 2,
  gap: 1,
  title: 'System Monitor',
});

import { app } from '@celestial/nebula';

app(dashboard);
```

`dashboardAppConfig(config: DashboardConfig)` returns `{ init, update, view, subscriptions, shaders }`.

### Dashboard Helpers

| Function | Signature |
|----------|-----------|
| `getPanelModel` | `(model: DashboardModel, panelId: string) => ChartModel \| undefined` |
| `updatePanelData` | `(panelId: string, data: unknown) => DashboardMsg` |
| `getPanelIds` | `(model: DashboardModel) => string[]` |
| `getChartPanelCount` | `(model: DashboardModel) => number` |
| `isDashboardMsg` | `(msg: unknown) => msg is DashboardMsg` |

## Related Packages

- **@celestial/nebula** - Elm Architecture runtime, VDOM, signals, shaders
- **@celestial/corona** - Colors, styling, themes, accessibility
- **@celestial/nexus** - Mouse tracking, hit regions, clipboard
- **@celestial/aurora** - Animation easing, tweens, springs
- **@celestial/constellation** - UI components (wraps dashboard panels)

## License

MIT
