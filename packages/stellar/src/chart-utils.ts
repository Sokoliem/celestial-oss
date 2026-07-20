/**
 * Chart infrastructure utilities: axis labels, titles, grid lines,
 * tick marks, legends, and responsive sizing.
 *
 * These utilities compose with the canvas API and existing chart
 * renderers to add production-ready chart chrome.
 */
import type { Color } from '@celestial/corona';
import { type LocaleLike, measureTextWidth, resolveLocale, truncateText } from '@celestial/rosetta';
import type { BrailleCanvas } from './canvas.js';

// ── Types ────────────────────────────────────────────────────────────────

/** Position for legends relative to the chart area. */
export type LegendPosition = 'top' | 'bottom' | 'right';

/** Grid line style using Unicode characters. */
export type GridStyle = 'dotted' | 'dashed' | 'solid';

/** Formatting function for tick labels. */
export type TickFormatter = (value: number) => string;

/** Configuration for axis labels and ticks. */
export interface AxisConfig {
  /** Label for the X axis. */
  xLabel?: string;
  /** Label for the Y axis. */
  yLabel?: string;
  /** Custom formatter for X axis tick labels. */
  xFormat?: TickFormatter;
  /** Custom formatter for Y axis tick labels. */
  yFormat?: TickFormatter;
  /** Number of ticks on each axis (default: 5). */
  tickCount?: number;
  /** Locale used for default tick formatting. */
  locale?: LocaleLike;
}

/** Configuration for chart title and subtitle. */
export interface TitleConfig {
  /** Main chart title. */
  title?: string;
  /** Subtitle below the main title. */
  subtitle?: string;
}

/** Configuration for grid lines. */
export interface GridConfig {
  /** Show horizontal grid lines. */
  horizontal?: boolean;
  /** Show vertical grid lines. */
  vertical?: boolean;
  /** Grid line style (default: 'dotted'). */
  style?: GridStyle;
}

/** A single legend entry with label and color. */
export interface LegendEntry {
  label: string;
  color: Color;
}

/** Configuration for chart legend. */
export interface LegendConfig {
  /** Legend entries to display. */
  entries: LegendEntry[];
  /** Position of the legend (default: 'bottom'). */
  position?: LegendPosition;
}

/** Full chart chrome configuration combining all infrastructure. */
export interface ChartChrome {
  axis?: AxisConfig;
  title?: TitleConfig;
  grid?: GridConfig;
  legend?: LegendConfig;
}

// ── Tick Computation ─────────────────────────────────────────────────────

/**
 * Compute nicely spaced tick values for an axis range.
 *
 * @param min - Minimum data value.
 * @param max - Maximum data value.
 * @param count - Desired number of ticks (default: 5).
 * @returns Array of tick values.
 */
export function computeTicks(min: number, max: number, count: number = 5): number[] {
  if (count <= 0) return [];
  if (min === max) return [min];

  const range = max - min;
  const rawStep = range / Math.max(count - 1, 1);

  // Round step to a nice number (1, 2, 5 multiples of 10^n)
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;

  let niceStep: number;
  if (normalized <= 1.5) niceStep = 1 * magnitude;
  else if (normalized <= 3.5) niceStep = 2 * magnitude;
  else if (normalized <= 7.5) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;

  const niceMin = Math.floor(min / niceStep) * niceStep;
  const ticks: number[] = [];
  let val = niceMin;
  while (val <= max + niceStep * 0.5) {
    ticks.push(Math.round(val * 1e10) / 1e10); // avoid fp errors
    val += niceStep;
  }

  // Filter out ticks outside the [min, max] range to prevent labels
  // overlapping at position 0.
  // Use a small tolerance to avoid dropping boundary ticks due to
  // floating-point arithmetic (e.g. step accumulation producing max - epsilon).
  const eps = niceStep * 1e-9;
  return ticks.filter((t) => t >= min - eps && t <= max + eps);
}

/**
 * Default tick formatter: shows integers plainly, decimals to 1 place.
 */
export function defaultFormat(value: number, locale?: LocaleLike): string {
  if (!locale) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  const resolvedLocale = resolveLocale(locale);
  return resolvedLocale.formatNumber(value, {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
    useGrouping: false,
  });
}

// ── Grid Rendering ───────────────────────────────────────────────────────

