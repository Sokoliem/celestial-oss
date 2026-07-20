/** Maximum amount of terminal-cell work a single component option may request. */
export const MAX_RENDER_CELLS = 100_000;

/** Keep a finite number or use the supplied fallback. */
export function finiteNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

/** Normalize an integer into a bounded inclusive range. */
export function boundedInteger(value: number | undefined, fallback: number, min: number, max: number = MAX_RENDER_CELLS): number {
  const normalized = Math.trunc(finiteNumber(value, fallback));
  return Math.max(min, Math.min(max, normalized));
}

export function positiveInteger(value: number | undefined, fallback: number, max: number = MAX_RENDER_CELLS): number {
  return boundedInteger(value, fallback, 1, max);
}

export function nonNegativeInteger(value: number | undefined, fallback = 0, max: number = MAX_RENDER_CELLS): number {
  return boundedInteger(value, fallback, 0, max);
}

/** Normalize recurring timer intervals to values supported by Node timers. */
export function timerInterval(value: number | undefined, fallback: number): number {
  return positiveInteger(value, fallback, 2_147_483_647);
}

/** Compute a range ratio without overflowing across the full finite range. */
export function rangeRatio(value: number, min: number, max: number, fallback = 0): number {
  if (![value, min, max].every(Number.isFinite) || min === max) return fallback;
  const range = max - min;
  if (Number.isFinite(range) && range !== 0) {
    const ratio = (value - min) / range;
    return Number.isFinite(ratio) ? ratio : fallback;
  }

  const scale = Math.max(Math.abs(value), Math.abs(min), Math.abs(max));
  if (!Number.isFinite(scale) || scale === 0) return fallback;
  const scaledRange = max / scale - min / scale;
  if (!Number.isFinite(scaledRange) || scaledRange === 0) return fallback;
  const ratio = (value / scale - min / scale) / scaledRange;
  return Number.isFinite(ratio) ? ratio : fallback;
}

/** Normalize a numeric range while preserving the caller's finite endpoints. */
export function normalizeRange(
  configuredMin: number | undefined,
  configuredMax: number | undefined,
  fallbackMin = 0,
  fallbackMax = 100,
): { min: number; max: number } {
  const first = finiteNumber(configuredMin, fallbackMin);
  const second = finiteNumber(configuredMax, fallbackMax);
  return first <= second ? { min: first, max: second } : { min: second, max: first };
}

/** Clamp arbitrary input to finite range state. Infinities select an endpoint. */
export function clampRange(value: number, min: number, max: number, fallback = min): number {
  if (Number.isNaN(value)) return Math.max(min, Math.min(max, fallback));
  if (value === Number.POSITIVE_INFINITY) return max;
  if (value === Number.NEGATIVE_INFINITY) return min;
  if (!Number.isFinite(value)) return Math.max(min, Math.min(max, fallback));
  return Math.max(min, Math.min(max, value));
}

/** Interpolate between finite endpoints without overflowing `max - min`. */
export function interpolateRange(min: number, max: number, ratio: number): number {
  const normalizedRatio = Math.max(0, Math.min(1, finiteNumber(ratio, 0)));
  if (normalizedRatio === 0 || min === max) return min;
  if (normalizedRatio === 1) return max;

  const value = min * (1 - normalizedRatio) + max * normalizedRatio;
  return Number.isFinite(value) ? clampRange(value, min, max) : normalizedRatio < 0.5 ? min : max;
}

/** Clamp a value and, where numerically representable, snap it to a step. */
export function clampToStep(value: number, min: number, max: number, step: number, fallback = min): number {
  const bounded = clampRange(value, min, max, fallback);
  if (bounded === min || bounded === max) return bounded;

  const safeStep = finiteNumber(step, 1);
  if (safeStep <= 0) return bounded;
  const offset = bounded - min;
  if (!Number.isFinite(offset)) return bounded;
  const stepIndex = offset / safeStep;
  if (!Number.isFinite(stepIndex)) return bounded;
  const snapped = min + Math.round(stepIndex) * safeStep;
  return Number.isFinite(snapped) ? clampRange(snapped, min, max, bounded) : bounded;
}
