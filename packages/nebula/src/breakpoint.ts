/**
 * Nebula Breakpoint Context — shared responsive state via signals
 *
 * Provides a reactive breakpoint system that tracks terminal dimensions
 * and exposes the current breakpoint name as a signal. Can be used
 * standalone or as a plugin that auto-updates on terminal resize.
 */

import type { AppConfig } from './app.js';
import type { Plugin } from './plugin.js';
import { batch, computed, type Signal, signal } from './signals.js';
import { Cmd, Sub } from './types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type BreakpointName = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface BreakpointThresholds {
  sm: number; // default 40
  md: number; // default 80
  lg: number; // default 120
  xl: number; // default 160
}

export interface BreakpointContext {
  /** Current breakpoint name as a computed signal. */
  readonly current: Signal<BreakpointName>;
  /** Current terminal dimensions as a signal. */
  readonly size: Signal<{ cols: number; rows: number }>;
  /** Returns a computed signal that is true when the current breakpoint >= the given name. */
  isAtLeast(name: BreakpointName): Signal<boolean>;
  /** Update the terminal dimensions (triggers reactive updates). */
  update(cols: number, rows: number): void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const DEFAULT_THRESHOLDS: BreakpointThresholds = {
  sm: 40,
  md: 80,
  lg: 120,
  xl: 160,
};

/** Ordered breakpoint names for comparison. */
const BP_ORDER: BreakpointName[] = ['xs', 'sm', 'md', 'lg', 'xl'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function resolveBreakpoint(cols: number, thresholds: BreakpointThresholds): BreakpointName {
  if (cols >= thresholds.xl) return 'xl';
  if (cols >= thresholds.lg) return 'lg';
  if (cols >= thresholds.md) return 'md';
  if (cols >= thresholds.sm) return 'sm';
  return 'xs';
}

function bpIndex(name: BreakpointName): number {
  return BP_ORDER.indexOf(name);
}

// ─── createBreakpointContext ─────────────────────────────────────────────────

/**
 * Create a reactive breakpoint context.
 * Defaults to 80x24 initial size (standard terminal).
 */
export function createBreakpointContext(thresholds?: BreakpointThresholds): BreakpointContext {
  const t = thresholds ?? DEFAULT_THRESHOLDS;
  const initialCols = 80;
  const initialRows = 24;

  const [cols, setCols] = signal(initialCols);
  const [rows, setRows] = signal(initialRows);

  const size = computed(() => ({ cols: cols(), rows: rows() }));

  const current = computed(() => resolveBreakpoint(cols(), t));

  function isAtLeast(name: BreakpointName): Signal<boolean> {
    const targetIdx = bpIndex(name);
    return computed(() => bpIndex(current()) >= targetIdx);
  }

  function update(newCols: number, newRows: number): void {
    batch(() => {
      setCols(newCols);
      setRows(newRows);
    });
  }

  return {
    current,
    size,
    isAtLeast,
    update,
  };
}

// ─── breakpointPlugin ────────────────────────────────────────────────────────

export interface BreakpointPlugin<Model, M> extends Plugin<Model, M> {
  /** The breakpoint context managed by this plugin. */
  readonly context: BreakpointContext;
}

/**
 * Create a plugin that manages a breakpoint context and auto-updates
 * it when the terminal is resized (via Sub.resize).
 */
export function breakpointPlugin<Model = unknown, M = unknown>(thresholds?: BreakpointThresholds): BreakpointPlugin<Model, M> {
  const context = createBreakpointContext(thresholds);

  return {
    name: 'breakpoint',
    context,
    wrap(config: AppConfig<Model, M>): AppConfig<Model, M> {
      // Sentinel value used to identify internal resize messages.
      // This avoids leaking `undefined` into the caller's update function.
      const RESIZE_SENTINEL = { __breakpointResize: true } as unknown as M;

      return {
        ...config,
        update(msg: M, model: Model): [Model, Cmd<M>] {
          // Intercept and discard our internal resize sentinel
          if (msg !== null && msg !== undefined && typeof msg === 'object' && '__breakpointResize' in (msg as Record<string, unknown>)) {
            return [model, Cmd.none<M>()];
          }
          return config.update(msg, model);
        },
        subscriptions(model: Model) {
          const original = config.subscriptions(model);
          const resizeSub = Sub.resize((cols: number, rows: number) => {
            context.update(cols, rows);
            return RESIZE_SENTINEL;
          });
          return Sub.batch(original, resizeSub);
        },
      };
    },
  };
}
