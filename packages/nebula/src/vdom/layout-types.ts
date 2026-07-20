/**
 * Extracted from ../vdom.ts. Behavior-preserving split.
 */

import type { VNode } from './nodes.js';
import type { LayoutSpace, ResolvedStyleAttrs } from './style.js';

// --- Layout Plan Types ---

/** A positioned rectangle in terminal coordinates */
export interface LayoutRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A single entry in the layout plan — a VNode with its computed position */
export interface LayoutEntry {
  readonly id: string;
  readonly node: VNode;
  readonly rect: LayoutRect;
  readonly children: LayoutEntry[];
  readonly resolvedStyle?: ResolvedStyleAttrs;
  readonly available?: LayoutSpace;
  readonly fingerprint?: string;
  readonly reused?: boolean;
}

/** A collected overlay entry in the layout plan */
export interface OverlayEntry {
  readonly zIndex: number;
  readonly entry: LayoutEntry;
  readonly transparent: boolean;
}

export interface LayoutTraceEntry {
  readonly phase: 'plan' | 'reuse';
  readonly nodeKind: VNode['kind'];
  readonly id: string;
  readonly layoutId?: string;
  readonly rect: LayoutRect;
  readonly available: LayoutSpace;
  readonly details?: Record<string, number | string | boolean | null | readonly string[]>;
}

export interface LayoutPlanStats {
  readonly plannedEntries: number;
  readonly reusedEntries: number;
}

export interface LayoutPlanOptions {
  readonly previousPlan?: LayoutPlan;
  readonly trace?: boolean;
}

/** The result of planLayout — a tree of positioned entries with an index */
export interface LayoutPlan {
  readonly root: LayoutEntry;
  readonly index: Map<string, LayoutEntry>;
  readonly width: number;
  readonly height: number;
  /** Overlay entries sorted by zIndex ascending (lowest first) */
  readonly overlays: OverlayEntry[];
  readonly trace?: readonly LayoutTraceEntry[];
  readonly stats?: LayoutPlanStats;
}
