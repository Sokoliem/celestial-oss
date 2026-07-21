import type { PhysicalAnimatable } from './interpolate.js';

type Point = { x: number; y: number };

function valueLabel(value: unknown): string {
  return typeof value === 'number' ? `${value}` : typeof value;
}

export function assertFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number, got ${valueLabel(value)}`);
  }
  return value;
}

export function assertPositiveNumber(value: unknown, name: string): number {
  const numeric = assertFiniteNumber(value, name);
  if (numeric <= 0) {
    throw new RangeError(`${name} must be > 0, got ${numeric}`);
  }
  return numeric;
}

export function assertNonNegativeNumber(value: unknown, name: string): number {
  const numeric = assertFiniteNumber(value, name);
  if (numeric < 0) {
    throw new RangeError(`${name} must be >= 0, got ${numeric}`);
  }
  return numeric;
}

export function assertPositiveInteger(value: unknown, name: string): number {
  const numeric = assertPositiveNumber(value, name);
  if (!Number.isInteger(numeric)) {
    throw new RangeError(`${name} must be a positive integer, got ${numeric}`);
  }
  return numeric;
}

export function assertNonNegativeInteger(value: unknown, name: string): number {
  const numeric = assertNonNegativeNumber(value, name);
  if (!Number.isInteger(numeric)) {
    throw new RangeError(`${name} must be a non-negative integer, got ${numeric}`);
  }
  return numeric;
}

export function assertNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${name} must be a string, got ${valueLabel(value)}`);
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new RangeError(`${name} must not be empty`);
  }
  return normalized;
}

export function normalizeProgress(progress: number, name = 'progress'): number {
  const numeric = assertFiniteNumber(progress, name);
  return Math.max(0, Math.min(1, numeric));
}

export function normalizeSpeed(factor: number): number {
  return assertPositiveNumber(factor, 'speed factor');
}

/** Resolve a wall/external clock reading and ignore stale frames. */
export function resolveTimestamp(now: number | undefined, previous?: number | null): number {
  const timestamp = now === undefined ? Date.now() : assertFiniteNumber(now, 'now');
  return previous === undefined || previous === null ? timestamp : Math.max(previous, timestamp);
}

export function assertPoint(value: Point, name: string): Point {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be a point object`);
  }
  return {
    x: assertFiniteNumber(value.x, `${name}.x`),
    y: assertFiniteNumber(value.y, `${name}.y`),
  };
}

export function assertNoNonFiniteNumbers(value: unknown, name: string): void {
  if (typeof value === 'number') {
    assertFiniteNumber(value, name);
    return;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      assertNoNonFiniteNumbers(value[index], `${name}[${index}]`);
    }
    return;
  }

  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      assertNoNonFiniteNumbers(value[key], `${name}.${key}`);
    }
  }
}

export function normalizeClamp(clamp: readonly [number, number] | undefined): readonly [number, number] | undefined {
  if (clamp === undefined) return undefined;
  if (!Array.isArray(clamp) || clamp.length !== 2) {
    throw new TypeError('clamp must be a [min, max] tuple');
  }
  const min = assertFiniteNumber(clamp[0], 'clamp[0]');
  const max = assertFiniteNumber(clamp[1], 'clamp[1]');
  if (min > max) {
    throw new RangeError(`clamp min must be <= max, got [${min}, ${max}]`);
  }
  return [min, max] as const;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function assertFinitePhysicalValue(value: unknown, name: string): PhysicalAnimatable {
  if (typeof value === 'number') {
    return assertFiniteNumber(value, name);
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) => assertFinitePhysicalValue(entry, `${name}[${index}]`));
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      result[key] = assertFinitePhysicalValue(value[key], `${name}.${key}`);
    }
    return result;
  }

  throw new TypeError(`${name} must be a finite number, array, or object of finite numbers`);
}

export function assertCompatiblePhysicalShape(template: PhysicalAnimatable, value: PhysicalAnimatable, name: string): void {
  if (typeof template === 'number' || typeof value === 'number') {
    if (typeof template !== 'number' || typeof value !== 'number') {
      throw new TypeError(`${name} must match the target numeric shape`);
    }
    return;
  }

  if (Array.isArray(template) || Array.isArray(value)) {
    if (!Array.isArray(template) || !Array.isArray(value) || template.length !== value.length) {
      throw new TypeError(`${name} must match the target array shape`);
    }
    for (let index = 0; index < template.length; index++) {
      assertCompatiblePhysicalShape(template[index] as PhysicalAnimatable, value[index] as PhysicalAnimatable, `${name}[${index}]`);
    }
    return;
  }

  if (isPlainObject(template) || isPlainObject(value)) {
    if (!isPlainObject(template) || !isPlainObject(value)) {
      throw new TypeError(`${name} must match the target object shape`);
    }

    const templateKeys = Object.keys(template).sort();
    const valueKeys = Object.keys(value).sort();
    if (templateKeys.length !== valueKeys.length || templateKeys.some((key, index) => key !== valueKeys[index])) {
      throw new TypeError(`${name} must use the same object keys as the target`);
    }

    for (const key of templateKeys) {
      assertCompatiblePhysicalShape(template[key] as PhysicalAnimatable, value[key] as PhysicalAnimatable, `${name}.${key}`);
    }
  }
}
