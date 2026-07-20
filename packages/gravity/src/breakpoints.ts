import type { BreakpointDef, BreakpointName, BreakpointThresholds, CanonicalBreakpointName, LegacyBreakpointName } from './types.js';

export const DEFAULT_BREAKPOINT_THRESHOLDS: BreakpointThresholds = {
  sm: 40,
  md: 80,
  lg: 120,
  xl: 160,
};

export const CANONICAL_BREAKPOINT_ORDER: readonly CanonicalBreakpointName[] = ['xs', 'sm', 'md', 'lg', 'xl'];

export const LEGACY_BREAKPOINT_ALIASES: Readonly<Record<LegacyBreakpointName, CanonicalBreakpointName>> = {
  compact: 'xs',
  narrow: 'sm',
  standard: 'md',
  wide: 'lg',
};

export const BREAKPOINT_ALIASES: Readonly<Record<string, CanonicalBreakpointName>> = {
  ...LEGACY_BREAKPOINT_ALIASES,
};

export function normalizeBreakpointName(name: BreakpointName): CanonicalBreakpointName | null {
  if (CANONICAL_BREAKPOINT_ORDER.includes(name as CanonicalBreakpointName)) {
    return name as CanonicalBreakpointName;
  }
  return BREAKPOINT_ALIASES[name] ?? null;
}

export function resolveBreakpointName(cols: number, thresholds: BreakpointThresholds = DEFAULT_BREAKPOINT_THRESHOLDS): CanonicalBreakpointName {
  if (cols >= thresholds.xl) return 'xl';
  if (cols >= thresholds.lg) return 'lg';
  if (cols >= thresholds.md) return 'md';
  if (cols >= thresholds.sm) return 'sm';
  return 'xs';
}

export function getBreakpointDefinition(name: BreakpointName, thresholds: BreakpointThresholds = DEFAULT_BREAKPOINT_THRESHOLDS): BreakpointDef | null {
  const normalized = normalizeBreakpointName(name);
  if (!normalized) {
    return null;
  }

  switch (normalized) {
    case 'xs':
      return { max: thresholds.sm - 1 };
    case 'sm':
      return { min: thresholds.sm, max: thresholds.md - 1 };
    case 'md':
      return { min: thresholds.md, max: thresholds.lg - 1 };
    case 'lg':
      return { min: thresholds.lg, max: thresholds.xl - 1 };
    case 'xl':
      return { min: thresholds.xl };
  }
}

export function getCanonicalBreakpointMap(thresholds: BreakpointThresholds = DEFAULT_BREAKPOINT_THRESHOLDS): Record<CanonicalBreakpointName, BreakpointDef> {
  return {
    xs: getBreakpointDefinition('xs', thresholds)!,
    sm: getBreakpointDefinition('sm', thresholds)!,
    md: getBreakpointDefinition('md', thresholds)!,
    lg: getBreakpointDefinition('lg', thresholds)!,
    xl: getBreakpointDefinition('xl', thresholds)!,
  };
}

export function isCanonicalBreakpointName(name: string): name is CanonicalBreakpointName {
  return CANONICAL_BREAKPOINT_ORDER.includes(name as CanonicalBreakpointName);
}

export function getBreakpointOrder(): readonly CanonicalBreakpointName[] {
  return CANONICAL_BREAKPOINT_ORDER;
}
