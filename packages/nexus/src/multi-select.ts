export interface ListMultiSelectItem<T = string> {
  id: T;
  disabled?: boolean;
}

export interface ListMultiSelectState<T = string> {
  selectedIds: readonly T[];
  anchorIndex: number | null;
}

export interface ListMultiSelectClick {
  index: number;
  ctrl?: boolean;
  shift?: boolean;
}

export function createListMultiSelectState<T = string>(): ListMultiSelectState<T> {
  return {
    selectedIds: [],
    anchorIndex: null,
  };
}

export function toggleListSelection<T>(selectedIds: readonly T[], id: T): T[] {
  const next = selectedIds.filter((selected) => selected !== id);
  if (next.length === selectedIds.length) {
    return [...selectedIds, id];
  }
  return next;
}

export function selectListRange<T>(items: readonly ListMultiSelectItem<T>[], anchorIndex: number, focusIndex: number): T[] {
  if (items.length === 0) return [];

  const start = Math.max(0, Math.min(anchorIndex, focusIndex));
  const end = Math.min(items.length - 1, Math.max(anchorIndex, focusIndex));
  const selected: T[] = [];

  for (let index = start; index <= end; index++) {
    const item = items[index];
    if (item && !item.disabled) {
      selected.push(item.id);
    }
  }

  return selected;
}

export function updateListMultiSelectState<T>(
  items: readonly ListMultiSelectItem<T>[],
  state: ListMultiSelectState<T>,
  click: ListMultiSelectClick,
): ListMultiSelectState<T> {
  const item = items[click.index];
  if (!item || item.disabled) return state;

  if (click.shift) {
    const anchorIndex = state.anchorIndex ?? click.index;
    return {
      selectedIds: selectListRange(items, anchorIndex, click.index),
      anchorIndex,
    };
  }

  if (click.ctrl) {
    return {
      selectedIds: toggleListSelection(state.selectedIds, item.id),
      anchorIndex: click.index,
    };
  }

  return {
    selectedIds: [item.id],
    anchorIndex: click.index,
  };
}
