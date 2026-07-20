import type { EasingFn } from '@celestial/aurora';

export function finiteNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

export function nonNegativeNumber(value: number | undefined, fallback: number): number {
  return Math.max(0, finiteNumber(value, fallback));
}

export function positiveNumber(value: number | undefined, fallback: number): number {
  const resolved = finiteNumber(value, fallback);
  return resolved > 0 ? resolved : fallback;
}

export function nonNegativeInteger(value: number | undefined, fallback: number): number {
  return Math.floor(nonNegativeNumber(value, fallback));
}

export function positiveInteger(value: number | undefined, fallback: number): number {
  return Math.max(1, Math.floor(positiveNumber(value, fallback)));
}

export function boundedPositiveInteger(value: number | undefined, fallback: number, max: number): number {
  return Math.min(max, positiveInteger(value, fallback));
}

export function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  return Math.max(min, Math.min(max, finiteNumber(value, fallback)));
}

export function easedProgress(easing: EasingFn, progress: number): number {
  const input = clamp(progress, 0, 1, 0);
  return clamp(easing(input), 0, 1, input);
}

export function finiteValues(values: readonly number[], fallback = 0): number[] {
  return values.map((value) => finiteNumber(value, fallback));
}

/** Compute `(value - min) / (max - min)` without overflowing large finite ranges. */
export function rangeRatio(value: number, min: number, max: number, fallback = 0): number {
  if (![value, min, max].every(Number.isFinite) || min === max) return fallback;
  const range = max - min;
  if (Number.isFinite(range) && range !== 0) return finiteNumber((value - min) / range, fallback);

  const scale = Math.max(Math.abs(value), Math.abs(min), Math.abs(max));
  if (!Number.isFinite(scale) || scale === 0) return fallback;
  const scaledRange = max / scale - min / scale;
  if (!Number.isFinite(scaledRange) || scaledRange === 0) return fallback;
  return finiteNumber((value / scale - min / scale) / scaledRange, fallback);
}

/** Interpolate between two finite endpoints without overflowing their difference. */
export function interpolateRange(min: number, max: number, progress: number): number {
  const safeMin = finiteNumber(min, 0);
  const safeMax = finiteNumber(max, safeMin);
  const t = clamp(progress, 0, 1, 0);
  if (t === 0) return safeMin;
  if (t === 1) return safeMax;
  return finiteNumber(safeMin * (1 - t) + safeMax * t, safeMin);
}

export function chartSize(
  width: number | undefined,
  height: number | undefined,
  fallbackWidth: number,
  fallbackHeight: number,
): { width: number; height: number } {
  return {
    width: positiveInteger(width, fallbackWidth),
    height: positiveInteger(height, fallbackHeight),
  };
}
