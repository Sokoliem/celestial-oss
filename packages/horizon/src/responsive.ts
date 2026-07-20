import { getTerminalSize } from '@celestial/core/gravity';
import type { BreakpointName as CanonicalBreakpointName, VNode } from '@celestial/core/nebula';

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
  breakpointConfig = { ...breakpointConfig, ...config };
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
  return getTerminalSize().cols;
}

export function getRows(): number {
  return getTerminalSize().rows;
}

export function responsiveValue<T>(values: Partial<Record<BreakpointName, T>>, fallback: T): T {
  const normalized = new Map<CanonicalBreakpointName, T>();
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) continue;
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

  return {
    showTitle: options.hideTitleBelow === undefined ? true : cols >= options.hideTitleBelow,
    reducedPadding: options.reducePaddingBelow === undefined ? false : cols < options.reducePaddingBelow,
    hidden: options.hideBelow === undefined ? false : cols < options.hideBelow,
    collapsed: options.collapseBelow === undefined ? false : cols < options.collapseBelow,
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

  let ratio = currentRatio;
  if (options.minRatioBelow) {
    for (const { ratio: minRatio, below } of options.minRatioBelow) {
      if (cols < below) {
        ratio = Math.max(ratio, minRatio);
      }
    }
  }

  return {
    collapsed: options.collapseBelow !== undefined && cols < options.collapseBelow,
    showSeparator: options.hideSeparatorBelow === undefined || cols >= options.hideSeparatorBelow,
    ratio,
  };
}

export function when(condition: BreakpointName | { min?: number; max?: number }, ifTrue: VNode, ifFalse?: VNode): VNode | undefined {
  const cols = getColumns();
  const matches =
    typeof condition === 'string'
      ? isBreakpoint(condition)
      : (condition.min === undefined || cols >= condition.min) && (condition.max === undefined || cols <= condition.max);

  return matches ? ifTrue : ifFalse;
}

export function mediaQuery(condition: { min?: number; max?: number }): boolean {
  const cols = getColumns();
  return (condition.min === undefined || cols >= condition.min) && (condition.max === undefined || cols <= condition.max);
}
