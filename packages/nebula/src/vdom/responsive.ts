/**
 * Extracted from ../vdom.ts. Behavior-preserving split.
 */

import type { BreakpointName, Responsive } from '@celestial/corona';
import { resolveBreakpoint as _resolveBreakpoint, DEFAULT_THRESHOLDS } from '../breakpoint.js';
import type { ResolvedStyleAttrs, StyleAttrs } from './style.js';

const BP_ORDER: BreakpointName[] = ['xs', 'sm', 'md', 'lg', 'xl'];

export function resolveResponsive<T>(value: Responsive<T> | undefined, currentBP: BreakpointName): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value as T;
  const obj = value as Record<BreakpointName, T>;
  const idx = BP_ORDER.indexOf(currentBP);
  for (let i = idx; i >= 0; i--) {
    const bp = BP_ORDER[i]!;
    if (obj[bp] !== undefined) return obj[bp];
  }
  return undefined;
}

export function getBreakpoint(width: number): BreakpointName {
  return _resolveBreakpoint(width, DEFAULT_THRESHOLDS);
}

const resolveStyleCache = new WeakMap<StyleAttrs, Map<BreakpointName, ResolvedStyleAttrs>>();

export function resolveStyle(style: StyleAttrs | undefined, bp: BreakpointName): ResolvedStyleAttrs | undefined {
  if (!style) return undefined;

  let bpCache = resolveStyleCache.get(style);
  if (bpCache) {
    const cached = bpCache.get(bp);
    if (cached) return cached;
  }

  const resolved: ResolvedStyleAttrs = {
    fg: resolveResponsive(style.fg, bp),
    bg: resolveResponsive(style.bg, bp),
    fgRgb: resolveResponsive(style.fgRgb, bp),
    bgRgb: resolveResponsive(style.bgRgb, bp),
    borderFg: resolveResponsive(style.borderFg, bp),
    borderFgRgb: resolveResponsive(style.borderFgRgb, bp),
    bold: resolveResponsive(style.bold, bp),
    dim: resolveResponsive(style.dim, bp),
    italic: resolveResponsive(style.italic, bp),
    underline: resolveResponsive(style.underline, bp),
    strikethrough: resolveResponsive(style.strikethrough, bp),
    effects: resolveResponsive(style.effects, bp),
    elevation: resolveResponsive(style.elevation, bp),
    icon: resolveResponsive(style.icon, bp),
    padding: resolveResponsive(style.padding, bp),
    gradientFg: style.gradientFg,
  };

  if (!bpCache) {
    bpCache = new Map();
    resolveStyleCache.set(style, bpCache);
  }
  bpCache.set(bp, resolved);
  return resolved;
}

export function normalizeSides(value: number | [number, number] | [number, number, number, number]): [number, number, number, number] {
  if (typeof value === 'number') return [value, value, value, value];
  if (value.length === 2) return [value[0], value[1], value[0], value[1]];
  return value;
}
