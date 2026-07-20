import { color } from '@celestial/corona';
import { assertFiniteNumber, assertNonEmptyString } from './validation.js';

export type PhysicalAnimatable = number | Record<string, unknown> | unknown[];
export type Animatable = PhysicalAnimatable | string;
export interface ParticleValue {
  x: number;
  y: number;
  opacity?: number;
}

export type Interpolator<T> = (from: T, to: T, progress: number) => T;

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isParticleValue(value: unknown): value is ParticleValue {
  return (
    isObject(value) &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y) &&
    (value.opacity === undefined || (typeof value.opacity === 'number' && Number.isFinite(value.opacity)))
  );
}

export function interpolateNumber(from: number, to: number, progress: number): number {
  const numericFrom = assertFiniteNumber(from, 'from');
  return numericFrom + (assertFiniteNumber(to, 'to') - numericFrom) * assertFiniteNumber(progress, 'progress');
}

export function interpolateObject(from: Record<string, unknown>, to: Record<string, unknown>, progress: number): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const allKeys = new Set([...Object.keys(from), ...Object.keys(to)]);

  for (const key of allKeys) {
    const fromVal = from[key];
    const toVal = to[key];

    if (fromVal === undefined) {
      result[key] = toVal;
    } else if (toVal === undefined) {
      result[key] = fromVal;
    } else {
      result[key] = interpolate(fromVal, toVal, progress);
    }
  }

  return result;
}

export function interpolateArray(from: unknown[], to: unknown[], progress: number): unknown[] {
  const maxLen = Math.max(from.length, to.length);
  const result: unknown[] = [];

  for (let i = 0; i < maxLen; i++) {
    const fromVal = from[i];
    const toVal = to[i];

    if (fromVal === undefined) {
      result[i] = toVal;
    } else if (toVal === undefined) {
      result[i] = fromVal;
    } else {
      result[i] = interpolate(fromVal, toVal, progress);
    }
  }

  return result;
}

function isHexColor(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

function normalizeHexColor(value: string): string {
  const normalized = value.slice(1).toLowerCase();
  if (normalized.length === 3) {
    return `#${normalized
      .split('')
      .map((digit) => `${digit}${digit}`)
      .join('')}`;
  }
  return `#${normalized}`;
}

function rgbToHex(rgb: readonly [number, number, number]): string {
  return `#${rgb
    .map((channel) =>
      Math.max(0, Math.min(255, Math.round(channel)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function interpolateHexColor(from: string, to: string, progress: number): string {
  const clamped = Math.max(0, Math.min(1, assertFiniteNumber(progress, 'progress')));
  if (clamped === 0) return normalizeHexColor(from);
  if (clamped === 1) return normalizeHexColor(to);

  const fromOklch = color.toOklch(from);
  const toOklch = color.toOklch(to);
  if (!fromOklch || !toOklch) {
    return clamped < 0.5 ? normalizeHexColor(from) : normalizeHexColor(to);
  }

  const lightness = fromOklch[0] + (toOklch[0] - fromOklch[0]) * clamped;
  const chroma = fromOklch[1] + (toOklch[1] - fromOklch[1]) * clamped;
  let deltaHue = toOklch[2] - fromOklch[2];
  if (deltaHue > 180) deltaHue -= 360;
  if (deltaHue < -180) deltaHue += 360;

  const hue = (((fromOklch[2] + deltaHue * clamped) % 360) + 360) % 360;
  const nextColor = color.fromOklch([lightness, chroma, hue]);
  return nextColor.rgb ? rgbToHex(nextColor.rgb) : normalizeHexColor(to);
}

export function interpolate(from: unknown, to: unknown, progress: number): unknown {
  assertFiniteNumber(progress, 'progress');

  if (isNumber(from) && isNumber(to)) {
    return interpolateNumber(from, to, progress);
  }

  if (isString(from) && isString(to) && isHexColor(from) && isHexColor(to)) {
    return interpolateHexColor(from, to, progress);
  }

  if (isObject(from) && isObject(to)) {
    return interpolateObject(from, to, progress);
  }

  if (isArray(from) && isArray(to)) {
    return interpolateArray(from, to, progress);
  }

  if (progress < 0.5) return from;
  return to;
}

export function interpolateValue<T extends Animatable>(from: T, to: T, progress: number): T {
  return interpolate(from, to, progress) as T;
}

export function clone<T extends Animatable>(value: T): T {
  if (isNumber(value)) {
    return value;
  }

  if (isArray(value)) {
    return value.map((v) => clone(v as Animatable)) as T;
  }

  if (isObject(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      result[key] = clone(value[key] as Animatable);
    }
    return result as T;
  }

  return value;
}

const interpolators = new Map<string, Interpolator<unknown>>();
interpolators.set('color', ((from: unknown, to: unknown, progress: number) => {
  if (isString(from) && isString(to) && isHexColor(from) && isHexColor(to)) {
    return interpolateHexColor(from, to, progress);
  }

  return progress < 0.5 ? from : to;
}) as Interpolator<unknown>);
interpolators.set('particle', ((from: unknown, to: unknown, progress: number) => {
  if (isParticleValue(from) && isParticleValue(to)) {
    return {
      x: interpolateNumber(from.x, to.x, progress),
      y: interpolateNumber(from.y, to.y, progress),
      opacity: interpolateNumber(from.opacity ?? 1, to.opacity ?? 1, progress),
    };
  }

  return progress < 0.5 ? from : to;
}) as Interpolator<unknown>);

export function registerInterpolator(type: string, fn: Interpolator<unknown>): void {
  const normalizedType = assertNonEmptyString(type, 'type');
  if (typeof fn !== 'function') {
    throw new TypeError('interpolator must be a function');
  }
  interpolators.set(normalizedType, fn);
}

export function getInterpolator(type: string): Interpolator<unknown> | undefined {
  return interpolators.get(assertNonEmptyString(type, 'type'));
}

export function interpolateWithType<T extends Animatable>(from: T, to: T, progress: number, type?: string): T {
  const numericProgress = assertFiniteNumber(progress, 'progress');
  if (type) {
    const normalizedType = assertNonEmptyString(type, 'type');
    const customInterpolator = interpolators.get(normalizedType);
    if (customInterpolator) {
      return customInterpolator(from, to, numericProgress) as T;
    }
    throw new RangeError(`Unknown interpolator type: ${normalizedType}`);
  }
  return interpolateValue(from, to, numericProgress);
}