/**
 * Draw grid lines onto a canvas within the specified pixel region.
 *
 * @param c - The canvas to draw on.
 * @param config - Grid configuration.
 * @param xTicks - Normalized X tick positions (0-1).
 * @param yTicks - Normalized Y tick positions (0-1).
 * @param plotX - Plot area start X in pixels.
 * @param plotY - Plot area start Y in pixels.
 * @param plotW - Plot area width in pixels.
 * @param plotH - Plot area height in pixels.
 */
export function drawGrid(
  c: BrailleCanvas,
  config: GridConfig,
  xTicks: number[],
  yTicks: number[],
  plotX: number,
  plotY: number,
  plotW: number,
  plotH: number,
): void {
  // Step based on grid style: solid=1, dashed=2, dotted=3
  const step = config.style === 'solid' ? 1 : config.style === 'dashed' ? 2 : 3;

  if (config.horizontal) {
    for (const yt of yTicks) {
      const py = plotY + Math.round((1 - yt) * (plotH - 1));
      for (let px = plotX; px < plotX + plotW; px += step) {
        c.set(px, py);
      }
    }
  }
  if (config.vertical) {
    for (const xt of xTicks) {
      const px = plotX + Math.round(xt * (plotW - 1));
      for (let py = plotY; py < plotY + plotH; py += step) {
        c.set(px, py);
      }
    }
  }
}

// ── Text Rendering Helpers ───────────────────────────────────────────────

/**
 * Render a title block as plain text lines.
 *
 * @param config - Title configuration.
 * @param width - Available width in characters for centering.
 * @returns Array of text lines (may be empty).
 */
export function renderTitle(config: TitleConfig, width: number): string[] {
  const lines: string[] = [];
  if (config.title) {
    lines.push(centerText(config.title, width));
  }
  if (config.subtitle) {
    lines.push(centerText(config.subtitle, width));
  }
  return lines;
}

/**
 * Render axis tick labels along the bottom (X) axis.
 *
 * @param ticks - Tick values.
 * @param min - Minimum data value.
 * @param max - Maximum data value.
 * @param width - Available width in characters.
 * @param format - Tick formatter.
 * @returns A single line of positioned tick labels.
 */
export function renderXTickLabels(ticks: number[], min: number, max: number, width: number, format: TickFormatter = defaultFormat): string {
  const range = max - min || 1;
  const line = new Array(width).fill(' ');

  for (const tick of ticks) {
    const pos = Math.round(((tick - min) / range) * (width - 1));
    const label = fitTextWidth(format(tick), width);
    const labelWidth = measureTextWidth(label);
    // Shift label left if it would overflow the right edge
    const idealStart = pos - Math.floor(labelWidth / 2);
    const start = Math.max(0, Math.min(idealStart, width - labelWidth));
    for (let i = 0; i < label.length && start + i < width; i++) {
      line[start + i] = label[i];
    }
  }

  return line.join('');
}

/**
 * Render Y axis tick labels for a given tick array.
 *
 * @param ticks - Tick values.
 * @param min - Minimum data value.
 * @param max - Maximum data value.
 * @param height - Height in rows.
 * @param format - Tick formatter.
 * @returns Array of {row, label} pairs.
 */
export function renderYTickLabels(
  ticks: number[],
  min: number,
  max: number,
  height: number,
  format: TickFormatter = defaultFormat,
): { row: number; label: string }[] {
  const range = max - min || 1;
  const labels: { row: number; label: string }[] = [];

  for (const tick of ticks) {
    const row = height - 1 - Math.round(((tick - min) / range) * (height - 1));
    labels.push({ row, label: format(tick) });
  }

  return labels;
}

/**
 * Render a legend as a single line of text with ANSI color squares.
 *
 * @param config - Legend configuration.
 * @returns Formatted legend string.
 */
export function renderLegend(config: LegendConfig): string {
  const RESET = '\x1b[0m';
  const BLOCK = '\u2588';
  return config.entries.map((e) => `${e.color.fg()}${BLOCK}${BLOCK}${RESET} ${e.label}`).join('  ');
}

// ── Responsive Sizing ────────────────────────────────────────────────────

/**
 * Compute responsive chart dimensions based on available terminal space.
 *
 * @param availableWidth - Terminal columns available.
 * @param availableHeight - Terminal rows available.
 * @param aspectRatio - Desired width:height ratio (default: 2.5).
 * @returns Computed width and height.
 */
