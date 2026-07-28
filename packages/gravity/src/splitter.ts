import { event } from '@celestial/nebula';
import { resolveRuntimeMeasurementContext } from './runtime.js';
import type { SplitterController, SplitterPaneSnapshot, SplitterSnapshot } from './splitter-controller-types.js';
import type { SplitterPersistence } from './splitter-persistence.js';
import type { ComponentNode, VNode } from './types.js';
import { resolveWeightedStack } from './weighted-stack.js';

export type {
  SplitterController,
  SplitterPaneSnapshot,
  SplitterSnapshot,
} from './splitter-controller-types.js';

export type SplitterDirection = 'row' | 'column';

export interface SplitterPaneSpec<TId extends string = string> {
  readonly id: TId;
  readonly child: VNode;
  /** Initial weight (0..1). Renormalized across panes; defaults distribute evenly. */
  readonly weight?: number;
  /** Minimum size in cells along the splitter axis. */
  readonly min?: number;
  /** Maximum size in cells along the splitter axis. */
  readonly max?: number;
  /** Allow snap-to-collapse when the pane shrinks below `snapThreshold`. */
  readonly collapsible?: boolean;
  /** Size shown when this pane is collapsed. Defaults to `min` or 0. */
  readonly collapsedSize?: number;
}

export interface SplitterHandleStyle {
  /** Glyph used by the host renderer in the idle/hover/active states. */
  readonly idle: string;
  readonly hover: string;
  readonly active: string;
}

export const DEFAULT_VERTICAL_HANDLE_STYLE: SplitterHandleStyle = {
  idle: '│',
  hover: '┃',
  active: '║',
};

export const DEFAULT_HORIZONTAL_HANDLE_STYLE: SplitterHandleStyle = {
  idle: '─',
  hover: '━',
  active: '═',
};

export interface SplitterOptions<TId extends string = string> {
  readonly direction: SplitterDirection;
  readonly panes: readonly SplitterPaneSpec<TId>[];
  readonly controller?: SplitterController<TId>;
  /** Cells reserved for each handle between panes. Defaults to 1. */
  readonly handleSize?: number;
  /** Below this weight a collapsible pane snaps closed. Defaults to 0.15. */
  readonly snapThreshold?: number;
  /** Glyphs used by hosts that read handle style off the emitted region. */
  readonly handleStyle?: SplitterHandleStyle;
  /** Stable id prefix for emitted handle hit-regions. Defaults to `splitter`. */
  readonly idPrefix?: string;
}

export interface SplitterControllerOptions<TId extends string = string> {
  readonly panes: readonly SplitterPaneSpec<TId>[];
  readonly snapThreshold?: number;
  /**
   * Optional persistence adapter. When supplied, the controller calls
   * `load()` once at construction (hydrating any saved snapshot) and
   * `save()` after every state change. See `splitter-persistence.ts` for
   * built-in `memoryPersistence` and `localStoragePersistence` adapters.
   */
  readonly persistence?: SplitterPersistence<TId>;
}

const DEFAULT_SNAP_THRESHOLD = 0.15;
const MAX_SPLITTER_PANES = 1_000;

