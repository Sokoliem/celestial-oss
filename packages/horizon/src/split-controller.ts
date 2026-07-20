import type { ComponentNode, VNode } from '@celestial/core/nebula';

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
  const positive = entries.map(([id, weight]) => [id, Math.max(0, weight)] as [TId, number]);
  const total = positive.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) {
    const even = positive.length > 0 ? 1 / positive.length : 0;
    return new Map(positive.map(([id]) => [id, even]));
  }
  return new Map(positive.map(([id, weight]) => [id, weight / total]));
}

function createLocalSplitterController<TId extends string>(panes: readonly SplitterPaneSpec<TId>[]): SplitterController<TId> {
  const initial = normalizeWeights(panes.map((pane) => [pane.id, pane.weight ?? 1]));
  let weights = new Map(initial);
  let collapsed = new Set<TId>();
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) listener();
  }

  return {
    getWeight: (id) => weights.get(id) ?? 0,
    setWeight: (id, weight) => {
      weights = normalizeWeights([...weights.entries()].map(([entryId, value]) => [entryId, entryId === id ? weight : value]));
      notify();
    },
    setWeights: (nextWeights) => {
      weights = normalizeWeights([...weights.entries()].map(([id, value]) => [id, nextWeights[id] ?? value]));
      notify();
    },
    isCollapsed: (id) => collapsed.has(id),
    setCollapsed: (id, nextCollapsed) => {
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
      if (snapshot.version !== 1) return;
      weights = normalizeWeights(snapshot.panes.map((pane) => [pane.id, pane.weight]));
      collapsed = new Set(snapshot.panes.filter((pane) => pane.collapsed).map((pane) => pane.id));
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function distribute(axisSize: number, panes: readonly SplitterPaneSpec[], controller: SplitterController): number[] {
  const totalWeight = panes.reduce((sum, pane) => sum + (controller.isCollapsed(pane.id) ? 0 : controller.getWeight(pane.id)), 0);
  if (totalWeight <= 0) {
    return panes.map((pane) => pane.collapsedSize ?? pane.min ?? 0);
  }
  return panes.map((pane) => {
    if (controller.isCollapsed(pane.id)) return pane.collapsedSize ?? pane.min ?? 0;
    const raw = Math.floor((controller.getWeight(pane.id) / totalWeight) * axisSize);
    return Math.max(pane.min ?? 0, Math.min(pane.max ?? Number.POSITIVE_INFINITY, raw));
  });
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
    handlers: {},
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
  const controller = options.controller ?? createLocalSplitterController(options.panes);
  return {
    controller,
    render: (overrides = {}) => {
      const handleSize = Math.max(0, overrides.handleSize ?? options.handleSize ?? 1);
      const idPrefix = overrides.idPrefix ?? options.idPrefix ?? 'horizon-split';
      return {
        kind: 'component',
        render: (context): VNode => {
          const axisSize =
            options.direction === 'row'
              ? (context?.container?.cols ?? context?.available?.cols ?? context?.terminal?.cols ?? 80)
              : (context?.container?.rows ?? context?.available?.rows ?? context?.terminal?.rows ?? 24);
          const sizes = distribute(Math.max(0, axisSize - handleSize * Math.max(0, options.panes.length - 1)), options.panes, controller);
          const children: VNode[] = [];
          let seam = 0;
          for (let index = 0; index < options.panes.length; index++) {
            const pane = options.panes[index]!;
            const size = sizes[index] ?? 0;
            children.push(paneBox(pane.child, options.direction, size));
            seam += size;
            const next = options.panes[index + 1];
            if (next && handleSize > 0) {
              children.push(handle(idPrefix, options.direction, pane.id, next.id, handleSize, seam));
              seam += handleSize;
            }
          }
          return { kind: options.direction, children } as VNode;
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
