/**
 * SurfacePolicy — declarative DSL that resolves render settings from detected
 * capabilities and re-evaluates when capabilities change.
 *
 * Usage:
 * ```ts
 * const policy = createSurfacePolicy([
 *   { when: { colorLevel: { lt: 'truecolor' } }, apply: { theme: 'mono', flicker: false } },
 *   { when: { reducedMotion: true }, apply: { animation: false } },
 * ]);
 * policy.bind(registry, watcher);
 * const settings = policy.current();
 * policy.onChange((settings) => { ... });
 * ```
 *
 * Rules are evaluated in declaration order; later rules override earlier ones
 * for the same key (last-writer wins per key, not per rule).
 */

import type { CapabilityRegistry } from './registry.js';
import type { AtlasColorLevel } from './types.js';
import type { CapabilityChange, CapabilityWatcher } from './watcher.js';

// ─── Condition types ──────────────────────────────────────────────────────────

/** Color-level ordering for range comparisons. */
const COLOR_LEVEL_ORDER: Record<AtlasColorLevel, number> = {
  none: 0,
  '16': 1,
  '256': 2,
  truecolor: 3,
};

/** Range comparison for ordered scalar capability fields. */
export interface RangeCondition<T> {
  /** Less-than: field < value */
  readonly lt?: T;
  /** Less-than-or-equal: field <= value */
  readonly lte?: T;
  /** Greater-than: field > value */
  readonly gt?: T;
  /** Greater-than-or-equal: field >= value */
  readonly gte?: T;
  /** Exact-equal: field === value */
  readonly eq?: T;
}

/**
 * Condition for a single capability.
 * - A plain value is an exact-equality check.
 * - A `RangeCondition` object enables ordered comparisons (for color level etc.).
 * - A function predicate gives full flexibility.
 */
export type CapabilityCondition<T> = T | RangeCondition<T> | ((value: T) => boolean);

/**
 * The `when` clause of a policy rule.
 *
 * Keys are detector ids (built-in or custom). Values are `CapabilityCondition`.
 * ALL entries must match for the rule to fire (AND semantics).
 */
export type PolicyWhen = Record<string, CapabilityCondition<unknown>>;

/**
 * Settings produced when a rule matches. Arbitrary key/value pairs that are
 * merged into the resolved settings object.
 */
export type PolicySettings = Record<string, unknown>;

/**
 * A single declarative policy rule.
 *
 * Note: the result key is `apply` rather than `then` so the literal cannot
 * be misinterpreted as a thenable (Biome's `noThenProperty` lint rule).
 */
export interface PolicyRule {
  readonly when: PolicyWhen;
  readonly apply: PolicySettings;
}

// ─── Surface-policy interface ─────────────────────────────────────────────────

export type SurfacePolicyChangeHandler = (settings: PolicySettings) => void;

export interface SurfacePolicy {
  /**
   * Bind this policy to a registry and watcher. The policy immediately runs
   * a full detection pass and re-evaluates on every capability change.
   * Returns an unsubscribe function that detaches from the watcher.
   */
  bind(registry: CapabilityRegistry, watcher: CapabilityWatcher): () => void;

  /** Return the most recently resolved settings object. */
  current(): PolicySettings;

  /** Register a callback invoked whenever the resolved settings change. */
  onChange(handler: SurfacePolicyChangeHandler): () => void;

  /**
   * Manually supply a capability profile and re-evaluate rules.
   * Useful in tests or when a registry/watcher is not available.
   */
  evaluate(profile: Record<string, unknown>): PolicySettings;
}

// ─── Condition evaluation ─────────────────────────────────────────────────────

function compareColorLevel(a: AtlasColorLevel, b: AtlasColorLevel): number {
  return (COLOR_LEVEL_ORDER[a] ?? 0) - (COLOR_LEVEL_ORDER[b] ?? 0);
}

function isRangeCondition(v: unknown): v is RangeCondition<unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  return keys.length > 0 && keys.every((k) => ['lt', 'lte', 'gt', 'gte', 'eq'].includes(k));
}

