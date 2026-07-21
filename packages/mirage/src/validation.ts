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

export function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  return Math.max(min, Math.min(max, finiteNumber(value, fallback)));
}

export function wrap(value: number, modulus: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(modulus) || modulus <= 0) return 0;
  return ((value % modulus) + modulus) % modulus;
}

export function easedProgress(easing: EasingFn, progress: number): number {
  const input = clamp(progress, 0, 1, 0);
  return clamp(easing(input), 0, 1, input);
}
