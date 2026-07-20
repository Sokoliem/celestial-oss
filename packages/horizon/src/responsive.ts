import { getTerminalSize } from '@celestial/core/gravity';
import type { BreakpointName as CanonicalBreakpointName, VNode } from '@celestial/core/nebula';
import { clampFinite, MAX_LAYOUT_ITEMS, nonNegativeInteger } from './internal.js';

export interface BreakpointConfig {
  sm?: number;
  md?: number;
  lg?: number;
  xl?: number;
}

let breakpointConfig: Required<BreakpointConfig> = {
  sm: 40,
  md: 80,
  lg: 120,
  xl: 160,
};

export function setBreakpoints(config: BreakpointConfig): void {
  const candidate: Required<BreakpointConfig> = {
    sm: nonNegativeInteger(config.sm, breakpointConfig.sm),
    md: nonNegativeInteger(config.md, breakpointConfig.md),
    lg: nonNegativeInteger(config.lg, breakpointConfig.lg),
    xl: nonNegativeInteger(config.xl, breakpointConfig.xl),
  };
  for (const [name, value] of Object.entries(config)) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0 || !Number.isInteger(value))) {
      throw new RangeError(`horizon/setBreakpoints: ${name} must be a non-negative integer`);
    }
  }
  if (!(candidate.sm <= candidate.md && candidate.md <= candidate.lg && candidate.lg <= candidate.xl)) {
    throw new RangeError('horizon/setBreakpoints: thresholds must be ordered sm <= md <= lg <= xl');
  }
  breakpointConfig = candidate;
}

export function getBreakpoints(): Required<BreakpointConfig> {
  return { ...breakpointConfig };
}

export type BreakpointName = CanonicalBreakpointName | 'compact' | 'narrow' | 'standard' | 'wide';

function normalizeBreakpointName(name: BreakpointName): CanonicalBreakpointName {
  switch (name) {
    case 'compact':
      return 'xs';
    case 'narrow':
      return 'sm';
    case 'standard':
      return 'md';
    case 'wide':
      return 'lg';
    default:
      return name;
  }
}

function resolveBreakpointName(cols: number, thresholds: Required<BreakpointConfig>): CanonicalBreakpointName {
  cols = nonNegativeInteger(cols);
  if (cols >= thresholds.xl) return 'xl';
  if (cols >= thresholds.lg) return 'lg';
  if (cols >= thresholds.md) return 'md';
  if (cols >= thresholds.sm) return 'sm';
  return 'xs';
}

function resolveCurrentCanonicalBreakpoint(): CanonicalBreakpointName {
  return resolveBreakpointName(getTerminalSize().cols, breakpointConfig);
}

export function getCurrentBreakpoint(): CanonicalBreakpointName {
  return resolveCurrentCanonicalBreakpoint();
}

function toCanonicalBreakpoint(name: BreakpointName): CanonicalBreakpointName {
  return normalizeBreakpointName(name);
}

const ORDER: readonly CanonicalBreakpointName[] = ['xs', 'sm', 'md', 'lg', 'xl'];

export function isBreakpoint(name: BreakpointName): boolean {
  return getCurrentBreakpoint() === toCanonicalBreakpoint(name);
}

export function isBreakpointOrBelow(name: BreakpointName): boolean {
  const current = getCurrentBreakpoint();
  return ORDER.indexOf(current) <= ORDER.indexOf(toCanonicalBreakpoint(name));
}

export function isBreakpointOrAbove(name: BreakpointName): boolean {
  const current = getCurrentBreakpoint();
  return ORDER.indexOf(current) >= ORDER.indexOf(toCanonicalBreakpoint(name));
}

export function getColumns(): number {
  return nonNegativeInteger(getTerminalSize().cols);
}

export function getRows(): number {
  return nonNegativeInteger(getTerminalSize().rows);
}

