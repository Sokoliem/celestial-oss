import type { NamedScaleComparator, NamedScaleDef, NamedScaleInput, NamedScaleTier } from './types.js';

const namedScales = new Map<string, NamedScaleDef>();

function normalizeScale(scale: string, tiers: NamedScaleInput): NamedScaleDef {
  const entries = Object.entries(tiers);
  if (entries.length === 0) {
    throw new Error(`defineBreakpoints: scale '${scale}' must declare at least one tier.`);
  }

  const seenNames = new Set<string>();
  const seenMins = new Set<number>();
  for (const [name, min] of entries) {
    if (!name || /\s/.test(name)) {
      throw new Error(`defineBreakpoints: scale '${scale}' has an invalid tier name '${name}'.`);
    }
    if (!Number.isFinite(min) || min < 0) {
      throw new Error(`defineBreakpoints: scale '${scale}' tier '${name}' must have a finite, non-negative threshold.`);
    }
    if (seenNames.has(name)) {
      throw new Error(`defineBreakpoints: scale '${scale}' has duplicate tier name '${name}'.`);
    }
    if (seenMins.has(min)) {
      throw new Error(`defineBreakpoints: scale '${scale}' has duplicate threshold for tier '${name}'.`);
    }
    seenNames.add(name);
    seenMins.add(min);
  }

  const sorted: NamedScaleTier[] = entries.map(([name, min]) => ({ name, min })).sort((a, b) => a.min - b.min);

  return { scale, tiers: sorted };
}

export function defineBreakpoints(definitions: Readonly<Record<string, NamedScaleInput>>): readonly NamedScaleDef[] {
  const registered: NamedScaleDef[] = [];
  for (const [scale, tiers] of Object.entries(definitions)) {
    const def = normalizeScale(scale, tiers);
    namedScales.set(scale, def);
    registered.push(def);
  }
  return registered;
}

export function getNamedScale(scale: string): NamedScaleDef | null {
  return namedScales.get(scale) ?? null;
}

export function listNamedScales(): readonly NamedScaleDef[] {
  return [...namedScales.values()];
}

export function clearNamedScales(): void {
  namedScales.clear();
}

export function resolveNamedTier(scale: string, value: number): string | null {
  const def = namedScales.get(scale);
  if (!def) return null;
  if (!Number.isFinite(value)) return null;

  let matched: string | null = null;
  for (const tier of def.tiers) {
    if (value >= tier.min) {
      matched = tier.name;
    } else {
      break;
    }
  }

  if (matched === null && def.tiers.length > 0) {
    return def.tiers[0]!.name;
  }
  return matched;
}

export function paneMode(scale: string, value: number): string | null {
  return resolveNamedTier(scale, value);
}

export function densityFor(scale: string, value: number): string | null {
  return resolveNamedTier(scale, value);
}

interface ParsedComparator {
  readonly op: '>=' | '>' | '<=' | '<' | '==' | '!=';
  readonly tier: string;
}

const COMPARATOR_PATTERN = /^\s*(>=|<=|==|!=|>|<)\s*([^\s]+)\s*$/;

function parseComparator(input: NamedScaleComparator): ParsedComparator {
  const trimmed = String(input).trim();
  const match = trimmed.match(COMPARATOR_PATTERN);
  if (match) {
    return { op: match[1] as ParsedComparator['op'], tier: match[2]! };
  }
  return { op: '>=', tier: trimmed };
}

export interface NamedScaleRangeBound {
  readonly min?: number;
  readonly max?: number;
}

/**
 * Decode a `{scaleName: comparator}` shape into the `{min, max}` shape used by
 * the existing `WhenCondition` resolver. Returns `null` when the scale or tier
 * is unknown so callers can fall through gracefully.
 */
export function comparatorToRange(scale: string, comparator: NamedScaleComparator): NamedScaleRangeBound | null {
  const def = namedScales.get(scale);
  if (!def) return null;

  const { op, tier } = parseComparator(comparator);
  const target = def.tiers.find((entry) => entry.name === tier);
  if (!target) return null;

  const sortedTiers = def.tiers;
  const targetIndex = sortedTiers.indexOf(target);
  const next = sortedTiers[targetIndex + 1];
  const targetMin = target.min;
  const targetMaxExclusive = next?.min;

  switch (op) {
    case '>=':
      return { min: targetMin };
    case '>':
      return targetMaxExclusive !== undefined ? { min: targetMaxExclusive } : { min: targetMin + 1 };
    case '<':
      return { max: targetMin - 1 };
    case '<=':
      return targetMaxExclusive !== undefined ? { max: targetMaxExclusive - 1 } : {};
    case '==':
      return targetMaxExclusive !== undefined ? { min: targetMin, max: targetMaxExclusive - 1 } : { min: targetMin };
    case '!=': {
      // The existing single-range comparator can only express one inequality cleanly.
      // Approximate by widening to "anything below the matched tier" — callers wanting
      // the upper half should compose two `when()` calls.
      if (targetIndex === 0) {
        return targetMaxExclusive !== undefined ? { min: targetMaxExclusive } : { min: targetMin + 1 };
      }
      return { max: targetMin - 1 };
    }
  }
}

export function isNamedScaleConditionInput(input: unknown): input is Record<string, NamedScaleComparator> {
  if (input === null || typeof input !== 'object') return false;
  if (Array.isArray(input)) return false;
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length !== 1) return false;
  const [scale, comparator] = entries[0]!;
  if (typeof scale !== 'string' || typeof comparator !== 'string') return false;
  return namedScales.has(scale);
}
