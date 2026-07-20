import type { BreakpointContext } from '@celestial/nebula';
import { DEFAULT_BREAKPOINT_THRESHOLDS, getBreakpointDefinition, getBreakpointOrder, normalizeBreakpointName, resolveBreakpointName } from './breakpoints.js';
import { getTerminalSize } from './context.js';
import { getActiveMediaContract, matchTier } from './media-contract.js';
import { comparatorToRange, isNamedScaleConditionInput } from './named-breakpoints.js';
import type {
  AnyWhenCondition,
  AxisCondition,
  BreakpointDef,
  BreakpointMap,
  BreakpointName,
  CanonicalBreakpointName,
  ComponentNode,
  NamedScaleComparator,
  PredicateCondition,
  VNode,
  WhenCondition,
  WhenConditional,
} from './types.js';

let activeBreakpointContext: BreakpointContext | null = null;

const customBreakpointRegistry = new Map<string, BreakpointDef>();

type WhenConditionalResult<T, C extends AnyWhenCondition> = {
  _tag: 'when-conditional';
  condition: C;
  ifTrue: T;
  ifFalse: T;
};

type BreakpointHelper = Record<string, BreakpointDef> & ((layouts: Record<string, VNode>) => VNode);

export interface ResponsiveTrace {
  cols: number;
  matchedBreakpoint: string | null;
  canonicalBreakpoint: CanonicalBreakpointName;
  reason: 'matched' | 'fallback';
  selected: VNode;
}

function getCurrentCols(): number {
  if (activeBreakpointContext) {
    return activeBreakpointContext.size().cols;
  }
  return getTerminalSize().cols;
}

function resolveBreakpoint(cols: number, condition: BreakpointDef): boolean {
  if (condition.min !== undefined && cols < condition.min) return false;
  if (condition.max !== undefined && cols > condition.max) return false;
  return true;
}

function getRegisteredBreakpointDefinition(name: string): BreakpointDef | null {
  return customBreakpointRegistry.get(name) ?? getBreakpointDefinition(name);
}

function specificity(def: BreakpointDef): number {
  const min = def.min ?? Number.NEGATIVE_INFINITY;
  const max = def.max ?? Number.POSITIVE_INFINITY;
  return max - min;
}

function selectMatchedEntry(cols: number, layouts: Record<string, VNode>): [string, VNode] | null {
  const candidates = Object.entries(layouts)
    .filter(([name]) => name !== 'default')
    .map(([name, node]) => ({ name, node, def: getRegisteredBreakpointDefinition(name) }))
    .filter((entry): entry is { name: string; node: VNode; def: BreakpointDef } => entry.def !== null)
    .filter((entry) => resolveBreakpoint(cols, entry.def))
    .sort((a, b) => specificity(a.def) - specificity(b.def));

  if (candidates.length === 0) {
    return null;
  }

  return [candidates[0]!.name, candidates[0]!.node];
}

function fallbackLayout(layouts: Record<string, VNode>): VNode {
  return layouts.default ?? Object.values(layouts)[Object.values(layouts).length - 1] ?? { kind: 'empty' };
}

function getActiveBreakpointName(defs: BreakpointMap): string {
  const cols = getCurrentCols();
  const entries = Object.entries(defs).sort((a, b) => a[1] - b[1]);
  for (let i = entries.length - 1; i >= 0; i--) {
    const [name, threshold] = entries[i]!;
    if (cols >= threshold) {
      return name;
    }
  }
  return entries[0]?.[0] ?? 'xs';
}

function resolveResponsiveSelection(cols: number, layouts: Record<string, VNode>): ResponsiveTrace {
  const canonicalBreakpoint = resolveBreakpointName(cols, DEFAULT_BREAKPOINT_THRESHOLDS);
  const matched = selectMatchedEntry(cols, layouts);

  if (matched) {
    return {
      cols,
      matchedBreakpoint: matched[0],
      canonicalBreakpoint,
      reason: 'matched',
      selected: matched[1],
    };
  }

  return {
    cols,
    matchedBreakpoint: null,
    canonicalBreakpoint,
    reason: 'fallback',
    selected: fallbackLayout(layouts),
  };
}

