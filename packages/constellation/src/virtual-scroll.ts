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
  return config.rowHeight ?? 1;
}

function getOverscan<T>(config: VirtualScrollConfig<T>): number {
  return config.overscan ?? 3;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function maxScrollOffset<T>(config: VirtualScrollConfig<T>, totalHeight: number): number {
  return Math.max(0, totalHeight - config.viewportHeight);
}

export function createVirtualScrollState<T>(config: VirtualScrollConfig<T>): VirtualScrollState {
  const rh = getRowHeight(config);
  return {
    scrollOffset: 0,
    totalHeight: config.items.length * rh,
  };
}

export function getVisibleRange<T>(state: VirtualScrollState, config: VirtualScrollConfig<T>): VisibleRange {
  const rh = getRowHeight(config);
  const overscan = getOverscan(config);
  const itemCount = config.items.length;

  if (itemCount === 0) {
    return { startIndex: 0, endIndex: -1, offsetAbove: 0, offsetBelow: 0 };
  }

  // First visible row index (without overscan)
  const firstVisible = Math.floor(state.scrollOffset / rh);
  // Number of items that fit in viewport
  const visibleCount = Math.ceil(config.viewportHeight / rh);
  // Last visible row index (without overscan)
  const lastVisible = firstVisible + visibleCount - 1;

  // Apply overscan and clamp to array bounds
  const startIndex = clamp(firstVisible - overscan, 0, itemCount - 1);
  const endIndex = clamp(lastVisible + overscan, 0, itemCount - 1);

  // Spacer heights
  const offsetAbove = startIndex * rh;
  const offsetBelow = (itemCount - 1 - endIndex) * rh;

  return { startIndex, endIndex, offsetAbove, offsetBelow };
}

export function virtualScrollUpdate<T>(msg: VirtualScrollMsg, state: VirtualScrollState, config: VirtualScrollConfig<T>): VirtualScrollState {
  const rh = getRowHeight(config);
  const totalHeight = config.items.length * rh;
  const max = maxScrollOffset(config, totalHeight);

  switch (msg.type) {
    case 'vscroll-down': {
      const amount = msg.amount ?? 1;
      return { totalHeight, scrollOffset: clamp(state.scrollOffset + amount, 0, max) };
    }
    case 'vscroll-up': {
      const amount = msg.amount ?? 1;
      return { totalHeight, scrollOffset: clamp(state.scrollOffset - amount, 0, max) };
    }
    case 'vscroll-to': {
      const offset = msg.index * rh;
      return { totalHeight, scrollOffset: clamp(offset, 0, max) };
    }
    case 'vscroll-to-top': {
      return { totalHeight, scrollOffset: 0 };
    }
    case 'vscroll-to-bottom': {
      return { totalHeight, scrollOffset: max };
    }
    case 'vscroll-page-up': {
      return { totalHeight, scrollOffset: clamp(state.scrollOffset - config.viewportHeight, 0, max) };
    }
    case 'vscroll-page-down': {
      return { totalHeight, scrollOffset: clamp(state.scrollOffset + config.viewportHeight, 0, max) };
    }
  }
}

export function scrollToIndex<T>(config: VirtualScrollConfig<T>, state: VirtualScrollState, index: number): VirtualScrollState {
  const rh = getRowHeight(config);
  const totalHeight = config.items.length * rh;
  const max = maxScrollOffset(config, totalHeight);

  const itemTop = index * rh;
  const itemBottom = itemTop + rh;

  // If the item is already fully visible, don't change offset
  if (itemTop >= state.scrollOffset && itemBottom <= state.scrollOffset + config.viewportHeight) {
    return { ...state, totalHeight };
  }

  // If item is above viewport, scroll so item is at top
  if (itemTop < state.scrollOffset) {
    return { totalHeight, scrollOffset: clamp(itemTop, 0, max) };
  }

  // If item is below viewport, scroll so item is at bottom
  const newOffset = itemBottom - config.viewportHeight;
  return { totalHeight, scrollOffset: clamp(newOffset, 0, max) };
}
