import type { ComponentNode, VNode } from '@celestial/core/nebula';
import { MAX_SPLIT_PANES, nonNegativeInteger } from './internal.js';

export type SplitterDirection = 'row' | 'column';

export interface SplitterPaneSpec<TId extends string = string> {
  readonly id: TId;
  readonly child: VNode;
  readonly weight?: number;
  readonly min?: number;
  readonly max?: number;
  readonly collapsible?: boolean;
  readonly collapsedSize?: number;
}

export interface SplitterPaneSnapshot<TId extends string = string> {
  readonly id: TId;
  readonly weight: number;
  readonly collapsed: boolean;
}

export interface SplitterSnapshot<TId extends string = string> {
  readonly version: 1;
  readonly panes: readonly SplitterPaneSnapshot<TId>[];
}

export interface SplitterController<TId extends string = string> {
  getWeight(id: TId): number;
  setWeight(id: TId, weight: number): void;
  setWeights(weights: Partial<Record<TId, number>>): void;
  isCollapsed(id: TId): boolean;
  setCollapsed(id: TId, collapsed: boolean): void;
  reset(): void;
  serialize(): SplitterSnapshot<TId>;
  hydrate(snapshot: SplitterSnapshot<TId>): void;
  subscribe(listener: () => void): () => void;
}

export interface HorizonSplitControllerOptions<TId extends string = string> {
  direction: SplitterDirection;
  panes: readonly SplitterPaneSpec<TId>[];
  controller?: SplitterController<TId>;
  handleSize?: number;
  idPrefix?: string;
}

export interface HorizonSplitController<TId extends string = string> {
  controller: SplitterController<TId>;
  render(options?: Partial<Pick<HorizonSplitControllerOptions<TId>, 'handleSize' | 'idPrefix'>>): ComponentNode;
  serialize(): SplitterSnapshot<TId>;
  hydrate(snapshot: SplitterSnapshot<TId>): void;
}

function normalizeWeights<TId extends string>(entries: readonly [TId, number][]): Map<TId, number> {
  const positive = entries.map(([id, weight]) => [id, Number.isFinite(weight) ? Math.max(0, weight) : 0] as [TId, number]);
  const total = positive.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) {
    const even = positive.length > 0 ? 1 / positive.length : 0;
    return new Map(positive.map(([id]) => [id, even]));
  }
  return new Map(positive.map(([id, weight]) => [id, weight / total]));
}

function createLocalSplitterController<TId extends string>(panes: readonly SplitterPaneSpec<TId>[]): SplitterController<TId> {
  const initial = normalizeWeights(panes.map((pane) => [pane.id, pane.weight ?? 1]));
  const knownIds = new Set(initial.keys());
  let weights = new Map(initial);
  let collapsed = new Set<TId>();
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // One observer cannot prevent the remaining layout subscribers from
        // receiving the same state transition.
      }
    }
  }

  return {
    getWeight: (id) => weights.get(id) ?? 0,
    setWeight: (id, weight) => {
      if (!knownIds.has(id)) return;
      weights = normalizeWeights([...weights.entries()].map(([entryId, value]) => [entryId, entryId === id ? weight : value]));
      notify();
    },
    setWeights: (nextWeights) => {
      weights = normalizeWeights([...weights.entries()].map(([id, value]) => [id, Object.hasOwn(nextWeights, id) ? (nextWeights[id] ?? value) : value]));
      notify();
    },
    isCollapsed: (id) => collapsed.has(id),
    setCollapsed: (id, nextCollapsed) => {
      if (!knownIds.has(id)) return;
      collapsed = new Set(collapsed);
      if (nextCollapsed) collapsed.add(id);
      else collapsed.delete(id);
      notify();
    },
    reset: () => {
      weights = new Map(initial);
      collapsed = new Set();
      notify();
    },
    serialize: () => ({
      version: 1,
      panes: [...weights.entries()].map(([id, weight]) => ({ id, weight, collapsed: collapsed.has(id) })),
    }),
    hydrate: (snapshot) => {
      if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.panes)) return;
      const incoming = new Map<TId, number>();
      const nextCollapsed = new Set<TId>();
      for (const pane of snapshot.panes.slice(0, MAX_SPLIT_PANES)) {
        if (!pane || !knownIds.has(pane.id) || incoming.has(pane.id)) continue;
        incoming.set(pane.id, pane.weight);
        if (pane.collapsed) nextCollapsed.add(pane.id);
      }
      weights = normalizeWeights([...initial.keys()].map((id) => [id, incoming.get(id) ?? weights.get(id) ?? initial.get(id) ?? 0]));
      collapsed = nextCollapsed;
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function distribute(axisSize: number, panes: readonly SplitterPaneSpec[], controller: SplitterController): number[] {
  const budget = nonNegativeInteger(axisSize);
  const totalWeight = panes.reduce((sum, pane) => {
    const weight = controller.getWeight(pane.id);
    return sum + (controller.isCollapsed(pane.id) || !Number.isFinite(weight) ? 0 : Math.max(0, weight));
  }, 0);
  if (totalWeight <= 0) {
    return fitToBudget(
      panes.map((pane) => nonNegativeInteger(pane.collapsedSize ?? pane.min)),
      budget,
    );
  }
  return fitToBudget(
    panes.map((pane) => {
      const min = nonNegativeInteger(pane.min);
      const max = pane.max === undefined || pane.max === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : Math.max(min, nonNegativeInteger(pane.max, min));
      if (controller.isCollapsed(pane.id)) return nonNegativeInteger(pane.collapsedSize ?? pane.min);
      const weight = controller.getWeight(pane.id);
      const raw = Math.floor(((Number.isFinite(weight) ? Math.max(0, weight) : 0) / totalWeight) * budget);
      return Math.max(min, Math.min(max, raw));
    }),
    budget,
  );
}