export function setBreakpointContext(ctx: BreakpointContext | null): void {
  activeBreakpointContext = ctx;
}

export function getBreakpointContext(): BreakpointContext | null {
  return activeBreakpointContext;
}

export const breakpoint = new Proxy(
  ((layouts: Record<string, VNode>) => traceResponsive({ cols: getCurrentCols(), rows: getTerminalSize().rows }, layouts).selected) as BreakpointHelper,
  {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined;
      return getRegisteredBreakpointDefinition(prop) ?? Reflect.get({}, prop);
    },
    set(_target, prop, value) {
      if (typeof prop !== 'string' || typeof value !== 'object' || value === null) {
        return false;
      }
      customBreakpointRegistry.set(prop, value as BreakpointDef);
      return true;
    },
    deleteProperty(_target, prop) {
      if (typeof prop !== 'string') return false;
      return customBreakpointRegistry.delete(prop);
    },
    ownKeys() {
      return [...getBreakpointOrder(), 'compact', 'narrow', 'standard', 'wide', ...customBreakpointRegistry.keys()];
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop !== 'string') return undefined;
      const value = getRegisteredBreakpointDefinition(prop);
      if (!value) return undefined;
      return {
        configurable: true,
        enumerable: true,
        writable: true,
        value,
      };
    },
  },
);

export type NamedScaleConditionInput = Record<string, NamedScaleComparator>;
export type AxisConditionInput = Record<string, string>;

export function when(condition: BreakpointDef): WhenCondition;
export function when(condition: NamedScaleConditionInput): WhenCondition;
export function when(condition: AxisConditionInput): AxisCondition;
export function when(condition: (width: number) => boolean): PredicateCondition;
export function when<T>(condition: BreakpointDef, ifTrue: T, ifFalse: T): WhenConditionalResult<T, WhenCondition>;
export function when<T>(condition: NamedScaleConditionInput, ifTrue: T, ifFalse: T): WhenConditionalResult<T, WhenCondition>;
export function when<T>(condition: AxisConditionInput, ifTrue: T, ifFalse: T): WhenConditionalResult<T, AxisCondition>;
export function when<T>(condition: (width: number) => boolean, ifTrue: T, ifFalse: T): WhenConditionalResult<T, PredicateCondition>;
export function when<T>(
  condition: BreakpointDef | NamedScaleConditionInput | AxisConditionInput | ((width: number) => boolean),
  ...branches: [T, T] | []
): AnyWhenCondition | WhenConditional<T> {
  let whenCond: AnyWhenCondition;
  if (typeof condition === 'function') {
    whenCond = { _tag: 'when-predicate', test: condition };
  } else if (isNamedScaleConditionInput(condition)) {
    const [scale, comparator] = Object.entries(condition)[0]!;
    const range = comparatorToRange(scale, comparator);
    if (range === null) {
      whenCond = { _tag: 'when-predicate', test: () => false };
    } else {
      whenCond = { _tag: 'when', min: range.min, max: range.max };
    }
  } else if (isAxisConditionInput(condition)) {
    whenCond = toAxisCondition(condition);
  } else {
    const def = condition as BreakpointDef;
    whenCond = { _tag: 'when', min: def.min, max: def.max };
  }

  if (branches.length === 0) {
    return whenCond;
  }
  const [ifTrue, ifFalse] = branches;

  return {
    _tag: 'when-conditional',
    condition: whenCond,
    ifTrue: ifTrue as T,
    ifFalse: ifFalse as T,
  };
}

function isAxisConditionInput(condition: BreakpointDef | AxisConditionInput): condition is AxisConditionInput {
  if (condition === null || typeof condition !== 'object') return false;
  const keys = Object.keys(condition);
  if (keys.length === 0) return false;
  for (const key of keys) {
    if (key === 'min' || key === 'max') return false;
    if (typeof (condition as Record<string, unknown>)[key] !== 'string') return false;
  }
  return true;
}