/**
 * Evaluate a single condition against the actual `value` from the profile.
 * The `id` is passed so we can apply type-specific ordering (e.g., colorLevel).
 */
function evalCondition(id: string, value: unknown, condition: CapabilityCondition<unknown>): boolean {
  // Function predicate
  if (typeof condition === 'function') {
    return (condition as (v: unknown) => boolean)(value);
  }

  // Range condition object
  if (isRangeCondition(condition)) {
    const compare = (a: unknown, b: unknown): number => {
      // Built-in ordered comparisons for known fields
      if (id === 'atlas.colorLevel' || id === 'colorLevel') {
        return compareColorLevel(a as AtlasColorLevel, b as AtlasColorLevel);
      }
      // Generic: try numeric ordering first, then string lex
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
    };

    if (condition.eq !== undefined && compare(value, condition.eq) !== 0) return false;
    if (condition.lt !== undefined && compare(value, condition.lt) >= 0) return false;
    if (condition.lte !== undefined && compare(value, condition.lte) > 0) return false;
    if (condition.gt !== undefined && compare(value, condition.gt) <= 0) return false;
    if (condition.gte !== undefined && compare(value, condition.gte) < 0) return false;
    return true;
  }

  // Plain equality
  return Object.is(value, condition);
}

// ─── Rule evaluation ──────────────────────────────────────────────────────────

function evalRule(rule: PolicyRule, profile: Record<string, unknown>): boolean {
  for (const [id, condition] of Object.entries(rule.when)) {
    const value = profile[id];
    if (!evalCondition(id, value, condition)) return false;
  }
  return true;
}

function resolveSettings(rules: readonly PolicyRule[], profile: Record<string, unknown>): PolicySettings {
  const settings: PolicySettings = {};
  for (const rule of rules) {
    if (evalRule(rule, profile)) {
      Object.assign(settings, rule.apply);
    }
  }
  return settings;
}

function settingsEqual(a: PolicySettings, b: PolicySettings): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => Object.is(a[k], b[k]));
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a `SurfacePolicy` from a list of declarative rules.
 *
 * @example
 * ```ts
 * const policy = createSurfacePolicy([
 *   { when: { 'atlas.colorLevel': { lt: 'truecolor' } }, apply: { theme: 'mono' } },
 *   { when: { 'atlas.reducedMotion': true }, apply: { animation: false } },
 * ]);
 * policy.bind(registry, watcher);
 * ```
 */
export function createSurfacePolicy(rules: readonly PolicyRule[]): SurfacePolicy {
  const changeHandlers = new Set<SurfacePolicyChangeHandler>();
  let currentSettings: PolicySettings = {};
  let currentProfile: Record<string, unknown> = {};

  function notifyIfChanged(next: PolicySettings): void {
    if (settingsEqual(currentSettings, next)) return;
    currentSettings = next;
    for (const h of changeHandlers) {
      try {
        h({ ...currentSettings });
      } catch {
        // Never let a subscriber crash the policy.
      }
    }
  }

  function onCapabilityChange(change: CapabilityChange): void {
    // Update the cached profile entry and re-evaluate.
    currentProfile = { ...currentProfile, [change.id]: change.next };
    notifyIfChanged(resolveSettings(rules, currentProfile));
  }

  const policy: SurfacePolicy = {
    evaluate(profile: Record<string, unknown>): PolicySettings {
      currentProfile = { ...profile };
      const next = resolveSettings(rules, currentProfile);
      notifyIfChanged(next);
      return { ...next };
    },

    bind(registry: CapabilityRegistry, watcher: CapabilityWatcher): () => void {
      // Kick off an immediate detection pass.
      void registry.detectAll().then((profile) => {
        currentProfile = profile;
        notifyIfChanged(resolveSettings(rules, currentProfile));
      });

      // Re-evaluate on every capability change.
      const unsub = watcher.subscribe(onCapabilityChange);
      return unsub;
    },

    current(): PolicySettings {
      return { ...currentSettings };
    },

    onChange(handler: SurfacePolicyChangeHandler): () => void {
      changeHandlers.add(handler);
      return () => {
        changeHandlers.delete(handler);
      };
    },
  };

  return policy;
}