interface ControllerState<TId extends string> {
  readonly weights: Map<TId, number>;
  readonly collapsed: Set<TId>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function initialWeights<TId extends string>(panes: readonly SplitterPaneSpec<TId>[]): Map<TId, number> {
  const ids = panes.map((pane) => pane.id);
  const declared = panes.map((pane) => (Number.isFinite(pane.weight) && pane.weight! > 0 ? pane.weight! : 0));
  const total = declared.reduce((sum, value) => sum + value, 0);

  if (total <= 0) {
    const even = panes.length > 0 ? 1 / panes.length : 0;
    return new Map(ids.map((id) => [id, even]));
  }

  return new Map(ids.map((id, index) => [id, (declared[index] ?? 0) / total]));
}

function normalizeWeights<TId extends string>(weights: Map<TId, number>): Map<TId, number> {
  const ids = [...weights.keys()];
  const positive = ids.map((id) => Math.max(0, weights.get(id) ?? 0));
  const total = positive.reduce((sum, value) => sum + value, 0);

  if (total <= 0) {
    const even = ids.length > 0 ? 1 / ids.length : 0;
    return new Map(ids.map((id) => [id, even]));
  }

  return new Map(ids.map((id, index) => [id, (positive[index] ?? 0) / total]));
}

export function createSplitterController<TId extends string = string>(options: SplitterControllerOptions<TId>): SplitterController<TId> {
  validatePaneSpecs(options.panes);
  const initial = initialWeights(options.panes);
  const initialCollapsed = new Set<TId>(options.panes.filter((pane) => pane.collapsible && (pane.weight ?? 1) <= 0).map((pane) => pane.id));
  const snapThreshold = Number.isFinite(options.snapThreshold) ? clamp(options.snapThreshold!, 0, 1) : DEFAULT_SNAP_THRESHOLD;
  const collapsibleIds = new Set<TId>(options.panes.filter((pane) => pane.collapsible).map((pane) => pane.id));
  const knownIds = new Set<TId>(options.panes.map((pane) => pane.id));

  let state: ControllerState<TId> = {
    weights: new Map(initial),
    collapsed: new Set(initialCollapsed),
  };

  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // listeners must not throw during notify; ignore so siblings still fire
      }
    }
  }

  function applyCollapseRules(weights: Map<TId, number>): { weights: Map<TId, number>; collapsed: Set<TId> } {
    const collapsed = new Set<TId>();
    const adjusted = new Map<TId, number>(weights);

    for (const id of collapsibleIds) {
      const value = adjusted.get(id) ?? 0;
      if (value < snapThreshold) {
        collapsed.add(id);
        adjusted.set(id, 0);
      }
    }

    return { weights: normalizeWeights(adjusted), collapsed };
  }

  function commit(weights: Map<TId, number>, forceCollapsed?: Set<TId>): void {
    const next = forceCollapsed ? { weights: normalizeWeights(weights), collapsed: forceCollapsed } : applyCollapseRules(weights);
    state = next;
    persist();
    notify();
  }

  function snapshotNow(): SplitterSnapshot<TId> {
    const panes: SplitterPaneSnapshot<TId>[] = [...state.weights.entries()].map(([id, weight]) => ({
      id,
      weight,
      collapsed: state.collapsed.has(id),
    }));
    return { version: 1, panes };
  }

  function persist(): void {
    if (!options.persistence) return;
    try {
      options.persistence.save(snapshotNow());
    } catch {
      // Persistence is best-effort; never let storage errors break state updates.
    }
  }

  const controller: SplitterController<TId> = {
    getWeight(id) {
      return state.weights.get(id) ?? 0;
    },
    setWeight(id, weight) {
      if (!knownIds.has(id) || !Number.isFinite(weight)) return;
      const target = clamp(weight, 0, 1);
      if (Math.abs((state.weights.get(id) ?? 0) - target) <= Number.EPSILON) return;
      const next = new Map(state.weights);
      // Treat `target` as the desired absolute share of 1. Rescale all OTHER
      // panes proportionally so total = 1. If others sum to 0, distribute
      // the remainder evenly across them.
      const otherIds = [...next.keys()].filter((other) => other !== id);
      const otherSum = otherIds.reduce((sum, other) => sum + (next.get(other) ?? 0), 0);
      const remainder = Math.max(0, 1 - target);

      next.set(id, target);
      if (otherIds.length > 0) {
        if (otherSum > 0) {
          const scale = remainder / otherSum;
          for (const other of otherIds) {
            next.set(other, (next.get(other) ?? 0) * scale);
          }
        } else {
          const even = remainder / otherIds.length;
          for (const other of otherIds) {
            next.set(other, even);
          }
        }
      }
      commit(next);
    },
    setWeights(weights) {
      const next = new Map(state.weights);
      let changed = false;
      for (const [id, value] of Object.entries(weights) as Array<[TId, number]>) {
        if (!knownIds.has(id) || !Number.isFinite(value)) continue;
        const target = clamp(value, 0, 1);
        if (Math.abs((next.get(id) ?? 0) - target) <= Number.EPSILON) continue;
        next.set(id, target);
        changed = true;
      }
      if (!changed) return;
      commit(next);
    },
    isCollapsed(id) {
      return state.collapsed.has(id);
    },
    setCollapsed(id, collapsed) {
      if (!knownIds.has(id) || (collapsed && !collapsibleIds.has(id))) return;
      if (state.collapsed.has(id) === collapsed) return;
      const collapseSet = new Set(state.collapsed);
      const next = new Map(state.weights);
      if (collapsed) {
        collapseSet.add(id);
        next.set(id, 0);
      } else {
        collapseSet.delete(id);
        const weight = next.get(id) ?? 0;
        if (weight <= 0) {
          next.set(id, snapThreshold);
        }
      }
      commit(next, collapseSet);
    },
    reset() {
      state = {
        weights: new Map(initial),
        collapsed: new Set(initialCollapsed),
      };
      persist();
      notify();
    },
    serialize: snapshotNow,
    hydrate(snapshot) {
      if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.panes)) return;
      const next = new Map(state.weights);
      const collapseSet = new Set<TId>(state.collapsed);
      const seen = new Set<TId>();
      let changed = false;
      for (const pane of snapshot.panes.slice(0, MAX_SPLITTER_PANES)) {
        if (!pane || typeof pane.id !== 'string' || !knownIds.has(pane.id) || seen.has(pane.id) || !Number.isFinite(pane.weight)) continue;
        seen.add(pane.id);
        const weight = clamp(pane.weight, 0, 1);
        changed = changed || Math.abs((next.get(pane.id) ?? 0) - weight) > Number.EPSILON;
        next.set(pane.id, weight);
        if (collapsibleIds.has(pane.id)) {
          const shouldCollapse = pane.collapsed === true;
          changed = changed || collapseSet.has(pane.id) !== shouldCollapse;
          if (shouldCollapse) collapseSet.add(pane.id);
          else collapseSet.delete(pane.id);
        }
      }
      if (!changed) return;
      commit(next, collapseSet);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  // Hydrate from persistence (if any) before returning. Restore is silent on
  // bad/missing data — `load()` returns null and we keep the initial state.
  if (options.persistence) {
    try {
      const restored = options.persistence.load();
      if (restored) {
        controller.hydrate(restored);
      }
    } catch {
      // Bad payload or storage unavailable — start fresh.
    }
  }

  return controller;
}

