/**
 * Animated chart helpers.
 *
 * Integrates @celestial/aurora easing functions with the stellar chart API
 * so that bar and line charts can be smoothly animated over a series of ticks.
 */

import type { EasingFn } from '@celestial/aurora';
import { easing as easingLib } from '@celestial/aurora';
import type { BarChartOpts, ChartResult, LineChartOpts } from './chart.js';
import { chart } from './chart.js';
import { easedProgress, finiteNumber, finiteValues, nonNegativeNumber } from './validation.js';

// ── animateData ──────────────────────────────────────────────────────────

/**
 * Interpolate every value in `data` from 0 towards its target using an
 * easing curve.
 *
 * @param data      Target values.
 * @param tick      Current tick (frame counter starting at 0).
 * @param duration  Total animation duration in ticks.
 * @param easingFn  Easing function (default: `easeOut`).
 * @returns         A new array with each value scaled by the eased progress.
 */
export function animateData(data: number[], tick: number, duration: number, easingFn: EasingFn = easingLib.easeOut): number[] {
  if (data.length === 0) return [];
  const values = finiteValues(data);
  const safeDuration = finiteNumber(duration, 0);
  if (safeDuration <= 0) return values;
  const t = Math.min(1, nonNegativeNumber(tick, 0) / safeDuration);
  if (t >= 1) return values;
  const easedT = easedProgress(easingFn, t);
  return values.map((v) => v * easedT);
}

// ── animateBarChart ──────────────────────────────────────────────────────

export interface AnimateBarChartConfig extends BarChartOpts {
  tick: number;
  duration: number;
  easing?: EasingFn;
}

/**
 * Render a bar chart whose bars grow from zero to their final height over
 * `duration` ticks.
 */
export function animateBarChart(config: AnimateBarChartConfig): ChartResult {
  const { tick, duration, easing: easingFn, data, ...rest } = config;

  // Normalise labelled data so we can animate the raw values
  const values: number[] =
    Array.isArray(data) && data.length > 0 && typeof data[0] === 'object'
      ? (data as { label: string; value: number }[]).map((d) => d.value)
      : (data as number[]);

  const animatedValues = animateData(values, tick, duration, easingFn);

  return chart.bar({ ...rest, data: animatedValues });
}

// ── animateLineChart ─────────────────────────────────────────────────────

export interface AnimateLineChartConfig extends LineChartOpts {
  tick: number;
  duration: number;
  easing?: EasingFn;
}

/**
 * Render a line chart that reveals its data points left-to-right over
 * `duration` ticks.  Points beyond the current reveal horizon are set to
 * the last visible value to avoid visual jumps.
 */
export function animateLineChart(config: AnimateLineChartConfig): ChartResult {
  const { tick, duration, easing: easingFn = easingLib.easeOut, data, ...rest } = config;

  const values = finiteValues(data);
  if (values.length === 0) return chart.line({ ...rest, data: values });
  const safeDuration = finiteNumber(duration, 0);
  if (safeDuration <= 0) return chart.line({ ...rest, data: values });

  const t = Math.min(1, nonNegativeNumber(tick, 0) / safeDuration);
  const easedT = easedProgress(easingFn, t);

  const visibleCount = Math.min(values.length, Math.ceil(values.length * easedT));

  // When no points are visible yet (tick=0), return an empty data array
  // so the chart renders as a blank canvas. This avoids the misleading
  // flat line that appeared when all points were set to a baseline value.
  if (visibleCount === 0) {
    return chart.line({ ...rest, data: [] });
  }

  const animatedData = values.map((v, i) => {
    if (i < visibleCount) return v;
    // Fill hidden portion with last visible value for smooth reveal
    return values[visibleCount - 1]!;
  });

  return chart.line({ ...rest, data: animatedData });
}
