import { describe, expect, it } from 'vitest';
import { createListMultiSelectState, selectListRange, toggleListSelection, updateListMultiSelectState } from '../multi-select.js';

const items = [{ id: 'alpha' }, { id: 'beta' }, { id: 'gamma' }, { id: 'delta', disabled: true }, { id: 'epsilon' }];

describe('multi-select helpers', () => {
  it('toggles selection with ctrl-click semantics', () => {
    const state = createListMultiSelectState<string>();
    const first = updateListMultiSelectState(items, state, { index: 1, ctrl: true });
    expect(first.selectedIds).toEqual(['beta']);
    expect(first.anchorIndex).toBe(1);

    const second = updateListMultiSelectState(items, first, { index: 1, ctrl: true });
    expect(second.selectedIds).toEqual([]);
    expect(second.anchorIndex).toBe(1);
  });

  it('selects a contiguous range with shift-click semantics', () => {
    const state = { selectedIds: ['alpha'], anchorIndex: 0 };
    const next = updateListMultiSelectState(items, state, { index: 4, shift: true });
    expect(next.selectedIds).toEqual(['alpha', 'beta', 'gamma', 'epsilon']);
    expect(next.anchorIndex).toBe(0);
  });

  it('selects a single item on plain click', () => {
    const next = updateListMultiSelectState(items, createListMultiSelectState(), { index: 2 });
    expect(next.selectedIds).toEqual(['gamma']);
    expect(next.anchorIndex).toBe(2);
  });

  it('toggleListSelection preserves order', () => {
    expect(toggleListSelection(['alpha', 'beta'], 'beta')).toEqual(['alpha']);
    expect(toggleListSelection(['alpha'], 'gamma')).toEqual(['alpha', 'gamma']);
  });

  it('selectListRange skips disabled items', () => {
    expect(selectListRange(items, 0, 4)).toEqual(['alpha', 'beta', 'gamma', 'epsilon']);
  });
});