function makeHandleStyle(direction: SplitterDirection, override?: SplitterHandleStyle): SplitterHandleStyle {
  if (override) return override;
  return direction === 'row' ? DEFAULT_VERTICAL_HANDLE_STYLE : DEFAULT_HORIZONTAL_HANDLE_STYLE;
}

function paneSize(pane: SplitterPaneSpec): { min: number; max: number; collapsedSize: number } {
  const min = Math.max(0, pane.min ?? 0);
  const max = pane.max ?? Number.POSITIVE_INFINITY;
  const collapsedSize = Math.max(0, pane.collapsedSize ?? 0);
  return { min, max, collapsedSize };
}

function validatePaneSpecs<TId extends string>(panes: readonly SplitterPaneSpec<TId>[]): void {
  if (panes.length > MAX_SPLITTER_PANES) throw new RangeError(`Splitter supports at most ${MAX_SPLITTER_PANES} panes.`);
  const ids = new Set<string>();
  for (const pane of panes) {
    if (typeof pane.id !== 'string' || pane.id.length === 0 || pane.id.length > 512) throw new TypeError('Splitter pane ids must contain 1-512 characters.');
    if (ids.has(pane.id)) throw new Error(`Duplicate splitter pane id "${pane.id}".`);
    ids.add(pane.id);
    if (pane.min !== undefined && (!Number.isFinite(pane.min) || pane.min < 0)) throw new RangeError(`Splitter pane "${pane.id}" has an invalid minimum.`);
    if (pane.max !== undefined && (!Number.isFinite(pane.max) || pane.max < 0)) throw new RangeError(`Splitter pane "${pane.id}" has an invalid maximum.`);
    if (pane.min !== undefined && pane.max !== undefined && pane.max < pane.min) {
      throw new RangeError(`Splitter pane "${pane.id}" maximum cannot be smaller than its minimum.`);
    }
  }
}

