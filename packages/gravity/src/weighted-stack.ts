export interface WeightedStackItem<TId extends string = string> {
  readonly id: TId;
  readonly weight: number;
  readonly minSize?: number;
  readonly maxSize?: number;
  readonly collapsed?: boolean;
  readonly collapsedSize?: number;
}

export interface WeightedStackOptions<TId extends string = string> {
  readonly items: readonly WeightedStackItem<TId>[];
  readonly size: number;
  readonly gap?: number;
  /** Item-count offset for overflowing stacks. */
  readonly scrollOffset?: number;
  /** Minimum size used when an item does not declare one. */
  readonly minItemSize?: number;
}

export interface WeightedStackEntry<TId extends string = string> {
  readonly id: TId;
  readonly index: number;
  readonly start: number;
  readonly size: number;
  readonly collapsed: boolean;
}

export interface WeightedStackResult<TId extends string = string> {
  readonly entries: readonly WeightedStackEntry<TId>[];
  readonly visibleEntries: readonly WeightedStackEntry<TId>[];
  readonly hiddenAbove: readonly TId[];
  readonly hiddenBelow: readonly TId[];
  readonly hiddenCount: number;
  readonly scrollOffset: number;
  readonly maxScrollOffset: number;
  readonly usedSize: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeCellSize(value: number | undefined, fallback = 0): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value!)) : fallback;
}

function itemBounds(item: WeightedStackItem, minItemSize: number): { min: number; max: number } {
  const min = normalizeCellSize(item.minSize, minItemSize);
  const max =
    item.maxSize === undefined || item.maxSize === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : Math.max(min, normalizeCellSize(item.maxSize, min));
  return { min, max };
}

function itemWeight(item: WeightedStackItem): number {
  return Number.isFinite(item.weight) && item.weight > 0 ? item.weight : 0;
}

function distributeWeightedSizes<TId extends string>(items: readonly WeightedStackItem<TId>[], available: number, minItemSize: number): number[] {
  const collapsedSizes = items.map((item) => (item.collapsed ? normalizeCellSize(item.collapsedSize) : 0));
  const fixedCollapsed = collapsedSizes.reduce((sum, size) => sum + size, 0);
  const expandable = items.map((item, index) => ({ item, index })).filter(({ item }) => !item.collapsed);
  const remaining = Math.max(0, available - fixedCollapsed);

  if (expandable.length === 0) {
    return collapsedSizes;
  }

  const totalWeight = expandable.reduce((sum, { item }) => sum + itemWeight(item), 0);
  const even = totalWeight <= 0 ? 1 / expandable.length : 0;
  const sizes = [...collapsedSizes];
  let assigned = 0;

  for (const { item, index } of expandable) {
    const share = totalWeight <= 0 ? even : itemWeight(item) / totalWeight;
    const raw = Math.floor(remaining * share);
    const { min, max } = itemBounds(item, minItemSize);
    const size = clamp(raw, min, max);
    sizes[index] = size;
    assigned += size;
  }

  let delta = remaining - assigned;
  while (delta !== 0) {
    let changed = false;
    for (const { item, index } of expandable) {
      if (delta === 0) break;
      const current = sizes[index] ?? 0;
      const { min, max } = itemBounds(item, minItemSize);
      if (delta > 0 && current < max) {
        sizes[index] = current + 1;
        delta -= 1;
        changed = true;
      } else if (delta < 0 && current > min) {
        sizes[index] = current - 1;
        delta += 1;
        changed = true;
      }
    }
    if (!changed) break;
  }

  return sizes;
}

function countVisible(entries: readonly WeightedStackEntry[], startIndex: number, size: number, gap: number): number {
  let used = 0;
  let count = 0;
  for (let index = startIndex; index < entries.length; index++) {
    const entry = entries[index]!;
    const nextUsed = used + (count > 0 ? gap : 0) + entry.size;
    if (nextUsed > size && count > 0) {
      break;
    }
    used = nextUsed;
    count += 1;
    if (used >= size) {
      break;
    }
  }
  return count;
}

function maxReachableScrollOffset(entries: readonly WeightedStackEntry[], size: number, gap: number): number {
  for (let startIndex = 0; startIndex < entries.length; startIndex++) {
    if (startIndex + countVisible(entries, startIndex, size, gap) >= entries.length) {
      return startIndex;
    }
  }
  return Math.max(0, entries.length - 1);
}

function localizeVisibleEntries<TId extends string>(entries: readonly WeightedStackEntry<TId>[], gap: number): WeightedStackEntry<TId>[] {
  let cursor = 0;
  return entries.map((entry, index) => {
    const localized = { ...entry, start: cursor };
    cursor += entry.size + (index < entries.length - 1 ? gap : 0);
    return localized;
  });
}

export function resolveWeightedStack<TId extends string = string>(options: WeightedStackOptions<TId>): WeightedStackResult<TId> {
  const size = normalizeCellSize(options.size);
  const gap = normalizeCellSize(options.gap);
  const totalGap = gap * Math.max(0, options.items.length - 1);
  const available = Math.max(0, size - totalGap);
  const sizes = distributeWeightedSizes(options.items, available, normalizeCellSize(options.minItemSize, 1));

  let cursor = 0;
  const entries = options.items.map((item, index): WeightedStackEntry<TId> => {
    const entry = {
      id: item.id,
      index,
      start: cursor,
      size: sizes[index] ?? 0,
      collapsed: item.collapsed === true,
    };
    cursor += entry.size + (index < options.items.length - 1 ? gap : 0);
    return entry;
  });

  const maxScrollOffset = maxReachableScrollOffset(entries, size, gap);
  const scrollOffset = clamp(normalizeCellSize(options.scrollOffset), 0, maxScrollOffset);
  const visibleCount = countVisible(entries, scrollOffset, size, gap);
  const visibleEntries = localizeVisibleEntries(entries.slice(scrollOffset, scrollOffset + visibleCount), gap);
  const hiddenAbove = entries.slice(0, scrollOffset).map((entry) => entry.id);
  const hiddenBelow = entries.slice(scrollOffset + visibleCount).map((entry) => entry.id);

  return {
    entries,
    visibleEntries,
    hiddenAbove,
    hiddenBelow,
    hiddenCount: hiddenAbove.length + hiddenBelow.length,
    scrollOffset,
    maxScrollOffset,
    usedSize: cursor,
  };
}
