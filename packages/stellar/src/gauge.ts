/**
 * Gauge / Dial chart for terminal rendering.
 *
 * Provides both a semi-circular arc gauge and a horizontal bar gauge
 * to show a single value within a range.
 */
import type { Color } from '@celestial/corona';
import { cellWidth, color as coronaColor, sanitizeTerminalText, sliceCells, stripAnsi } from '@celestial/corona';
import type { VNode } from '@celestial/nebula';
import { column, text as textNode } from '@celestial/nebula';
import { type CanvasMode, canvas } from './canvas.js';
import { boundedPositiveInteger, chartSize, finiteNumber, rangeRatio } from './validation.js';

// ── Types ────────────────────────────────────────────────────────────────

/** Options for a semi-circular arc gauge. */
export interface ArcGaugeOpts {
  /** Current value. */
  value: number;
  /** Minimum value (default: 0). */
  min?: number;
  /** Maximum value (default: 100). */
  max?: number;
  /** Canvas width in terminal columns (default: 20). */
  width?: number;
  /** Canvas height in terminal rows (default: 6). */
  height?: number;
  /** Rendering mode (default: 'braille'). */
  mode?: CanvasMode;
  /** Color for the filled arc. */
  color?: Color;
  /** Color for the unfilled background arc. */
  bgColor?: Color;
  /** Show the numeric value in the center (default: true). */
  showValue?: boolean;
  /** Format function for the displayed value. */
  format?: (value: number) => string;
}

/** Options for a horizontal bar gauge. */
export interface BarGaugeOpts {
  /** Current value. */
  value: number;
  /** Minimum value (default: 0). */
  min?: number;
  /** Maximum value (default: 100). */
  max?: number;
  /** Width in terminal columns (default: 30). */
  width?: number;
  /** Color for the filled portion. */
  color?: Color;
  /** Color for the empty portion. */
  bgColor?: Color;
  /** Show the numeric value (default: true). */
  showValue?: boolean;
  /** Format function for the displayed value. */
  format?: (value: number) => string;
}

/** Result of rendering a gauge. */
export interface GaugeResult {
  /** Render to ANSI string (may contain newlines for multi-line gauges). */
  toString(): string;
  /**
   * Convert to a Nebula VNode. Multi-line output (e.g. arcGauge) is
   * automatically split into a column() of individual text() lines so
   * it composes correctly in row() layouts.
   */
  toVNode(): VNode;
  /** The normalized value (0-1). */
  normalized: number;
}

// ── Arc Gauge ────────────────────────────────────────────────────────────

/**
 * Render a semi-circular arc gauge.
 *
 * Draws a 180-degree arc on a canvas. The filled portion represents
 * the current value's position between min and max.
 *
 * @param opts - Arc gauge options.
 * @returns A GaugeResult with render methods and normalized value.
 */
export function arcGauge(opts: ArcGaugeOpts): GaugeResult {
  const { width, height } = chartSize(opts.width, opts.height, 20, 6);
  let minVal = finiteNumber(opts.min, 0);
  let maxVal = finiteNumber(opts.max, 100);
  if (minVal > maxVal) [minVal, maxVal] = [maxVal, minVal];
  const value = finiteNumber(opts.value, minVal);
  const normalized = Math.max(0, Math.min(1, rangeRatio(value, minVal, maxVal)));

  const c = canvas(width, height, opts.mode);
  const pxW = c.pixelWidth;
  const pxH = c.pixelHeight;
  const aspect = c.pixelAspect;

  const cx = Math.floor(pxW / 2);
  const cy = pxH - 1;
  const outerR = Math.min(cx - 1, pxH - 2);
  const innerR = Math.max(1, outerR - Math.max(2, Math.floor(outerR * 0.25)));

  const valueAngle = Math.PI * (1 - normalized); // π = left, 0 = right

  // Draw background arc (unfilled region only: 0 to valueAngle)
  if (outerR > 0 && opts.bgColor) {
    c.setColor(opts.bgColor);
    drawArcFill(c, cx, cy, innerR, outerR, 0, valueAngle, aspect);
  }

  // Draw filled arc (valueAngle to PI)
  const fillColor = opts.color ?? coronaColor.green;
  c.setColor(fillColor);
  if (outerR > 0) drawArcFill(c, cx, cy, innerR, outerR, valueAngle, Math.PI, aspect);

  let result = c.render();

  // Value label
  if (opts.showValue !== false) {
    const fmt = opts.format ?? defaultFormat;
    const label = safeLabel(fmt(value));
    result += '\n' + centerText(label, width);
  }

  return {
    toString: () => result,
    toVNode: () => multiLineToVNode(result),
    normalized,
  };
}