export interface SplitterSeamResize<TId extends string = string> {
  readonly leadingPaneId: TId;
  readonly trailingPaneId: TId;
  /** Total distributable pane cells, excluding handle cells. */
  readonly axisSize: number;
  /** Desired leading-pane size in cells. */
  readonly leadingSize: number;
}

export interface SplitterSeamResizeResult<TId extends string = string> {
  readonly changed: boolean;
  readonly leadingPaneId: TId;
  readonly trailingPaneId: TId;
  readonly leadingSize: number;
  readonly trailingSize: number;
  readonly cursor: 'ew-resize' | 'ns-resize';
}

/**
 * Resize one adjacent splitter seam without disturbing the total weight owned
 * by that pane pair. Min/max constraints on both panes are applied together.
 */
export function resizeSplitterSeam<TId extends string>(
  controller: SplitterController<TId>,
  panes: readonly SplitterPaneSpec<TId>[],
  direction: SplitterDirection,
  request: SplitterSeamResize<TId>,
): SplitterSeamResizeResult<TId> {
  validatePaneSpecs(panes);
  const leadingIndex = panes.findIndex((pane) => pane.id === request.leadingPaneId);
  const trailingIndex = panes.findIndex((pane) => pane.id === request.trailingPaneId);
  if (leadingIndex < 0 || trailingIndex !== leadingIndex + 1) throw new Error('Splitter seam panes must exist and be adjacent in leading/trailing order.');

  const axisSize = Math.max(1, Number.isFinite(request.axisSize) ? Math.trunc(request.axisSize) : 1);
  const leadingPane = panes[leadingIndex]!;
  const trailingPane = panes[trailingIndex]!;
  const leadingWeight = Math.max(0, controller.getWeight(leadingPane.id));
  const trailingWeight = Math.max(0, controller.getWeight(trailingPane.id));
  const pairWeight = leadingWeight + trailingWeight;
  if (pairWeight <= Number.EPSILON) {
    return {
      changed: false,
      leadingPaneId: leadingPane.id,
      trailingPaneId: trailingPane.id,
      leadingSize: 0,
      trailingSize: 0,
      cursor: direction === 'row' ? 'ew-resize' : 'ns-resize',
    };
  }
  const safePairWeight = pairWeight;
  const pairSize = Math.max(1, Math.round(axisSize * safePairWeight));
  const leadingBounds = paneSize(leadingPane);
  const trailingBounds = paneSize(trailingPane);
  const minimumLeading = Math.max(0, leadingBounds.min, pairSize - (Number.isFinite(trailingBounds.max) ? trailingBounds.max : pairSize));
  const maximumLeading = Math.max(minimumLeading, Math.min(leadingBounds.max, pairSize - trailingBounds.min));
  const requested = Number.isFinite(request.leadingSize) ? Math.trunc(request.leadingSize) : Math.round(pairSize * (leadingWeight / Math.max(pairWeight, Number.EPSILON)));
  const leadingSize = clamp(requested, minimumLeading, maximumLeading);
  const trailingSize = Math.max(0, pairSize - leadingSize);
  const nextLeadingWeight = safePairWeight * (leadingSize / pairSize);
  const nextTrailingWeight = safePairWeight - nextLeadingWeight;
  const changed = Math.abs(nextLeadingWeight - leadingWeight) > Number.EPSILON || Math.abs(nextTrailingWeight - trailingWeight) > Number.EPSILON;
  if (changed) {
    controller.setWeights({
      [leadingPane.id]: nextLeadingWeight,
      [trailingPane.id]: nextTrailingWeight,
    } as Readonly<Record<TId, number>>);
  }
  return {
    changed,
    leadingPaneId: leadingPane.id,
    trailingPaneId: trailingPane.id,
    leadingSize,
    trailingSize,
    cursor: direction === 'row' ? 'ew-resize' : 'ns-resize',
  };
}

export interface SplitterHandleRegionMetadata {
  readonly intent: 'drag';
  readonly affordances: readonly ['drag', 'resize'];
  readonly cursor: 'ew-resize' | 'ns-resize';
  readonly extra: {
    readonly splitter: true;
    readonly direction: SplitterDirection;
    readonly leadingPaneId: string;
    readonly trailingPaneId: string;
    readonly handleStyle: SplitterHandleStyle;
    readonly seamPosition: number;
    readonly handleSize: number;
  };
}

