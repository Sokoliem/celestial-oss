/**
 * Chart Accessibility & Theming
 *
 * Bridges corona's color system, themes, accessibility features, and
 * WCAG validation into stellar's chart rendering. Provides:
 *
 *  - **Color palettes** — default vivid and colorblind-safe presets
 *    with automatic series color cycling.
 *  - **Theme integration** — resolve `SemanticTheme` tone colors into
 *    chart series palettes.
 *  - **Color degradation** — downgrade palettes for lower terminal
 *    color levels (256, 16, none).
 *  - **Reduced motion** — gate animations based on user preference.
 *  - **Screen reader** — text descriptions of chart data for
 *    `Cmd.announce()`.
 *  - **High contrast** — bold, unstyled chrome text for high-contrast
 *    terminals.
 *  - **RGB ↔ Color bridge** — convert between ink's `RGB` tuples and
 *    corona `Color` objects.
 *  - **WCAG contrast validation** — check palette colors against a
 *    background for AA/AAA compliance.
 *
 * All functions are pure — no side effects beyond reading environment
 * variables (via corona's `reduceMotion()` / `color.level`).
 */

import {
  type AnnouncePriority,
  announceText,
  type Color,
  type ColorLevel,
  color,
  createTheme,
  highContrast,
  reduceMotion,
  type SemanticTheme,
  sanitizeTerminalText,
  stripAllStyles,
  type Tone,
} from '@celestial/corona';
import type { RGB } from '@celestial/nebula';
import { safeMinMax } from './math-utils.js';
import { finiteValues } from './validation.js';

// ── Color Palettes ───────────────────────────────────────────────────────

/**
 * A chart color palette — an ordered list of colors for series cycling.
 *
 * Access colors via `palette[seriesIndex % palette.length]` or use
 * the helper `seriesColor(palette, index)`.
 */
export type ChartPalette = readonly Color[];

/** Preset palette names. */
export type PaletteName = 'vivid' | 'colorblind' | 'pastel' | 'monochrome';

/**
 * Vivid default palette — 8 distinct hues, chosen for max
 * perceptual distance at the default terminal color level.
 * Not colorblind-safe — use `COLORBLIND_PALETTE` for that.
 */
export const VIVID_PALETTE: ChartPalette = [
  color.hex('#4e79a7'), // steel blue
  color.hex('#f28e2b'), // orange
  color.hex('#e15759'), // red
  color.hex('#76b7b2'), // teal
  color.hex('#59a14f'), // green
  color.hex('#edc948'), // yellow
  color.hex('#b07aa1'), // purple
  color.hex('#ff9da7'), // pink
] as const;

/**
 * Colorblind-safe palette (8 colors) — derived from the
 * Okabe-Ito palette, which is safe for protanopia, deuteranopia,
 * and tritanopia.
 */
export const COLORBLIND_PALETTE: ChartPalette = [
  color.hex('#0072b2'), // blue
  color.hex('#e69f00'), // orange
  color.hex('#009e73'), // green
  color.hex('#cc79a7'), // reddish purple
  color.hex('#56b4e9'), // sky blue
  color.hex('#d55e00'), // vermillion
  color.hex('#f0e442'), // yellow
  color.hex('#000000'), // black
] as const;

/**
 * Pastel palette — softer tones, good for backgrounds or
 * less visually intense charts.
 */
export const PASTEL_PALETTE: ChartPalette = [
  color.hex('#a6cee3'),
  color.hex('#fdbf6f'),
  color.hex('#fb9a99'),
  color.hex('#b2df8a'),
  color.hex('#cab2d6'),
  color.hex('#ffff99'),
  color.hex('#b3b3b3'),
  color.hex('#fccde5'),
] as const;

/**
 * Monochrome palette — grayscale ramp for terminals with no color,
 * or when color is intentionally omitted.
 */
export const MONOCHROME_PALETTE: ChartPalette = [
  color.hex('#ffffff'),
  color.hex('#cccccc'),
  color.hex('#999999'),
  color.hex('#666666'),
  color.hex('#444444'),
  color.hex('#222222'),
  color.hex('#aaaaaa'),
  color.hex('#777777'),
] as const;

/** Look up a preset palette by name. */
export function getPalette(name: PaletteName): ChartPalette {
  switch (name) {
    case 'vivid':
      return VIVID_PALETTE;
    case 'colorblind':
      return COLORBLIND_PALETTE;
    case 'pastel':
      return PASTEL_PALETTE;
    case 'monochrome':
      return MONOCHROME_PALETTE;
    default:
      return VIVID_PALETTE;
  }
}

/**
 * Get the color for a given series index, cycling through the palette.
 *
 * @param palette - The chart palette.
 * @param index - Zero-based series index.
 * @returns The color at `index % palette.length`.
 */