export function responsiveValue<T>(values: Partial<Record<BreakpointName, T>>, fallback: T): T {
  const normalized = new Map<CanonicalBreakpointName, T>();
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (!['xs', 'sm', 'md', 'lg', 'xl', 'compact', 'narrow', 'standard', 'wide'].includes(name)) continue;
    normalized.set(toCanonicalBreakpoint(name as BreakpointName), value);
  }

  const current = getCurrentBreakpoint();
  if (normalized.has(current)) return normalized.get(current)!;

  const currentIndex = ORDER.indexOf(current);
  for (let i = currentIndex - 1; i >= 0; i--) {
    const candidate = ORDER[i]!;
    if (normalized.has(candidate)) return normalized.get(candidate)!;
  }
  for (let i = currentIndex + 1; i < ORDER.length; i++) {
    const candidate = ORDER[i]!;
    if (normalized.has(candidate)) return normalized.get(candidate)!;
  }

  return fallback;
}

export interface ResponsiveLayoutConfig {
  xs?: VNode;
  sm?: VNode;
  md?: VNode;
  lg?: VNode;
  xl?: VNode;
  compact?: VNode;
  narrow?: VNode;
  standard?: VNode;
  wide?: VNode;
  fallback: VNode;
}

export function responsiveLayout(config: ResponsiveLayoutConfig): VNode {
  return responsiveValue(config as Partial<Record<BreakpointName, VNode>>, config.fallback);
}

export interface ResponsivePanelOptions {
  hideTitleBelow?: number;
  reducePaddingBelow?: number;
  hideBelow?: number;
  collapseBelow?: number;
}

export function resolveResponsiveOptions(options: ResponsivePanelOptions): {
  showTitle: boolean;
  reducedPadding: boolean;
  hidden: boolean;
  collapsed: boolean;
} {
  const cols = getColumns();
  const hideTitleBelow = finiteThreshold(options.hideTitleBelow);
  const reducePaddingBelow = finiteThreshold(options.reducePaddingBelow);
  const hideBelow = finiteThreshold(options.hideBelow);
  const collapseBelow = finiteThreshold(options.collapseBelow);

  return {
    showTitle: hideTitleBelow === undefined ? true : cols >= hideTitleBelow,
    reducedPadding: reducePaddingBelow === undefined ? false : cols < reducePaddingBelow,
    hidden: hideBelow === undefined ? false : cols < hideBelow,
    collapsed: collapseBelow === undefined ? false : cols < collapseBelow,
  };
}

export interface ResponsiveSplitOptions {
  collapseBelow?: number;
  hideSeparatorBelow?: number;
  minRatioBelow?: { ratio: number; below: number }[];
}

export function resolveResponsiveSplitOptions(
  options: ResponsiveSplitOptions,
  currentRatio: number,
): {
  collapsed: boolean;
  showSeparator: boolean;
  ratio: number;
} {
  const cols = getColumns();

  let ratio = clampFinite(currentRatio, 0, 1, 0.5);
  if (options.minRatioBelow) {
    for (const entry of options.minRatioBelow.slice(0, MAX_LAYOUT_ITEMS)) {
      if (!entry || !Number.isFinite(entry.below) || !Number.isFinite(entry.ratio)) continue;
      const below = nonNegativeInteger(entry.below);
      const minRatio = clampFinite(entry.ratio, 0, 1);
      if (cols < below) {
        ratio = Math.max(ratio, minRatio);
      }
    }
  }
  const collapseBelow = finiteThreshold(options.collapseBelow);
  const hideSeparatorBelow = finiteThreshold(options.hideSeparatorBelow);

  return {
    collapsed: collapseBelow !== undefined && cols < collapseBelow,
    showSeparator: hideSeparatorBelow === undefined || cols >= hideSeparatorBelow,
    ratio,
  };
}

export function when(condition: BreakpointName | { min?: number; max?: number }, ifTrue: VNode, ifFalse?: VNode): VNode | undefined {
  const cols = getColumns();
  const matches = typeof condition === 'string' ? isBreakpoint(condition) : matchesRange(cols, condition);

  return matches ? ifTrue : ifFalse;
}

export function mediaQuery(condition: { min?: number; max?: number }): boolean {
  return matchesRange(getColumns(), condition);
}

function finiteThreshold(value: number | undefined): number | undefined {
  return value === undefined || !Number.isFinite(value) ? undefined : nonNegativeInteger(value);
}

function matchesRange(value: number, condition: { min?: number; max?: number }): boolean {
  const min = finiteThreshold(condition.min);
  const max = finiteThreshold(condition.max);
  if (min !== undefined && max !== undefined && min > max) return false;
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}
