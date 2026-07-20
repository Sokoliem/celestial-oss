export {
  type A11yLevel,
  type AnnouncePriority,
  announceText,
  auditDomainTokenCoverage,
  auditTheme,
  type ContrastViolation,
  type DomainTokenAuditOptions,
  type DomainTokenAuditReport,
  type DomainTokenAuditViolation,
  ensureReadableColor,
  ensureDistinctColor,
  ensureReadableBackground,
  highContrast,
  normalizeThemeContrast,
  reduceMotion,
  stripAllStyles,
  type ThemeA11yReport,
  type ThemeAuditOptions,
  type ThemeAuditReport,
  type ThemeAuditWarning,
  validateThemeContrast,
} from './a11y.js';
export { type Border, type BorderChars, border, type FocusBorderOptions, type GradientBorderOpts, renderGradientBorder, type TitleAlign } from './border.js';
export { accentMix, type Color, type ColorLevel, color, colorToHex, HUE_ANCHORS, type HueName, hslToRgb, isColorLike } from './color.js';
// resetColorLevelCache intentionally NOT re-exported — test-only escape hatch.
// Widget color bridge
export {
  type ColorBridge,
  defineColorBridge,
  mergeColorBridge,
  type ResolvedColorBridge,
  resolveColorBridge,
} from './color-bridge.js';
// CSS variable codegen
export { type CssVarOptions, themeToCssVars } from './css-export.js';
export { type CVDType, simulateColorBlindness } from './cvd.js';
// Domain token extensibility
export {
  ACTIVITY_GLYPHS,
  ACTIVITY_TOKEN_VALUES,
  type ActivityDescriptor,
  type ActivityMotion,
  type ActivityState,
  type ActivityTokenValues,
  type AppChromeTokenValues,
  activityFamily,
  activityTokens,
  type AnsiPaletteTokenValues,
  ansiPaletteTokens,
  appChromeTokens,
  CHROME_PIN_GLYPH,
  type ChromeTokenValues,
  type ClaudeModel,
  type ClaudeTool,
  COST_GLYPHS,
  type CostThresholds,
  type CostTokenValues,
  type CursorStyleValue,
  type CursorTokenValues,
  chromeTokens,
  classifyModelName,
  classifyToolName,
  costTier,
  costTokens,
  cursorStyleTokens,
  cursorTokens,
  DEFAULT_COST_THRESHOLDS,
  type DiffTokenValues,
  type DomainTokenContract,
  type DomainTokenFamily,
  type DomainTokenGlyph,
  defineDomainTokens,
  diffTokens,
  ELEVATION_LEVEL_KEYS,
  type ElevationStepTokens,
  type ElevationTokenValues,
  type ElevationTokenValuesBySemantic,
  elevationTokens,
  elevationTokensBySemantic,
  type GitTokenValues,
  gitTokens,
  interpolateMeter,
  type LifecycleTokenValues,
  lifecycleTokens,
  type MeterLevel,
  type MeterTokenValues,
  MODEL_GLYPHS,
  MODEL_TOKEN_VALUES,
  type ModelTokenValues,
  meterLevel,
  meterTokens,
  modelFamily,
  modelTokens,
  PERMISSION_TOKEN_VALUES,
  type PermissionTokenValue,
  type PermissionTokenValues,
  PHASE_GLYPHS,
  PHASE_TOKEN_VALUES,
  type PhaseTokenValues,
  permissionColorTokens,
  permissionTokens,
  phaseFamily,
  phaseTokens,
  type ResolvedDomainTokens,
  resolveActivity,
  resolveDomainTokens,
  resolveFamilyGlyph,
  type SafetyTokenValue,
  type SafetyTokenValues,
  type SessionPhase,
  SOURCE_GLYPHS,
  SOURCE_TOKEN_VALUES,
  type SourceTokenValue,
  type SourceTokenValues,
  type StatusTokenValues,
  type SurfaceStateTokenValues,
  type SyntaxTokenValues,
  safetyTokens,
  sourceColorTokens,
  sourceTokens,
  statusTokens,
  surfaceStateTokens,
  syntaxTokens,
  TOOL_GLYPHS,
  TOOL_TOKEN_VALUES,
  type ToolTokenValues,
  toolFamily,
  toolTokens,
} from './domain-tokens.js';
// Family resolvers — { value, color, glyph, label } in one call
export { type FamilyResolveOptions, type ResolvedFamilyValue, resolveModel, resolvePhase, resolveTool } from './family-resolvers.js';
// Cell formatting and type detection
export {
  alignmentForType,
  type CellType,
  detectColumnType,
  detectType,
  displayValue,
  type FormatOptions,
  formatCell,
  formatFloat,
  formatInteger,
} from './format.js';
export { type AspectCorrectCellsOpts, aspectCorrectCells, CELL_ASPECT_RATIO } from './geometry.js';
export { DEFAULT_GLYPH_TOKENS, type GlyphLevel, type GlyphToken, resolveGlyph, resolveGlyphs } from './glyphs.js';
export { type Gradient, type GradientStop, gradient } from './gradient.js';
export { type AutoSizeOptions, autoSizeColumns, type ColumnSizing, joinH, joinV, place, table, wrap } from './layout.js';
export { compact, json, pretty } from './log/formatter.js';
export { LOG_LEVELS, shouldLog } from './log/levels.js';
// Logging
export { createLogger } from './log/logger.js';
export { consoleTransport, jsonTransport } from './log/transport.js';
export type { FormatterFn, LogEntry, Logger, LoggerConfig, LogLevel, Transport } from './log/types.js';
export { generatePalette, type Palette, type PaletteMode } from './palette.js';
// PTY color transforms
export {
  createAnsi16Remap,
  createPtyThemeTransform,
  createPtyTransform,
  hexToRgb,
  lightTransform,
  monoTransform,
  type PtyColorTransform,
  type PtyThemeConfig,
  type PtyTransformVariant,
  rgbToHex,
  sepiaTransform,
} from './pty-transform.js';
export {
  alternate,
  beside,
  bold,
  colorize,
  concat,
  dim,
  fillEmpty,
  gradient as spinnerGradient,
  mapFrames,
  mirror,
  pad,
  prefix,
  rainbow,
  reverse,
  sample,
  slide,
  speed,
  stretch,
  suffix,
} from './spinner/compose.js';
export { fromFrames, listNames, lookup, procedural, registerAll, renderAt, resolve } from './spinner/engine.js';
export { type SpinnerFrame, spinnerSub } from './spinner/sub.js';
// Spinners
export type { Frame, ResolvedSpinner, RunnerOptions, SpinnerDefinition, SpinnerTransform } from './spinner/types.js';
export { symbols } from './spinner/types.js';
export {
  type BreakpointName,
  mergeStyles,
  type ResolvedStyleProps,
  type Responsive,
  type Style,
  type StyleEffects,
  type StyleProps,
  style,
  truncate,
} from './style.js';
// Surface tokens — z-stack, scrollbar/track/caret/range/toggle/rail/selection/checkbox glyphs,
// annotation-highlight palette (Phase 0 P0-11 + Phase −1 addendum WRAP-028..WRAP-032)
export {
  type AnnotationHighlightSlot,
  type AnnotationHighlightSwatch,
  type AnnotationHighlightTokenValues,
  annotationHighlightSwatches,
  annotationHighlightTokens,
  type CheckboxGlyphs,
  caretGlyph,
  checkboxGlyphs,
  type RangeIndicatorGlyphs,
  railGlyph,
  rangeIndicatorGlyphs,
  resolveAnnotationHighlight,
  resolveSurfaceZ,
  type ScrollbarGlyphs,
  type SelectionPrefixGlyphs,
  type SurfaceZKind,
  scrollbarGlyphs,
  selectionPrefixGlyphs,
  surfaceGlyphTokens,
  surfaceZTokens,
  type ToggleTrackGlyphs,
  type TrackGlyphs,
  toggleTrackGlyphs,
  trackGlyphs,
} from './surface-tokens.js';
// Table-specific border system with 18 styles and grid rendering
export {
  getTableBorder,
  listTableBorders,
  type RenderTableOptions,
  renderTableGrid,
  type TableBorderChars,
  type TableBorderStyle,
  tableBorder,
} from './table-border.js';
// Static table renderer
export {
  type RenderStaticTableOptions,
  renderStaticTable,
} from './table-render.js';
// Table themes
export {
  autoTableTheme,
  createTableTheme,
  darkTableTheme,
  lightTableTheme,
  type TableTheme,
} from './table-theme.js';
// Terminal detection — presentation-facing facades. atlas owns the
// detection primitives; corona's wrappers stay public for users who
// already consume corona-the-presentation-layer and don't want a
// second package on their import path.
export {
  type BackgroundMode,
  detectBackground,
  detectBackgroundAsync,
  isTTY,
  supportsColor,
  terminalHeight,
  terminalWidth,
} from './terminal.js';
export {
  applyVariant,
  type ColorScale,
  createTheme,
  DEFAULT_RESPONSIVE_TYPOGRAPHY,
  darkVariant,
  defaultTheme,
  defineThemeVariant,
  type ElevationBorderStyle,
  type ElevationLevel,
  type ElevationToken,
  extendTheme,
  generateScale,
  highContrastVariant,
  type InteractionState,
  interpolateTheme,
  lightVariant,
  type MotionDuration,
  type MotionEasing,
  type MotionEasingFn,
  type MotionSpring,
  type MotionSpringPreset,
  type ResponsiveTypographyToken,
  resolveScale,
  resolveSpacing,
  resolveToneColor,
  SCALE_STEPS,
  type ScaleStep,
  type SemanticTheme,
  type Size,
  type StateToken,
  spacingGap,
  spacingScale,
  type Theme,
  type ThemeColors,
  type ThemeElevation,
  type ThemeGlyphs,
  type ThemeInput,
  type ThemeMotion,
  type ThemeStates,
  type ThemeTypography,
  type ThemeVariant,
  type Tone,
  type TypographyToken,
  theme,
  toResponsiveTypography,
  typographyStyle,
} from './theme.js';
// Mirage effect tokens — stencil glyph + highlight color (Phase 2.3, 2.4)
export { highlightColor, stencilGlyph } from './tokens/mirage.js';
// Popover glyph tokens — center caret used by popover surface (Phase 2.1)
export { type PopoverGlyphTokens, popoverGlyphs } from './tokens/popover.js';
// Progress bar tokens — fill / empty / bracket glyphs + color resolvers
export { defaultProgressBarTokens, type ProgressBarTokens } from './tokens/progress-bar.js';
// Status glyph tokens — surface vocabulary for success/warning/danger/info/pending/offline/queued/neutral
export { type StatusKind, statusGlyphTokens } from './tokens/status-glyphs.js';
// Tooltip variant glyph tokens — per-variant prefix glyphs (Phase 2.2)
export { type TooltipVariantKind, tooltipVariantGlyphs } from './tokens/tooltip.js';
export {
  type BaseTokens,
  baseTokensMixin,
  type ContainerTokens,
  containerTokensMixin,
  type FeedbackTokens,
  type FormTokens,
  feedbackTokensMixin,
  formTokensMixin,
  type InteractiveTokens,
  interactiveTokensMixin,
  mergeContracts,
  type ResolvedTokens,
  resolveComponentTokens,
  resolveTokens,
  type SurfaceTokens,
  surfaceTokensMixin,
  type TokenContract,
} from './tokens.js';

import * as spinners from './spinner/spinners.js';

export { renderShadow, type ShadowOpts } from './shadow.js';
export type { SpinnerInstance } from './spinner/runner.js';
export { createSpinner } from './spinner/runner.js';
export { charWidth, stringWidth } from './unicode-width.js';
export { stripAnsi, visualWidth } from './utils.js';
export { spinners };
