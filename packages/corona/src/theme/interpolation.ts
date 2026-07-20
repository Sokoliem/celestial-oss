import { type Color, color } from '../color.js';
import type { ColorScale, SemanticTheme } from './types.js';

function isThemeColor(value: unknown): value is Color {
  return value !== null && typeof value === 'object' && typeof (value as Color).fg === 'function';
}

function isColorScale(value: unknown): value is ColorScale {
  return value !== null && typeof value === 'object' && typeof (value as ColorScale).sample === 'function';
}

function interpolateValue(a: unknown, b: unknown, t: number): unknown {
  if (isThemeColor(a) && isThemeColor(b)) {
    return color.lerp(a, b, t);
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a + (b - a) * t;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.map((v, i) => interpolateValue(v, (b as unknown[])[i], t));
  }
  if (isColorScale(a) || isColorScale(b)) {
    return t < 0.5 ? a : b;
  }
  if (
    typeof a === 'object' &&
    a !== null &&
    !isThemeColor(a) &&
    typeof b === 'object' &&
    b !== null &&
    !isThemeColor(b) &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    return interpolateObject(a as Record<string, unknown>, b as Record<string, unknown>, t);
  }
  return t < 0.5 ? a : b;
}

function interpolateObject(a: Record<string, unknown>, b: Record<string, unknown>, t: number): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (key in a && key in b) {
      result[key] = interpolateValue(a[key], b[key], t);
    } else if (key in a) {
      result[key] = a[key];
    } else {
      result[key] = b[key];
    }
  }
  return result;
}

/**
 * Interpolate between two semantic themes at position t (0 = from, 1 = to).
 * Colors are interpolated in OKLAB space. Numbers interpolate linearly.
 * Non-interpolatable values (strings, booleans, functions) snap at t >= 0.5.
 */
export function interpolateTheme(from: SemanticTheme, to: SemanticTheme, t: number): SemanticTheme {
  const clamped = Math.max(0, Math.min(1, t));
  return interpolateObject(from as unknown as Record<string, unknown>, to as unknown as Record<string, unknown>, clamped) as unknown as SemanticTheme;
}