export function splitter<TId extends string = string>(options: SplitterOptions<TId>): ComponentNode {
  validatePaneSpecs(options.panes);
  const direction = options.direction;
  const handleSize = Number.isFinite(options.handleSize) ? Math.max(0, Math.trunc(options.handleSize!)) : 1;
  const handleStyle = makeHandleStyle(direction, options.handleStyle);
  const idPrefix = options.idPrefix ?? 'splitter';
  const snapThreshold = options.snapThreshold ?? DEFAULT_SNAP_THRESHOLD;
  const controller = options.controller ?? createSplitterController({ panes: options.panes, snapThreshold });

  return {
    kind: 'component',
    render: (renderContext): VNode => {
      const measurementContext = resolveRuntimeMeasurementContext(renderContext);
      const axisSize = direction === 'row' ? measurementContext.container.cols : measurementContext.container.rows;
      const crossSize = direction === 'row' ? measurementContext.container.rows : measurementContext.container.cols;

      if (options.panes.length === 0) {
        return { kind: 'empty' };
      }

      const items = options.panes.map((pane) => {
        const sizing = paneSize(pane);
        const collapsed = controller.isCollapsed(pane.id);
        return {
          id: pane.id,
          weight: controller.getWeight(pane.id),
          minSize: collapsed ? 0 : sizing.min,
          maxSize: sizing.max,
          collapsed,
          collapsedSize: collapsed ? sizing.collapsedSize : 0,
        };
      });

      const handleCount = Math.max(0, options.panes.length - 1);
      const handleAllowance = handleSize * handleCount;
      const distributable = Math.max(0, axisSize - handleAllowance);

      const layout = resolveWeightedStack({ items, size: distributable, gap: 0, minItemSize: 0 });

      const children: VNode[] = [];
      let cursor = 0;
      for (let index = 0; index < options.panes.length; index++) {
        const pane = options.panes[index]!;
        const entry = layout.entries[index]!;
        const size = Math.max(0, entry.size);

        children.push(wrapPaneNode(pane.child, direction, size, crossSize));
        cursor += size;

        if (index < options.panes.length - 1 && handleSize > 0) {
          const seamPosition = cursor;
          const next = options.panes[index + 1]!;
          children.push(buildHandleRegion(idPrefix, direction, handleSize, crossSize, pane.id, next.id, handleStyle, seamPosition));
          cursor += handleSize;
        }
      }

      if (direction === 'row') {
        return { kind: 'row', children };
      }
      return { kind: 'column', children };
    },
  };
}

function wrapPaneNode(child: VNode, direction: SplitterDirection, size: number, crossSize: number): VNode {
  if (direction === 'row') {
    return {
      kind: 'box',
      width: size,
      height: crossSize,
      overflow: 'hidden',
      children: [child],
    };
  }
  return {
    kind: 'box',
    width: crossSize,
    height: size,
    overflow: 'hidden',
    children: [child],
  };
}

function buildHandleRegion(
  idPrefix: string,
  direction: SplitterDirection,
  handleSize: number,
  crossSize: number,
  leadingPaneId: string,
  trailingPaneId: string,
  handleStyle: SplitterHandleStyle,
  seamPosition: number,
): VNode {
  const cursor: 'ew-resize' | 'ns-resize' = direction === 'row' ? 'ew-resize' : 'ns-resize';
  const child: VNode =
    direction === 'row'
      ? {
          kind: 'box',
          width: handleSize,
          height: crossSize,
          overflow: 'hidden',
          children: [],
        }
      : {
          kind: 'box',
          width: crossSize,
          height: handleSize,
          overflow: 'hidden',
          children: [],
        };

  return event(
    `${idPrefix}:${leadingPaneId}:handle`,
    child,
    { onMouseDown: `${idPrefix}:${leadingPaneId}:resize-start` },
    {
      intent: 'drag',
      affordances: ['drag', 'resize'],
      cursor,
      keyboardHint: direction === 'row' ? 'Alt+Left/Right' : 'Alt+Up/Down',
      extra: {
        splitter: true,
        direction,
        leadingPaneId,
        trailingPaneId,
        handleStyle,
        seamPosition,
        handleSize,
      },
    },
  );
}