function toAxisCondition(input: AxisConditionInput): AxisCondition {
  const keys = Object.keys(input);
  if (keys.length !== 1) {
    throw new Error(`when({...}) axis condition must have exactly one axis key (got ${keys.length}).`);
  }
  const axis = keys[0]!;
  return {
    _tag: 'when-axis',
    axis,
    comparator: input[axis]!,
  };
}

export function resolveWhen(condition: AnyWhenCondition): boolean {
  const cols = getCurrentCols();
  if (condition._tag === 'when-predicate') {
    return condition.test(cols);
  }
  if (condition._tag === 'when-axis') {
    return resolveAxisCondition(condition, cols);
  }
  if (condition._tag === 'when-env') {
    return condition.test({
      terminal: { cols, rows: 0 },
      available: { cols, rows: 0 },
      container: { cols, rows: 0 },
      safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      workArea: { top: 0, right: 0, bottom: 0, left: 0 },
      orientation: 'landscape',
      density: cols < 80 ? 'compact' : cols < 120 ? 'comfortable' : 'spacious',
      pointer: 'none',
      keyboard: 'full',
    });
  }
  return resolveBreakpoint(cols, condition);
}

function resolveAxisCondition(condition: AxisCondition, cols: number): boolean {
  const contract = getActiveMediaContract(condition.axis);
  if (!contract) return false;

  const parsed = parseComparator(condition.comparator);
  if (!parsed) {
    throw new Error(`Invalid axis comparator "${condition.comparator}" — expected e.g. ">= comfortable".`);
  }

  const targetTier = contract.tiers[parsed.tierName];
  if (!targetTier) {
    throw new Error(`Tier "${parsed.tierName}" is not defined on contract "${condition.axis}".`);
  }

  const matched = matchTier(contract, cols);
  const matchedCols = matched ? matched.tier.cols : -Infinity;
  const targetCols = targetTier.cols;

  switch (parsed.op) {
    case '>=':
      return matchedCols >= targetCols;
    case '>':
      return matchedCols > targetCols;
    case '<=':
      return matchedCols <= targetCols;
    case '<':
      return matchedCols < targetCols;
    case '==':
      return matched ? matched.name === parsed.tierName : false;
    case '!=':
      return matched ? matched.name !== parsed.tierName : true;
  }
}

function parseComparator(raw: string): { op: '>=' | '>' | '<=' | '<' | '==' | '!='; tierName: string } | null {
  const trimmed = raw.trim();
  const match = /^(>=|<=|==|!=|>|<)\s*(.+)$/.exec(trimmed);
  if (!match) return null;
  return { op: match[1] as '>=' | '>' | '<=' | '<' | '==' | '!=', tierName: match[2]!.trim() };
}

export function resolveConditional<T>(cond: WhenConditional<T>): T {
  return resolveWhen(cond.condition) ? cond.ifTrue : cond.ifFalse;
}

export function responsive(layouts: Record<string, VNode>): ComponentNode;
export function responsive(breakpoints: BreakpointMap, render: (name: string) => VNode): ComponentNode;
export function responsive(layoutsOrBreakpoints: Record<string, VNode> | BreakpointMap, render?: (name: string) => VNode): ComponentNode {
  const useCustomBreakpoints = typeof render === 'function';

  return {
    kind: 'component',
    render: (): VNode => {
      if (useCustomBreakpoints) {
        return render!(getActiveBreakpointName(layoutsOrBreakpoints as BreakpointMap));
      }

      return resolveResponsiveSelection(getCurrentCols(), layoutsOrBreakpoints as Record<string, VNode>).selected;
    },
  };
}

export function traceResponsive(size: { cols: number; rows: number }, layouts: Record<string, VNode>): ResponsiveTrace {
  return resolveResponsiveSelection(size.cols, layouts);
}

export function normalizeResponsiveBreakpointName(name: BreakpointName): CanonicalBreakpointName | null {
  return normalizeBreakpointName(name);
}