export function responsiveSize(availableWidth: number, availableHeight: number, aspectRatio: number = 2.5): { width: number; height: number } {
  const maxW = Math.max(10, availableWidth);
  const maxH = Math.max(5, availableHeight);
  const idealH = Math.round(maxW / aspectRatio);
  const height = Math.min(idealH, maxH);
  const width = Math.min(maxW, Math.round(height * aspectRatio));
  return { width, height };
}

// ── Compose Chart with Chrome ────────────────────────────────────────────

/**
 * Compose a rendered chart string with title, axis labels, and legend.
 *
 * @param chartBody - The raw chart string (from canvas.render()).
 * @param chrome - Chrome configuration.
 * @param opts - Data range and size info for tick computation.
 * @returns The final composed string.
 */
export function composeChartChrome(
  chartBody: string,
  chrome: ChartChrome,
  opts: {
    width: number;
    height: number;
    minX?: number;
    maxX?: number;
    minY?: number;
    maxY?: number;
  },
): string {
  const lines: string[] = [];

  // Title
  if (chrome.title) {
    lines.push(...renderTitle(chrome.title, opts.width));
  }

  // Y-axis labels + chart body
  const bodyLines = chartBody.split('\n');
  const yLabels = chrome.axis
    ? renderYTickLabels(
        computeTicks(opts.minY ?? 0, opts.maxY ?? 1, chrome.axis.tickCount),
        opts.minY ?? 0,
        opts.maxY ?? 1,
        bodyLines.length,
        createTickFormatter(chrome.axis.yFormat, chrome.axis.locale),
      )
    : [];

  const yLabelWidth = yLabels.reduce((max, l) => Math.max(max, measureTextWidth(l.label)), 0);
  const pad = yLabelWidth > 0 ? yLabelWidth + 1 : 0;

  for (let i = 0; i < bodyLines.length; i++) {
    const yEntry = yLabels.find((l) => l.row === i);
    const prefix = yEntry ? `${padStartWidth(yEntry.label, yLabelWidth)} ` : ' '.repeat(pad);
    lines.push(prefix + bodyLines[i]);
  }

  // X-axis label
  if (chrome.axis?.xLabel) {
    const xTickLine = renderXTickLabels(
      computeTicks(opts.minX ?? 0, opts.maxX ?? 1, chrome.axis.tickCount),
      opts.minX ?? 0,
      opts.maxX ?? 1,
      opts.width,
      createTickFormatter(chrome.axis.xFormat, chrome.axis.locale),
    );
    lines.push(' '.repeat(pad) + xTickLine);
    lines.push(centerText(chrome.axis.xLabel, opts.width + pad));
  }

  if (chrome.axis?.yLabel) {
    // Prepend rotated Y label hint
    lines[0] = chrome.axis.yLabel + ' ' + (lines[0] ?? '');
  }

  // Legend
  if (chrome.legend) {
    const legendStr = renderLegend(chrome.legend);
    const pos = chrome.legend.position ?? 'bottom';

    if (pos === 'top') {
      // Prepend legend line before chart body (after title lines, before body lines)
      const titleLineCount = chrome.title ? renderTitle(chrome.title, opts.width).length : 0;
      lines.splice(titleLineCount, 0, legendStr, '');
    } else if (pos === 'right') {
      // Append legend to the right of the first chart body line
      const titleLineCount = chrome.title ? renderTitle(chrome.title, opts.width).length : 0;
      if (titleLineCount < lines.length) {
        lines[titleLineCount] = lines[titleLineCount] + '  ' + legendStr;
      } else {
        lines.push(legendStr);
      }
    } else {
      // 'bottom' — append legend line after chart body
      lines.push('');
      lines.push(legendStr);
    }
  }

  return lines.join('\n');
}

// ── Helpers ──────────────────────────────────────────────────────────────

function centerText(text: string, width: number): string {
  const clipped = fitTextWidth(text, width);
  const pad = Math.max(0, Math.floor((width - measureTextWidth(clipped)) / 2));
  return ' '.repeat(pad) + clipped;
}

function createTickFormatter(format?: TickFormatter, locale?: LocaleLike): TickFormatter {
  if (format) {
    return format;
  }

  return (value) => defaultFormat(value, locale);
}

function fitTextWidth(text: string, width: number): string {
  return truncateText(text, width, '');
}

function padStartWidth(text: string, width: number): string {
  return `${' '.repeat(Math.max(0, width - measureTextWidth(text)))}${text}`;
}