function fitToBudget(sizes: number[], budget: number): number[] {
  const fitted = sizes.map((size) => nonNegativeInteger(size));
  let overflow = fitted.reduce((sum, size) => sum + size, 0) - budget;
  for (let index = fitted.length - 1; index >= 0 && overflow > 0; index--) {
    const reduction = Math.min(fitted[index]!, overflow);
    fitted[index] = fitted[index]! - reduction;
    overflow -= reduction;
  }
  return fitted;
}

function paneBox(child: VNode, direction: SplitterDirection, size: number): VNode {
  if (direction === 'row') {
    return { kind: 'box', width: size, overflow: 'hidden', children: [child] };
  }
  return { kind: 'box', height: size, overflow: 'hidden', children: [child] };
}

function handle(
  idPrefix: string,
  direction: SplitterDirection,
  leadingPaneId: string,
  trailingPaneId: string,
  handleSize: number,
  seamPosition: number,
): VNode {
  return {
    kind: 'event',
    id: `${idPrefix}:${leadingPaneId}:handle`,
    child: direction === 'row' ? { kind: 'box', width: handleSize, children: [] } : { kind: 'box', height: handleSize, children: [] },
    handlers: { onMouseDown: `${idPrefix}:${leadingPaneId}:resize-start` },
    metadata: {
      intent: 'drag',
      affordances: ['drag'],
      cursor: direction === 'row' ? 'ew-resize' : 'ns-resize',
      extra: {
        splitter: true,
        direction,
        leadingPaneId,
        trailingPaneId,
        seamPosition,
        handleSize,
      },
    },
  };
}

export function createHorizonSplitController<TId extends string = string>(options: HorizonSplitControllerOptions<TId>): HorizonSplitController<TId> {
  if (options.panes.length > MAX_SPLIT_PANES) throw new RangeError(`horizon/splitController: panes cannot exceed ${MAX_SPLIT_PANES}`);
  const panes = options.panes.map((pane) => ({ ...pane }));
  const ids = new Set<string>();
  for (const pane of panes) {
    if (typeof pane.id !== 'string' || pane.id.length === 0) throw new Error('horizon/splitController: pane ids cannot be empty');
    if (ids.has(pane.id)) throw new Error(`horizon/splitController: duplicate pane id "${pane.id}"`);
    ids.add(pane.id);
  }
  const direction: SplitterDirection = options.direction === 'column' ? 'column' : 'row';
  const controller = options.controller ?? createLocalSplitterController(panes);
  return {
    controller,
    render: (overrides = {}) => {
      const requestedHandleSize = nonNegativeInteger(overrides.handleSize ?? options.handleSize, 1);
      const idPrefix = overrides.idPrefix || options.idPrefix || 'horizon-split';
      return {
        kind: 'component',
        render: (context): VNode => {
          const axisSize = nonNegativeInteger(
            direction === 'row'
              ? (context?.container?.cols ?? context?.available?.cols ?? context?.terminal?.cols ?? 80)
              : (context?.container?.rows ?? context?.available?.rows ?? context?.terminal?.rows ?? 24),
          );
          const handleCount = Math.max(0, panes.length - 1);
          const handleSize = handleCount > 0 ? Math.min(requestedHandleSize, Math.floor(axisSize / handleCount)) : 0;
          const sizes = distribute(Math.max(0, axisSize - handleSize * handleCount), panes, controller);
          const children: VNode[] = [];
          let seam = 0;
          for (let index = 0; index < panes.length; index++) {
            const pane = panes[index]!;
            const size = sizes[index] ?? 0;
            children.push(paneBox(pane.child, direction, size));
            seam += size;
            const next = panes[index + 1];
            if (next && handleSize > 0) {
              children.push(handle(idPrefix, direction, pane.id, next.id, handleSize, seam));
              seam += handleSize;
            }
          }
          return { kind: direction, children } as VNode;
        },
      };
    },
    serialize: () => controller.serialize(),
    hydrate: (snapshot) => controller.hydrate(snapshot),
  };
}

export function splitPaneFromController<TId extends string = string>(options: HorizonSplitControllerOptions<TId>): ComponentNode {
  return createHorizonSplitController(options).render();
}
