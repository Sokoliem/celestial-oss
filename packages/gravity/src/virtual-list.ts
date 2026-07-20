import { generateSnapPoints, virtualList as nebulaVirtualList, type Signal, type SnapPoint, snapToNearest, type VNode } from '@celestial/nebula';
import { createMeasureCache, type MeasureCache } from './measure-cache.js';
import type { ComponentNode } from './types.js';

/**
 * Snap behavior for `virtualList`. When set, calls to
 * `controller.setOffset(value)` round to the nearest item boundary
 * (`'item'`) or to the nearest viewport-page boundary (`'page'`). Snap
 * uses nebula's `snapToNearest` against snap points generated from the
 * latest measured offsets.
 */
export type VirtualListSnap = 'item' | 'page' | false;

export interface VirtualListOptions<T> {
  /** Items to render. Accepts a `Signal<readonly T[]>` for reactive updates. */
  items: readonly T[] | Signal<readonly T[]>;
  /** Render a single item at a given index. */
  renderItem: (item: T, index: number) => VNode;
  /** Visible viewport height in rows. */
  viewportHeight: number;
  /** Stable id for an item. Required for variable-size measurement caching. */
  keyBy?: (item: T, index: number) => string;
  /** Best-effort per-item size in rows used until `measure(i)` populates the cache. */
  estimateSize?: number;
  /** Synchronous measure hook called the first time an item enters the window. */
  measure?: (item: T, index: number) => number;
  /** Extra items to render above and below the visible window. Default 2. */
  overscan?: number;
  /** Optional explicit controller. Otherwise an internal controller is used. */
  controller?: ScrollController;
  /**
   * Snap controller offsets to nearest boundary. `'item'` rounds to the
   * top of the closest item; `'page'` rounds to the closest viewport-
   * height multiple. Default `false` (no snap). Snap activates inside
   * `controller.setOffset` so programmatic + drag-driven scrolls both
   * land on a boundary.
   */
  snap?: VirtualListSnap;
}

export interface ScrollController {
  offset(): number;
  setOffset(value: number): void;
  contentHeight(): number;
  viewportHeight(): number;
  visibleRange(): { startIndex: number; endIndex: number };
  /** Force-measure an item by index (requires items + measure to have been seen). */
  measure(index: number): number | undefined;
  /** Scroll the controller so item at `index` is visible. Best-effort for variable sizes. */
  scrollToIndex(index: number): void;
  /** Cache used by this controller (exposed for advanced callers). */
  readonly cache: MeasureCache;
}

interface ControllerState {
  offsetValue: number;
  viewportValue: number;
  totalCountValue: number;
  estimateValue: number;
  visibleStart: number;
  visibleEnd: number;
  itemKeyAt: (index: number) => string | undefined;
  measureAt: (index: number) => number | undefined;
  /** Latest snap points emitted by the rendering virtualList primitive. */
  snapPoints: readonly SnapPoint[];
  /** Active snap mode (set by virtualList on render). */
  snapMode: VirtualListSnap;
}

const sharedControllers: ScrollController[] = [];

export function createScrollController(initial: { offset?: number; viewportHeight?: number } = {}): ScrollController {
  const cache = createMeasureCache();
  const state: ControllerState = {
    offsetValue: Math.max(0, initial.offset ?? 0),
    viewportValue: Math.max(0, initial.viewportHeight ?? 0),
    totalCountValue: 0,
    estimateValue: 1,
    visibleStart: 0,
    visibleEnd: 0,
    itemKeyAt: () => undefined,
    measureAt: () => undefined,
    snapPoints: [],
    snapMode: false,
  };

  const controller: ScrollController = {
    offset: () => state.offsetValue,
    setOffset(value: number) {
      const raw = Math.max(0, value);
      state.offsetValue = applySnap(raw, state);
    },
    contentHeight: () => computeContentHeight(state, cache),
    viewportHeight: () => state.viewportValue,
    visibleRange: () => ({ startIndex: state.visibleStart, endIndex: state.visibleEnd }),
    measure(index: number) {
      const id = state.itemKeyAt(index);
      if (id !== undefined) {
        const cached = cache.get(id);
        if (cached !== undefined) return cached;
      }
      const measured = state.measureAt(index);
      if (measured !== undefined && id !== undefined) {
        cache.set(id, measured);
      }
      return measured;
    },
    scrollToIndex(index: number) {
      const target = Math.max(0, Math.min(index, state.totalCountValue - 1));
      let offset = 0;
      for (let i = 0; i < target; i++) {
        const id = state.itemKeyAt(i);
        const size = (id !== undefined ? cache.get(id) : undefined) ?? state.estimateValue;
        offset += size;
      }
      state.offsetValue = offset;
    },
    cache,
  };

  // Stash internal state on the controller so renderers can refresh it without
  // forcing every helper to be a method.
  Object.defineProperty(controller, '__state', { value: state, enumerable: false, writable: false });
  sharedControllers.push(controller);
  return controller;
}

