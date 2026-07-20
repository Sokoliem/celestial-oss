// ── Canvas & Drawing ─────────────────────────────────────────────────────

// ── Animation ────────────────────────────────────────────────────────────
export { type AnimateBarChartConfig, type AnimateLineChartConfig, animateBarChart, animateData, animateLineChart } from './animate.js';
export { type AreaChartOpts, type AreaChartResult, type AreaSeries, areaChart } from './area.js';
export { type BrailleCanvas, type CanvasMode, type CanvasModeOrAuto, canvas, type ModeCapabilities } from './canvas.js';
// ── Core Charts ──────────────────────────────────────────────────────────
export { type BarChartOpts, type ChartResult, chart, type LineChartOpts, type ScatterChartOpts, type StackedBarChartOpts } from './chart.js';
// ── Chart Accessibility & Theming ───────────────────────────────────────
export {
  accessiblePalette,
  announceChartUpdate,
  autoDegradePalette,
  type ChartPalette,
  type ChartTheme,
  COLORBLIND_PALETTE,
  type ContrastResult,
  chartThemeFromSemantic,
  colorToRgb,
  type DescribeChartOpts,
  degradePalette,
  describeChart,
  getPalette,
  highContrastChrome,
  MONOCHROME_PALETTE,
  PASTEL_PALETTE,
  type PaletteName,
  paletteToRgb,
  rgbToColor,
  rgbToPalette,
  seriesColor,
  shouldAnimate,
  stripChrome,
  themeChartColors,
  VIVID_PALETTE,
  validateContrast,
} from './chart-a11y.js';
// ── Elm Architecture Chart Components ───────────────────────────────────
export {
  type ChartAnimationState,
  type ChartModel,
  type ChartMsg,
  chartAppConfig,
  type EmbedChartConfig,
  type EmbeddedChart,
  embedChart,
  type InteractiveConfig,
  isChartMsg,
} from './chart-component.js';
// ── Chart Gestures ──────────────────────────────────────────────────────
export {
  type ChartCoordinateMap,
  type ChartGestureConfig,
  type ChartGestureMsg,
  type ChartGesturePhase,
  type ChartGestureState,
  type CoordinateMapOpts,
  chartGestureUpdate,
  checkChartLongPress,
  createChartGestureState,
  createCoordinateMap,
  type MouseEventData,
  registerChartRegions,
  renderPanIndicator,
  renderRangeSelection,
} from './chart-gestures.js';
// ── Chart Infrastructure ─────────────────────────────────────────────────
export {
  type AxisConfig,
  type ChartChrome,
  composeChartChrome,
  computeTicks,
  defaultFormat,
  drawGrid,
  type GridConfig,
  type GridStyle,
  type LegendConfig,
  type LegendEntry,
  type LegendPosition,
  renderLegend,
  renderTitle,
  renderXTickLabels,
  renderYTickLabels,
  responsiveSize,
  type TickFormatter,
  type TitleConfig,
} from './chart-utils.js';
// ── Cell Codecs ──────────────────────────────────────────────────────────
export { type CellCodec, getCodec } from './codec.js';
export { type CellColor, ColorMap } from './color-map.js';
// ── Dashboard Composition ───────────────────────────────────────────────────
export {
  type ChartPanelConfig,
  chartPanel,
  type DashboardConfig,
  type DashboardLayoutMode,
  type DashboardModel,
  type DashboardMsg,
  type DashboardPanelDescriptor,
  dashboardAppConfig,
  dashboardGrid,
  dashboardRow,
  dashboardStack,
  getChartPanelCount,
  getPanelIds,
  getPanelModel,
  isDashboardMsg,
  type PanelState,
  panelFrame,
  type StaticPanelConfig,
  staticPanel,
  updatePanelData,
} from './dashboard.js';
// ── Dataset Abstraction ─────────────────────────────────────────────────
export {
  cumulative,
  type DataPoint,
  type Dataset,
  type DatasetCollection,
  fromLabeled,
  fromPairs,
  fromTimeSeries,
  fromValues,
  merge as mergeDatasets,
  movingAverage,
  normalize,
  percentChange,
  resample,
} from './dataset.js';
export { drawCircle, drawLine, drawRect, drawText, drawTextHD, fillCircle, fillRect } from './draw.js';
// ── Export Pipeline ─────────────────────────────────────────────────────────
export {
  type ColorPixelGrid,
  exportChartAsHtml,
  exportChartAsPlainText,
  type HtmlExportOpts,
  type PixelDataExportOpts,
  type PixelGrid,
  type PlainTextExportOpts,
  type SvgExportOpts,
  toAnsi,
  toHtml,
  toPixelData,
  toPlainText,
  toSvg,
} from './export-pipeline.js';
export { GLYPH_SPACING, type Glyph, getGlyph } from './font.js';
export { GLYPH_HD_SPACING, type GlyphHD, getGlyphHD } from './font-hd.js';
export { type ArcGaugeOpts, arcGauge, type BarGaugeOpts, barGauge, type GaugeResult } from './gauge.js';
export { type HeatmapColorStop, type HeatmapOpts, type HeatmapResult, heatmap } from './heatmap.js';
// ── Ink Layer (Persistent Drawing / Annotations) ─────────────────────────
export {
  annotation,
  arrow,
  type BlendMode,
  circle as inkCircle,
  highlight,
  InkLayer,
  type InkMark,
  type InkOptions,
  type InkState,
  type Point,
  pen,
  rect as inkRect,
} from './ink.js';
// ── Interactivity ────────────────────────────────────────────────────────
export {
  buildBarHitRegions,
  buildPointHitRegions,
  type CrosshairState,
  createInteractiveChart,
  type HitRegion,
  type HitTestStrategy,
  type InteractiveChart,
  type InteractiveChartOpts,
  type SelectionState,
  type TooltipData,
} from './interactive.js';
// ── Composable Chart Layers ─────────────────────────────────────────────
export {
  barDataLayer,
  barRange,
  type ChartLayer,
  type ChromeLines,
  type ComposedChart,
  composeChart,
  customCanvasLayer,
  customChromeLayer,
  dataRange,
  gridLayer,
  hitRegionLayer,
  inkShaderLayer,
  type LayerContext,
  type LayerOutput,
  legendLayer,
  lineDataLayer,
  type PlotBounds,
  scatterDataLayer,
  scatterRange,
  titleLayer,
  xAxisLayer,
  yAxisLayer,
} from './layers.js';
// ── Math Utilities ───────────────────────────────────────────────────────
export { safeMax, safeMin, safeMinMax } from './math-utils.js';
// ── New Chart Types ──────────────────────────────────────────────────────
export { type PieChartOpts, type PieChartResult, type PieSegment, pieChart } from './pie.js';
export { resolveCanvasMode } from './resolve-mode.js';
// ── Responsive Charts ───────────────────────────────────────────────────
export {
  barChartFactory,
  type ChartFactory,
  type ChartSize,
  type ChartSizeState,
  chartLayoutSub,
  getChartSize,
  initChartSizes,
  lineChartFactory,
  type ResponsiveChartConfig,
  responsiveChart,
  scatterChartFactory,
  updateChartSize,
} from './responsive-chart.js';
// Back-compat alias — re-exports `subcellOutline` under the original
// shipped name. May be removed in a future minor.
export {
  type SextantOutlineOpts,
  type SextantOutlineResult,
  type SextantOutlineRow,
  sextantOutline,
} from './sextant-outline.js';
// ── Shape Hit-Testing ───────────────────────────────────────────────────
export {
  circle as shapeCircle,
  ellipse as shapeEllipse,
  isInsideCircle,
  isInsideEllipse,
  isInsidePolygon,
  isInsideRing,
  isInsideRoundedRect,
  isInsideStar,
  polygon as shapePolygon,
  ring as shapeRing,
  roundedRect as shapeRoundedRect,
  type ShapeTestFn,
  shapeIntersect,
  shapeSubtract,
  shapeUnion,
  star as shapeStar,
} from './shapes.js';
export { type SparklineOpts, type SparklineResult, sparkline } from './sparkline.js';
// ── Statistical Chart Types ─────────────────────────────────────────────
export {
  type BoxPlotDatum,
  type BoxPlotOpts,
  type BulletOpts,
  boxPlot,
  bullet,
  type CandleDatum,
  type CandlestickOpts,
  candlestick,
  type HistogramOpts,
  type HistogramResult,
  histogram,
  type StatsChartResult,
  type WaterfallDatum,
  type WaterfallOpts,
  waterfall,
} from './stats-charts.js';
// ── Streaming ────────────────────────────────────────────────────────────
export {
  createStreamingChart,
  type StreamingChart,
  type StreamingChartOpts,
  type StreamingChartType,
  type StreamingUpdateCallback,
} from './streaming.js';
export {
  type DensityReducer,
  type SubcellOutlineOpts,
  type SubcellOutlineResult,
  type SubcellOutlineRow,
  subcellOutline,
} from './subcell-outline.js';
