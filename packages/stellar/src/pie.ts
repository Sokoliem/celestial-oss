/**
 * Pie and Donut chart for terminal rendering.
 *
 * Renders segments using braille/sextant pixels on a BrailleCanvas.
 * Supports percentage labels and optional donut center hole.
 */
import type { Color } from '@celestial/corona';
import { sanitizeTerminalText, stripAnsi } from '@celestial/corona';
import type { VNode } from '@celestial/nebula';
import { column, text as textNode } from '@celestial/nebula';
import { type CanvasMode, canvas } from './canvas.js';
import { safeMax } from './math-utils.js';
import { chartSize, clamp, finiteNumber } from './validation.js';

// ── Types ────────────────────────────────────────────────────────────────

/** A single segment of a pie chart. */
export interface PieSegment {
  /** Numeric value for this segment. */
  value: number;
  /** Display label. */
  label?: string;
  /** Segment color. */
  color?: Color;
}

/** Options for rendering a pie or donut chart. */
export interface PieChartOpts {
  /** Pie segments. */
  segments: PieSegment[];
  /** Canvas width in terminal columns (default: 20). */
  width?: number;
  /** Canvas height in terminal rows (default: 10). */
  height?: number;
  /** Rendering mode (default: 'braille'). */
  mode?: CanvasMode;
  /** Donut hole radius as a fraction of the outer radius (0 = pie, 0.5 = donut). */
  donut?: number;
  /** Show percentage labels next to segments. */
  showLabels?: boolean;
}

/** Result of rendering a pie chart. */
export interface PieChartResult {
  /** Render to ANSI string. */
  toString(): string;
  /** Convert to a Nebula VNode. */
  toVNode(): VNode;
  /** Per-segment percentages. */
  percentages: number[];
}

// ── Implementation ───────────────────────────────────────────────────────

/**
 * Render a pie or donut chart.
 *
 * Each segment occupies an angular slice proportional to its value.
 * The chart is drawn as a filled circle with colored sectors. When
 * `donut` > 0, the center is left empty.
 *
 * @param opts - Pie chart options.
 * @returns A PieChartResult with render methods and computed percentages.
 */
export function pieChart(opts: PieChartOpts): PieChartResult {
  const { width, height } = chartSize(opts.width, opts.height, 20, 10);
  const c = canvas(width, height, opts.mode);
  const segments = opts.segments;
  const donutFrac = clamp(opts.donut, 0, 0.95, 0);

  const values = segments.map((segment) => Math.max(0, finiteNumber(segment.value, 0)));
  const scale = safeMax(values);
  const weights = scale > 0 ? values.map((value) => value / scale) : values;
  const total = weights.reduce((sum, value) => sum + value, 0);
  const percentages = weights.map((value) => (total > 0 ? (value / total) * 100 : 0));

  if (total === 0 || segments.length === 0) {
    return makeResult(c, percentages);
  }

  const pxW = c.pixelWidth;
  const pxH = c.pixelHeight;
  const cx = Math.floor(pxW / 2);
  const cy = Math.floor(pxH / 2);
  const outerR = Math.min(cx, cy) - 1;
  const innerR = Math.round(outerR * donutFrac);
  const aspect = c.pixelAspect;

  // Precompute cumulative angle boundaries
  const angles: number[] = [0];
  let cumulative = 0;
  for (const weight of weights) {
    cumulative += weight / total;
    angles.push(cumulative * 2 * Math.PI);
  }

  // For each pixel in the bounding square, determine which segment it falls in
  // Apply aspect ratio correction: scale dy so the circle appears circular on screen
  const outerRy = aspect === 1.0 ? outerR : Math.round(outerR / aspect);
  for (let py = cy - outerRy; outerR > 0 && py <= cy + outerRy; py++) {
    for (let px = cx - outerR; px <= cx + outerR; px++) {
      const dx = px - cx;
      const dy = py - cy;
      // Correct dy for aspect ratio when computing distance
      const corrDy = dy * aspect;
      const dist = Math.sqrt(dx * dx + corrDy * corrDy);

      if (dist > outerR || dist < innerR) continue;

      // Compute angle (0 at top, clockwise) using corrected coordinates
      let angle = Math.atan2(dx, -corrDy);
      if (angle < 0) angle += 2 * Math.PI;

      // Find which segment this angle belongs to.
      // Use <= for the upper bound on the last segment to include pixels
      // exactly at the 2*PI boundary (12 o'clock position).
      for (let i = 0; i < segments.length; i++) {
        const isLast = i === segments.length - 1;
        const upperCheck = isLast ? angle <= angles[i + 1]! : angle < angles[i + 1]!;
        if (angle >= angles[i]! && upperCheck) {
          const seg = segments[i]!;
          if (seg.color) c.setColor(seg.color);
          c.set(px, py);
          break;
        }
      }
    }
  }

  // Build labels if requested
  let labelSuffix = '';
  if (opts.showLabels) {
    const RESET = '\x1b[0m';
    const BLOCK = '\u2588';
    const parts: string[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const pct = percentages[i]!.toFixed(1);
      const colorPrefix = seg.color ? seg.color.fg() : '';
      const label = safeLabel(seg.label ?? `Segment ${i + 1}`);
      parts.push(`${colorPrefix}${BLOCK}${RESET} ${label} (${pct}%)`);
    }
    labelSuffix = '\n' + parts.join('  ');
  }

  return makeResultWithLabels(c, percentages, labelSuffix);
}

// ── Helpers ──────────────────────────────────────────────────────────────

function makeResult(c: ReturnType<typeof canvas>, percentages: number[]): PieChartResult {
  return {
    toString: () => c.render(),
    toVNode: () => c.toVNode(),
    percentages,
  };
}

function makeResultWithLabels(c: ReturnType<typeof canvas>, percentages: number[], labelSuffix: string): PieChartResult {
  const content = c.render() + labelSuffix;
  return {
    toString: () => content,
    toVNode: () => (content.includes('\n') ? column(...content.split('\n').map((line) => textNode(line))) : textNode(content)),
    percentages,
  };
}

function safeLabel(value: string): string {
  return stripAnsi(sanitizeTerminalText(value, { allowSgr: false, allowHyperlinks: false, controlPolicy: 'strip' })).replace(/[\r\n]/g, ' ');
}