export function seriesColor(palette: ChartPalette, index: number): Color {
  if (palette.length === 0) throw new RangeError('chart palette must contain at least one color');
  const safeIndex = Number.isFinite(index) ? Math.trunc(index) : 0;
  return palette[((safeIndex % palette.length) + palette.length) % palette.length]!;
}

// ── Theme Integration ────────────────────────────────────────────────────

/**
 * Chart theme — a minimal type combining a semantic theme with chart-specific
 * overrides. If only `palette` is provided, the rest comes from `defaultTheme`.
 */
export interface ChartTheme {
  /** The underlying semantic theme for general colors. */
  readonly theme: SemanticTheme;
  /** Series color palette (overrides tone-derived palette). */
  readonly palette: ChartPalette;
  /** Whether to use high contrast mode (bold unstyled chrome). */
  readonly highContrast: boolean;
}

/**
 * Build a ChartTheme from a SemanticTheme, using its tone colors
 * as the series palette.
 *
 * Tone order: accent, info, success, warning, danger, neutral —
 * accent first for maximal visual differentiation.
 *
 * @param themeInput - A SemanticTheme (or partial to merge onto default).
 * @param opts - Optional overrides.
 */
export function chartThemeFromSemantic(themeInput?: SemanticTheme, opts?: { highContrast?: boolean; palette?: ChartPalette }): ChartTheme {
  const theme = themeInput ?? createTheme();
  const toneOrder: Tone[] = ['accent', 'info', 'success', 'warning', 'danger', 'neutral'];
  const tonePalette: Color[] = toneOrder.map((t) => theme.colors.tones[t]);

  return {
    theme,
    palette: opts?.palette ?? tonePalette,
    highContrast: opts?.highContrast ?? false,
  };
}

/**
 * Extract the core chart-relevant colors from a SemanticTheme.
 */
export function themeChartColors(theme: SemanticTheme): {
  text: Color;
  muted: Color;
  border: Color;
  surface: Color;
} {
  return {
    text: theme.colors.text,
    muted: theme.colors.muted,
    border: theme.colors.border,
    surface: theme.colors.surface,
  };
}

// ── Color Degradation ────────────────────────────────────────────────────

/**
 * Degrade all colors in a palette to a given terminal color level.
 *
 * @param palette - Input palette.
 * @param level - Target color level.
 * @returns A new palette with all colors degraded.
 */
export function degradePalette(palette: ChartPalette, level: ColorLevel): ChartPalette {
  return palette.map((c) => c.degrade(level));
}

/**
 * Auto-degrade a palette to the current terminal's detected color level.
 *
 * Uses corona's `color.level` detection (reads NO_COLOR, FORCE_COLOR,
 * COLORTERM, TERM environment variables).
 */
export function autoDegradePalette(palette: ChartPalette): ChartPalette {
  const level = color.level;
  if (level === 'truecolor') return palette;
  return degradePalette(palette, level);
}

// ── Reduced Motion ───────────────────────────────────────────────────────

/**
 * Whether chart animations should be enabled.
 *
 * Returns `false` if the user has set `NO_MOTION=1`, `REDUCE_MOTION=1`,
 * or similar environment variables (via corona's `reduceMotion()`).
 *
 * Usage in chart-component:
 * ```ts
 * const animated = shouldAnimate() && config.animated;
 * ```
 */
export function shouldAnimate(): boolean {
  return !reduceMotion();
}

// ── Screen Reader Descriptions ───────────────────────────────────────────

/** Options for chart description generation. */
export interface DescribeChartOpts {
  /** Chart title. */
  title?: string;
  /** Chart type (e.g., 'line', 'bar', 'scatter', 'pie'). */
  chartType?: string;
  /** Series data — each entry is `{ label, values }`. */
  series?: ReadonlyArray<{ label?: string; values: readonly number[] }>;
  /** Axis labels. */
  xAxisLabel?: string;
  yAxisLabel?: string;
  /** Additional context. */
  summary?: string;
}

/**
 * Generate a text description of a chart for screen readers.
 *
 * Produces a structured English description including:
 * - Chart type and title
 * - Data summary (min, max, mean) per series
 * - Axis labels
 *
 * The output is suitable for `Cmd.announce()` in a nebula app.
 */