// ── Bar Gauge ────────────────────────────────────────────────────────────

/**
 * Render a horizontal bar gauge.
 *
 * Uses block characters to show a filled/empty bar representing
 * the value's position between min and max.
 *
 * @param opts - Bar gauge options.
 * @returns A GaugeResult with render methods and normalized value.
 */
export function barGauge(opts: BarGaugeOpts): GaugeResult {
  const width = boundedPositiveInteger(opts.width, 30, 1_000_000);
  let minVal = finiteNumber(opts.min, 0);
  let maxVal = finiteNumber(opts.max, 100);
  if (minVal > maxVal) [minVal, maxVal] = [maxVal, minVal];
  const value = finiteNumber(opts.value, minVal);
  const normalized = Math.max(0, Math.min(1, rangeRatio(value, minVal, maxVal)));

  const RESET = '\x1b[0m';
  const FULL = '\u2588';
  const EMPTY = '\u2591';

  const showLabel = opts.showValue !== false && width >= 3;
  const fmt = opts.format ?? defaultFormat;
  const rawLabel = showLabel ? safeLabel(fmt(value)) : '';
  const label = showLabel ? sliceCells(rawLabel, width - 2, { trusted: true })[0] : '';
  const barWidth = Math.max(1, width - (label ? cellWidth(label) + 1 : 0));
  const filledCount = Math.round(normalized * barWidth);
  const emptyCount = barWidth - filledCount;

  const fillColor = opts.color ?? coronaColor.green;
  const bgCol = opts.bgColor ?? coronaColor.gray;

  let bar = fillColor.fg() + FULL.repeat(filledCount) + RESET;
  bar += bgCol.fg() + EMPTY.repeat(emptyCount) + RESET;

  if (label) bar += ' ' + label;

  return {
    toString: () => bar,
    toVNode: () => multiLineToVNode(bar),
    normalized,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Fill an arc sector on the canvas between innerR and outerR,
 * from startAngle to endAngle (measured from positive x-axis, counterclockwise).
 *
 * @param aspect - pixelAspect ratio for aspect correction. 1.0 = no correction.
 */
function drawArcFill(
  c: ReturnType<typeof canvas>,
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number,
  aspect: number,
): void {
  // Ensure start < end
  const aMin = Math.min(startAngle, endAngle);
  const aMax = Math.max(startAngle, endAngle);

  // Extend vertical scan range to cover aspect-corrected circle
  const outerRy = aspect === 1.0 ? outerR : Math.round(outerR / aspect);
  for (let py = cy - outerRy; py <= cy; py++) {
    for (let px = cx - outerR; px <= cx + outerR; px++) {
      const dx = px - cx;
      const dy = cy - py; // flip y for math coords
      // Correct dy for aspect ratio when computing distance
      const corrDy = dy * aspect;
      const dist = Math.sqrt(dx * dx + corrDy * corrDy);
      if (dist < innerR || dist > outerR) continue;
      if (corrDy < 0) continue; // only upper half (semicircle)

      let angle = Math.atan2(corrDy, dx);
      if (angle < 0) angle += Math.PI;

      if (angle >= aMin && angle <= aMax) {
        c.set(px, py);
      }
    }
  }
}

/**
 * Convert a potentially multi-line ANSI string to a VNode.
 * Single-line strings become a text() node. Multi-line strings become
 * a column() of text() nodes so they compose correctly in row() layouts.
 */
function multiLineToVNode(content: string): VNode {
  if (!content.includes('\n')) {
    return textNode(content);
  }
  const lines = content.split('\n');
  return column(...lines.map((line) => textNode(line)));
}

function defaultFormat(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function centerText(text: string, width: number): string {
  const clipped = sliceCells(text, width, { trusted: true })[0];
  const pad = Math.max(0, Math.floor((width - cellWidth(clipped)) / 2));
  return ' '.repeat(pad) + clipped;
}

function safeLabel(value: string): string {
  return stripAnsi(sanitizeTerminalText(value, { allowSgr: false, allowHyperlinks: false, controlPolicy: 'strip' })).replace(/[\r\n]/g, ' ');
}
