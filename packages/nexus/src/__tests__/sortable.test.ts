import { describe, expect, it } from 'vitest';
import { createSortableState, getPreviewOrder, reorder, sortableUpdate } from '../sortable.js';

describe('sortable', () => {
  describe('createSortableState', () => {
    it('starts with null indices', () => {
      const state = createSortableState();
      expect(state).toEqual({ draggingIndex: null, overIndex: null });
    });
  });

  describe('sort-start', () => {
    it('sets draggingIndex', () => {
      const state = createSortableState();
      const next = sortableUpdate({ type: 'sort-start', index: 2 }, state);
      expect(next).toEqual({ draggingIndex: 2, overIndex: null });
    });
  });

  describe('sort-over', () => {
    it('sets overIndex when dragging', () => {
      const state = { draggingIndex: 1, overIndex: null };
      const next = sortableUpdate({ type: 'sort-over', index: 3 }, state);
      expect(next).toEqual({ draggingIndex: 1, overIndex: 3 });
    });

    it('is a no-op when not dragging', () => {
      const state = createSortableState();
      const next = sortableUpdate({ type: 'sort-over', index: 3 }, state);
      expect(next).toBe(state);
    });
  });

  describe('sort-end', () => {
    it('clears both indices', () => {
      const state = { draggingIndex: 1, overIndex: 3 };
      const next = sortableUpdate({ type: 'sort-end' }, state);
      expect(next).toEqual({ draggingIndex: null, overIndex: null });
    });
  });

  describe('sort-cancel', () => {
    it('clears both indices', () => {
      const state = { draggingIndex: 1, overIndex: 3 };
      const next = sortableUpdate({ type: 'sort-cancel' }, state);
      expect(next).toEqual({ draggingIndex: null, overIndex: null });
    });
  });

  describe('reorder', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];

    it('moves item forward (index 0 to 2)', () => {
      expect(reorder(items, 0, 2)).toEqual(['b', 'c', 'a', 'd', 'e']);
    });

    it('moves item backward (index 2 to 0)', () => {
      expect(reorder(items, 2, 0)).toEqual(['c', 'a', 'b', 'd', 'e']);
    });

    it('returns copy when same index', () => {
      const result = reorder(items, 1, 1);
      expect(result).toEqual(items);
      expect(result).not.toBe(items);
    });

    it('moves first to last', () => {
      expect(reorder(items, 0, 4)).toEqual(['b', 'c', 'd', 'e', 'a']);
    });

    it('moves last to first', () => {
      expect(reorder(items, 4, 0)).toEqual(['e', 'a', 'b', 'c', 'd']);
    });
  });

  describe('getPreviewOrder', () => {
    const items = ['a', 'b', 'c', 'd'];

    it('returns reordered when dragging', () => {
      const state = { draggingIndex: 0, overIndex: 2 };
      expect(getPreviewOrder(items, state)).toEqual(['b', 'c', 'a', 'd']);
    });

    it('returns copy of original when not dragging', () => {
      const state = createSortableState();
      const result = getPreviewOrder(items, state);
      expect(result).toEqual(items);
      expect(result).not.toBe(items);
    });

    it('returns copy of original when overIndex is null', () => {
      const state = { draggingIndex: 1, overIndex: null };
      const result = getPreviewOrder(items, state);
      expect(result).toEqual(items);
      expect(result).not.toBe(items);
    });
  });
});