export function clearVirtualListCache(controller?: ScrollController): void {
  if (controller) {
    controller.cache.clear();
    return;
  }
  for (const c of sharedControllers) {
    c.cache.clear();
  }
}

export function virtualList<T>(opts: VirtualListOptions<T>): ComponentNode {
  const overscan = Math.max(0, opts.overscan ?? 2);
  const estimateSize = Math.max(1, opts.estimateSize ?? 1);
  const controller = opts.controller ?? createScrollController({ viewportHeight: opts.viewportHeight });
  const internalState = (controller as unknown as { __state?: ControllerState }).__state;

  return {
    kind: 'component',
    render: (): VNode => {
      const items = readItems(opts.items);
      const totalCount = items.length;
      const viewportHeight = Math.max(0, opts.viewportHeight);
      const offset = Math.max(0, controller.offset());

      const sizes = new Array<number>(totalCount);
      const offsets = new Array<number>(totalCount);
      let runningOffset = 0;
      let totalHeight = 0;

      for (let i = 0; i < totalCount; i++) {
        const item = items[i]!;
        const id = opts.keyBy ? opts.keyBy(item, i) : `__idx_${i}`;
        let size = controller.cache.get(id);
        if (size === undefined && opts.measure) {
          size = opts.measure(item, i);
          if (size !== undefined) {
            controller.cache.set(id, size);
          }
        }
        if (size === undefined) {
          size = estimateSize;
        }
        sizes[i] = size;
        offsets[i] = runningOffset;
        runningOffset += size;
        totalHeight += size;
      }

      // If sizes are uniform AND fully measured, we can short-circuit through
      // nebula's uniform virtualList for parity with the existing primitive.
      if (totalCount > 0 && opts.measure === undefined && opts.keyBy === undefined) {
        const uniform = sizes.every((s) => s === estimateSize);
        if (uniform) {
          updateInternalState(internalState, controller, opts, items, estimateSize, viewportHeight, offset, totalHeight);
          const start = clampIndex(Math.floor(offset / estimateSize) - overscan, 0, totalCount);
          const end = clampIndex(Math.ceil((offset + viewportHeight) / estimateSize) + overscan, 0, totalCount);
          if (internalState) {
            internalState.visibleStart = start;
            internalState.visibleEnd = end;
          }
          return nebulaVirtualList({
            items,
            itemHeight: estimateSize,
            renderItem: opts.renderItem,
            height: viewportHeight,
            overscan,
            scrollOffset: offset,
          });
        }
      }

      // Variable-size path: locate the first item whose end crosses `offset`.
      let rawStart = 0;
      while (rawStart < totalCount && offsets[rawStart]! + sizes[rawStart]! <= offset) {
        rawStart++;
      }
      let rawEnd = rawStart;
      let consumed = 0;
      while (rawEnd < totalCount && consumed < viewportHeight) {
        consumed += sizes[rawEnd]!;
        rawEnd++;
      }

      const startIdx = clampIndex(rawStart - overscan, 0, totalCount);
      const endIdx = clampIndex(rawEnd + overscan, 0, totalCount);

      updateInternalState(internalState, controller, opts, items, estimateSize, viewportHeight, offset, totalHeight, offsets, sizes);
      if (internalState) {
        internalState.visibleStart = startIdx;
        internalState.visibleEnd = endIdx;
      }

      const aboveHeight = startIdx > 0 ? offsets[startIdx]! : 0;
      const belowHeight = endIdx < totalCount ? totalHeight - (offsets[endIdx - 1]! + sizes[endIdx - 1]!) : 0;

      const children: VNode[] = [];
      if (aboveHeight > 0) {
        children.push({ kind: 'empty', height: aboveHeight });
      }
      for (let i = startIdx; i < endIdx; i++) {
        children.push(opts.renderItem(items[i]!, i));
      }
      if (belowHeight > 0) {
        children.push({ kind: 'empty', height: belowHeight });
      }

      return {
        kind: 'scroll',
        offset,
        height: viewportHeight,
        child: { kind: 'column', children },
      };
    },
  };
}