export function describeChart(opts: DescribeChartOpts): string {
  const parts: string[] = [];

  // Title + type
  const typeLabel = opts.chartType ?? 'chart';
  if (opts.title) {
    parts.push(`${opts.title}. ${capitalize(typeLabel)} chart.`);
  } else {
    parts.push(`${capitalize(typeLabel)} chart.`);
  }

  // Axis labels
  if (opts.xAxisLabel || opts.yAxisLabel) {
    const axes: string[] = [];
    if (opts.xAxisLabel) axes.push(`X axis: ${opts.xAxisLabel}`);
    if (opts.yAxisLabel) axes.push(`Y axis: ${opts.yAxisLabel}`);
    parts.push(axes.join('. ') + '.');
  }

  // Series summaries
  if (opts.series && opts.series.length > 0) {
    for (const s of opts.series) {
      const label = s.label ?? 'Data';
      if (s.values.length === 0) {
        parts.push(`${label}: no data points.`);
        continue;
      }
      const values = finiteValues(s.values);
      const [min, max] = safeMinMax(values);
      const scale = values.reduce((largest, value) => Math.max(largest, Math.abs(value)), 0);
      const mean = scale === 0 ? 0 : (values.reduce((sum, value) => sum + value / scale, 0) / values.length) * scale;
      parts.push(`${label}: ${s.values.length} points, min ${formatNum(min)}, max ${formatNum(max)}, mean ${formatNum(mean)}.`);
    }
  }

  // Custom summary
  if (opts.summary) {
    parts.push(opts.summary);
  }

  return safeDescription(parts.join(' '));
}

/**
 * Announce a chart update to screen readers.
 *
 * Wraps `announceText()` from corona — prepends a terminal bell (`\x07`)
 * for screen reader notification.
 *
 * @param message - Text to announce.
 * @param priority - 'polite' (default) or 'assertive'.
 * @returns The announcement string (with bell prefix).
 */
export function announceChartUpdate(message: string, priority: AnnouncePriority = 'polite'): string {
  return announceText(message, priority);
}

// ── High Contrast Mode ──────────────────────────────────────────────────

/**
 * Process chrome lines through high-contrast mode.
 *
 * Strips all ANSI styling and makes text bold. Useful for
 * terminals with `HIGH_CONTRAST=1` or accessibility mode.
 *
 * @param lines - Array of styled strings.
 * @returns Array of high-contrast strings (bold, no color).
 */
export function highContrastChrome(lines: string[]): string[] {
  return lines.map((line) => highContrast(line));
}

/**
 * Strip all styling from chrome lines.
 *
 * @param lines - Array of styled strings.
 * @returns Array of plain text strings (no ANSI).
 */
export function stripChrome(lines: string[]): string[] {
  return lines.map((line) => stripAllStyles(line));
}

// ── RGB ↔ Color Bridge ──────────────────────────────────────────────────

/**
 * Convert a corona `Color` to an ink-compatible `RGB` tuple.
 *
 * Falls back to `[255, 255, 255]` (white) if the Color has no RGB
 * representation (e.g., ANSI-16 with no known RGB equivalent).
 */
export function colorToRgb(c: Color): RGB {
  const rgb = c.rgb;
  return rgb ?? [255, 255, 255];
}

/**
 * Convert an ink `RGB` tuple to a corona `Color`.
 */
export function rgbToColor(rgb: RGB): Color {
  return color.rgb(rgb[0], rgb[1], rgb[2]);
}

/**
 * Convert an entire palette to RGB tuples (for ink layer interop).
 */
export function paletteToRgb(palette: ChartPalette): RGB[] {
  return palette.map(colorToRgb);
}

/**
 * Convert an array of RGB tuples to a palette (from ink layer interop).
 */
export function rgbToPalette(rgbs: readonly RGB[]): ChartPalette {
  return rgbs.map(rgbToColor);
}

// ── WCAG Contrast Validation ─────────────────────────────────────────────

/** Result of validating a single color against a background. */
export interface ContrastResult {
  /** The color being tested. */
  color: Color;
  /** Palette index. */
  index: number;
  /** The contrast ratio (1–21). */
  ratio: number;
  /** Whether it passes the requested WCAG level. */
  passes: boolean;
}

/**
 * Validate that all palette colors have sufficient contrast
 * against a background color.
 *
 * @param palette - Colors to validate.
 * @param background - The chart background color.
 * @param level - WCAG level to check against ('AA' or 'AAA').
 * @param largeText - Whether the text is large (lower threshold).
 * @returns Array of results, one per palette color.
 */
export function validateContrast(palette: ChartPalette, background: Color, level: 'AA' | 'AAA' = 'AA', largeText = false): ContrastResult[] {
  return palette.map((c, index) => {
    const ratio = color.contrastRatio(c, background);
    const passes = color.isAccessible(c, background, level, largeText);
    return { color: c, index, ratio, passes };
  });
}

/**
 * Filter a palette to only colors that pass WCAG contrast against
 * a given background. Useful for dynamically pruning a palette.
 *
 * @param palette - Input palette.
 * @param background - Background color to check against.
 * @param level - WCAG level ('AA' or 'AAA').
 * @returns Filtered palette with only accessible colors.
 */
export function accessiblePalette(palette: ChartPalette, background: Color, level: 'AA' | 'AAA' = 'AA'): ChartPalette {
  return palette.filter((c) => color.isAccessible(c, background, level));
}

// ── Internals ────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function safeDescription(value: string): string {
  return stripAllStyles(sanitizeTerminalText(value, { allowSgr: false, allowHyperlinks: false, controlPolicy: 'strip' })).replace(/[\r\n]/g, ' ');
}
