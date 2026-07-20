import { boundedInteger, clampRange, finiteNumber, nonNegativeInteger, positiveInteger } from './internal.js';

export interface VirtualScrollConfig<T> {
  items: readonly T[];
  viewportHeight: number;
  rowHeight?: number;
  overscan?: number;
}

export interface VirtualScrollState {
  scrollOffset: number;
  totalHeight: number;
}

export type VirtualScrollMsg =
  | { type: 'vscroll-up'; amount?: number }
  | { type: 'vscroll-down'; amount?: number }
  | { type: 'vscroll-to'; index: number }
  | { type: 'vscroll-to-top' }
  | { type: 'vscroll-to-bottom' }
  | { type: 'vscroll-page-up' }
  | { type: 'vscroll-page-down' };

export interface VisibleRange {
  startIndex: number;
  endIndex: number;
  offsetAbove: number;
  offsetBelow: number;
}

function getRowHeight<T>(config: VirtualScrollConfig<T>): number {
  return positiveInteger(config.rowHeight, 1);
}

function getOverscan<T>(config: VirtualScrollConfig<T>): number {
  return nonNegativeInteger(config.overscan, 3, config.items.length);
}

function getViewportHeight<T>(config: VirtualScrollConfig<T>): number {
  return nonNegativeInteger(config.viewportHeight, 0);
}

function getTotalHeight<T>(config: VirtualScrollConfig<T>): number {
  return Math.min(Number.MAX_SAFE_INTEGER, config.items.length * getRowHeight(config));
}

function clamp(value: number, min: number, max: number, fallback = min): number {
  return clampRange(value, min, max, fallback);
}

function maxScrollOffset<T>(config: VirtualScrollConfig<T>, totalHeight: number): number {
  return Math.max(0, totalHeight - getViewportHeight(config));
}

export function createVirtualScrollState<T>(config: VirtualScrollConfig<T>): VirtualScrollState {
  return {
    scrollOffset: 0,
    totalHeight: getTotalHeight(config),
  };
}

export function getVisibleRange<T>(state: VirtualScrollState, config: VirtualScrollConfig<T>): VisibleRange {
  const rh = getRowHeight(config);
  const overscan = getOverscan(config);
  const viewportHeight = getViewportHeight(config);
  const itemCount = config.items.length;

  if (itemCount === 0) {
    return { startIndex: 0, endIndex: -1, offsetAbove: 0, offsetBelow: 0 };
  }

  // First visible row index (without overscan)
  const maxOffset = maxScrollOffset(config, getTotalHeight(config));
  const scrollOffset = clamp(state.scrollOffset, 0, maxOffset);
  const firstVisible = Math.floor(scrollOffset / rh);
  // Number of items that fit in viewport
  const visibleCount = Math.max(1, Math.ceil(viewportHeight / rh));
  // Last visible row index (without overscan)
  const lastVisible = firstVisible + visibleCount - 1;

  // Apply overscan and clamp to array bounds
  const startIndex = boundedInteger(firstVisible - overscan, 0, 0, itemCount - 1);
  const endIndex = boundedInteger(lastVisible + overscan, itemCount - 1, 0, itemCount - 1);

  // Spacer heights
  const offsetAbove = startIndex * rh;
  const offsetBelow = (itemCount - 1 - endIndex) * rh;

  return { startIndex, endIndex, offsetAbove, offsetBelow };
}

export function virtualScrollUpdate<T>(msg: VirtualScrollMsg, state: VirtualScrollState, config: VirtualScrollConfig<T>): VirtualScrollState {
  const rh = getRowHeight(config);
  const totalHeight = getTotalHeight(config);
  const max = maxScrollOffset(config, totalHeight);
  const currentOffset = clamp(state.scrollOffset, 0, max);
  const amount = (value: number | undefined): number => Math.max(0, finiteNumber(value, 1));

  switch (msg.type) {
    case 'vscroll-down': {
      return { totalHeight, scrollOffset: clamp(currentOffset + amount(msg.amount), 0, max, currentOffset) };
    }
    case 'vscroll-up': {
      return { totalHeight, scrollOffset: clamp(currentOffset - amount(msg.amount), 0, max, currentOffset) };
    }
    case 'vscroll-to': {
      const index = boundedInteger(msg.index, 0, 0, Math.max(0, config.items.length - 1));
      const offset = index * rh;
      return { totalHeight, scrollOffset: clamp(offset, 0, max) };
    }
    case 'vscroll-to-top': {
      return { totalHeight, scrollOffset: 0 };
    }
    case 'vscroll-to-bottom': {
      return { totalHeight, scrollOffset: max };
    }
    case 'vscroll-page-up': {
      return { totalHeight, scrollOffset: clamp(currentOffset - getViewportHeight(config), 0, max, currentOffset) };
    }
    case 'vscroll-page-down': {
      return { totalHeight, scrollOffset: clamp(currentOffset + getViewportHeight(config), 0, max, currentOffset) };
    }
  }
}

export function scrollToIndex<T>(config: VirtualScrollConfig<T>, state: VirtualScrollState, index: number): VirtualScrollState {
  const rh = getRowHeight(config);
  const viewportHeight = getViewportHeight(config);
  const totalHeight = getTotalHeight(config);
  const max = maxScrollOffset(config, totalHeight);
  const currentOffset = clamp(state.scrollOffset, 0, max);
  if (config.items.length === 0) return { totalHeight, scrollOffset: 0 };
  const safeIndex = boundedInteger(index, 0, 0, config.items.length - 1);

  const itemTop = safeIndex * rh;
  const itemBottom = itemTop + rh;

  // If the item is already fully visible, don't change offset
  if (itemTop >= currentOffset && itemBottom <= currentOffset + viewportHeight) {
    return { totalHeight, scrollOffset: currentOffset };
  }

  // If item is above viewport, scroll so item is at top
  if (itemTop < currentOffset) {
    return { totalHeight, scrollOffset: clamp(itemTop, 0, max) };
  }

  // If item is below viewport, scroll so item is at bottom
  const newOffset = itemBottom - viewportHeight;
  return { totalHeight, scrollOffset: clamp(newOffset, 0, max) };
}
