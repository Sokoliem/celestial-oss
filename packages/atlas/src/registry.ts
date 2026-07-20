/**
 * CapabilityRegistry — composable extension point for terminal capability detection.
 *
 * Apps and framework packages can register custom detectors alongside the
 * built-in atlas detectors. The registry resolves each detector independently
 * and returns a strongly-typed map of id → value.
 */

// ─── Public types ────────────────────────────────────────────────────────────

/** A single capability detector keyed by `id`. */
export interface CapabilityDetector<T> {
  /** Unique identifier; used as the key in the resolved profile map. */
  readonly id: string;
  /**
   * Detection function. May be sync or async. Receives the current env object
   * so callers can inject a synthetic env in tests without touching process.env.
   */
  detect: (env: NodeJS.ProcessEnv) => T | Promise<T>;
  /** Value to use when detection throws or the registry is bootstrapped. */
  readonly default: T;
}

/**
 * The resolved map returned by `detectAll`. Keys are detector ids; values are
 * whatever the detector resolved to (or its default on error).
 */
export type CapabilityProfile = Record<string, unknown>;

/** Options for `detectAll`. */
export interface DetectAllOptions {
  /** Env object to pass to each detector. Defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
}

// ─── Registry implementation ─────────────────────────────────────────────────

export interface CapabilityRegistry {
  /**
   * Register a new capability detector. If a detector with the same id is
   * already registered it is replaced.
   */
  register<T>(detector: CapabilityDetector<T>): void;

  /**
   * Remove a detector by id. No-op if not registered.
   */
  unregister(id: string): void;

  /**
   * Return the current list of registered detector ids.
   */
  ids(): readonly string[];

  /**
   * Run all registered detectors in parallel and return the resolved profile.
   * If a detector throws / rejects, its `default` value is used and the error
   * is silently swallowed (to keep boot resilient).
   */
  detectAll(options?: DetectAllOptions): Promise<CapabilityProfile>;

  /**
   * Run a single detector by id and return its value.
   * Returns the detector's `default` if the id is unknown or detection fails.
   */
  detect(id: string, options?: DetectAllOptions): Promise<unknown>;

  /**
   * Return the default value for a detector by id, or `undefined` if the id
   * is not registered.
   */
  getDefault(id: string): unknown;
}

function getProcessEnv(): NodeJS.ProcessEnv {
  return typeof process !== 'undefined' && process.env ? process.env : {};
}

function createRegistry(): CapabilityRegistry {
  // Preserve insertion order for deterministic `ids()` results.
  const detectors = new Map<string, CapabilityDetector<unknown>>();

  async function runOne(detector: CapabilityDetector<unknown>, env: NodeJS.ProcessEnv): Promise<unknown> {
    try {
      return await detector.detect(env);
    } catch {
      return detector.default;
    }
  }

  return {
    register<T>(detector: CapabilityDetector<T>): void {
      detectors.set(detector.id, detector as CapabilityDetector<unknown>);
    },

    unregister(id: string): void {
      detectors.delete(id);
    },

    ids(): readonly string[] {
      return Array.from(detectors.keys());
    },

    async detectAll(options?: DetectAllOptions): Promise<CapabilityProfile> {
      const env = options?.env ?? getProcessEnv();
      const entries = Array.from(detectors.entries());
      const values = await Promise.all(entries.map(([, d]) => runOne(d, env)));
      const profile: CapabilityProfile = {};
      for (let i = 0; i < entries.length; i++) {
        const id = entries[i]![0];
        profile[id] = values[i];
      }
      return profile;
    },

    async detect(id: string, options?: DetectAllOptions): Promise<unknown> {
      const detector = detectors.get(id);
      if (!detector) return undefined;
      const env = options?.env ?? getProcessEnv();
      return runOne(detector, env);
    },

    getDefault(id: string): unknown {
      return detectors.get(id)?.default;
    },
  };
}

// ─── Default registry ─────────────────────────────────────────────────────────

/**
 * The shared default registry. Built-in detectors are pre-registered here.
 * Apps can also call `createCapabilityRegistry()` for a private isolated registry.
 */
export let defaultRegistry: CapabilityRegistry;

/**
 * Create a new, independent `CapabilityRegistry`.
 *
 * @example
 * ```ts
 * const registry = createCapabilityRegistry();
 * registry.register({ id: 'hyperlinks', detect: detectHyperlinks, default: false });
 * const profile = await registry.detectAll(process.env);
 * ```
 */
export function createCapabilityRegistry(): CapabilityRegistry {
  return createRegistry();
}

// Lazily create the default registry so that built-in detector registration
// (which imports from this module) doesn't create circular init issues.
function getDefaultRegistry(): CapabilityRegistry {
  if (!defaultRegistry) {
    defaultRegistry = createRegistry();
    registerBuiltins(defaultRegistry);
  }
  return defaultRegistry;
}

// Re-export a getter so consumers don't hold a stale reference if the default
// registry is somehow reset in tests.
export function getDefaultCapabilityRegistry(): CapabilityRegistry {
  return getDefaultRegistry();
}

// ─── Built-in detectors ───────────────────────────────────────────────────────

import { detectCapabilities } from './detect.js';
import type { AtlasCapabilities } from './types.js';

/**
 * The built-in detectors that mirror the existing `detectCapabilities()` fields.
 * Each field becomes a first-class entry in the registry so that the watcher
 * can observe per-field changes without reimplementing detection logic.
 */
const BUILTIN_FIELDS: ReadonlyArray<keyof AtlasCapabilities> = [
  'colorLevel',
  'darkBackground',
  'reducedMotion',
  'unicodeLevel',
  'performanceClass',
  'hyperlinks',
  'kittyGraphics',
  'iterm2Images',
  'sixelGraphics',
  'syncOutput',
  'kittyKeyboard',
  'bracketedPaste',
  'focusEvents',
  'mouseTracking',
  'styledUnderlines',
  'undercurl',
  'overline',
  'cursorShapes',
  'terminalName',
  'surface',
  'unicodeVersion',
  'iterm2ImagesMultipart',
];

function registerBuiltins(registry: CapabilityRegistry): void {
  for (const field of BUILTIN_FIELDS) {
    const f = field; // capture for closure
    registry.register({
      id: `atlas.${f}`,
      detect: (env: NodeJS.ProcessEnv) => {
        const caps: AtlasCapabilities = detectCapabilities({ env });
        return caps[f] as unknown;
      },
      default: null,
    });
  }
}
