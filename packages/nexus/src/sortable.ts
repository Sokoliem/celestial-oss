export interface SortableState {
  draggingIndex: number | null;
  overIndex: number | null;
}

export type SortableMsg = { type: 'sort-start'; index: number } | { type: 'sort-over'; index: number } | { type: 'sort-end' } | { type: 'sort-cancel' };

export function createSortableState(): SortableState {
  return { draggingIndex: null, overIndex: null };
}

export function sortableUpdate(msg: SortableMsg, state: SortableState): SortableState {
  switch (msg.type) {
    case 'sort-start': {
      return { draggingIndex: msg.index, overIndex: null };
    }

    case 'sort-over': {
      if (state.draggingIndex === null) return state;
      return { ...state, overIndex: msg.index };
    }

    case 'sort-end': {
      return { draggingIndex: null, overIndex: null };
    }

    case 'sort-cancel': {
      return { draggingIndex: null, overIndex: null };
    }
  }
}

/** Reorder an array by moving item at fromIndex to toIndex */
export function reorder<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  const result = [...items];
  if (fromIndex === toIndex) return result;
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed as T);
  return result;
}

/** Get the preview order (what the list would look like if dropped now) */
export function getPreviewOrder<T>(items: readonly T[], state: SortableState): T[] {
  if (state.draggingIndex !== null && state.overIndex !== null) {
    return reorder(items, state.draggingIndex, state.overIndex);
  }
  return [...items];
}