function readItems<T>(items: readonly T[] | Signal<readonly T[]>): readonly T[] {
  if (typeof items === 'function') {
    return (items as Signal<readonly T[]>)();
  }
  return items;
}

function clampIndex(index: number, min: number, max: number): number {
  if (index < min) return min;
  if (index > max) return max;
  return index;
}

function computeContentHeight(state: ControllerState, _cache: MeasureCache): number {
  // The virtualList render() recomputes total height each tick; mirror it
  // here without re-walking measurements by using whatever the latest render
  // observed. When called before first render, return zero.
  return state.totalCountValue * state.estimateValue || 0;
}

function updateInternalState<T>(
  state: ControllerState | undefined,
  controller: ScrollController,
  opts: VirtualListOptions<T>,
  items: readonly T[],
  estimate: number,
  viewport: number,
  offset: number,
  totalHeight: number,
  perItemOffsets?: ReadonlyArray<number>,
  perItemSizes?: ReadonlyArray<number>,
): void {
  if (!state) return;
  state.viewportValue = viewport;
  state.totalCountValue = items.length;
  state.estimateValue = estimate;
  state.offsetValue = offset;
  state.snapMode = opts.snap ?? false;
  state.snapPoints = computeSnapPoints(items, opts, estimate, viewport, totalHeight, perItemOffsets, perItemSizes);
  state.itemKeyAt = (index: number) => {
    if (index < 0 || index >= items.length) return undefined;
    if (opts.keyBy) return opts.keyBy(items[index]!, index);
    return `__idx_${index}`;
  };
  state.measureAt = (index: number) => {
    if (!opts.measure) return undefined;
    if (index < 0 || index >= items.length) return undefined;
    return opts.measure(items[index]!, index);
  };
  // Patch contentHeight to reflect actual computed total once we know it.
  const total = totalHeight;
  Object.defineProperty(controller, 'contentHeight', {
    value: () => total,
    configurable: true,
  });
}

function applySnap(rawOffset: number, state: ControllerState): number {
  if (!state.snapMode || state.snapPoints.length === 0) return rawOffset;
  const snapped = snapToNearest(rawOffset, state.snapPoints);
  return Math.max(0, snapped);
}

function computeSnapPoints<T>(
  items: readonly T[],
  opts: VirtualListOptions<T>,
  estimate: number,
  viewport: number,
  totalHeight: number,
  perItemOffsets?: ReadonlyArray<number>,
  perItemSizes?: ReadonlyArray<number>,
): readonly SnapPoint[] {
  const mode = opts.snap ?? false;
  if (mode === false) return [];

  if (mode === 'page') {
    const stride = Math.max(1, viewport);
    const points: SnapPoint[] = [];
    for (let y = 0; y <= totalHeight; y += stride) {
      points.push({ offset: y, id: `page:${points.length}` });
    }
    return points;
  }

  // mode === 'item' — synthesize per-item rectangles for nebula's helper.
  if (perItemOffsets && perItemSizes) {
    const rects = items.map((item, index) => ({
      id: opts.keyBy ? opts.keyBy(item, index) : `__idx_${index}`,
      y: perItemOffsets[index] ?? 0,
      height: perItemSizes[index] ?? estimate,
    }));
    return generateSnapPoints(rects);
  }

  // Uniform-fast-path: every item is `estimate` rows tall.
  const rects = items.map((item, index) => ({
    id: opts.keyBy ? opts.keyBy(item, index) : `__idx_${index}`,
    y: index * estimate,
    height: estimate,
  }));
  return generateSnapPoints(rects);
}

// Re-export type for advanced callers wanting raw access.
export type { MeasureCache } from './measure-cache.js';
