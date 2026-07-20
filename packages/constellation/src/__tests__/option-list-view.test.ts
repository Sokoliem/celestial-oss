import { extractNodeText } from '@celestial/nebula';
import { describe, expect, it, vi } from 'vitest';
import { filterByFuzzy, filterByLabel, moveOptionHighlight, type OptionListItem, optionListView } from '../option-list-view.js';

function items<T extends string>(...labels: T[]): OptionListItem<T>[] {
  return labels.map((label, i) => ({ id: `${i}`, label, value: label }));
}

describe('optionListView — init', () => {
  it('starts with empty selection and full filteredIds', () => {
    const c = optionListView({ items: items('alpha', 'beta', 'gamma') });
    const [m] = c.init();
    expect(m.query).toBe('');
    expect(m.filteredIds).toEqual(['0', '1', '2']);
    expect(m.highlightedIndex).toBe(0);
    expect(m.selectedIds.size).toBe(0);
  });

  it('respects initialHighlight', () => {
    const c = optionListView({ items: items('a', 'b', 'c'), initialHighlight: 2 });
    const [m] = c.init();
    expect(m.highlightedIndex).toBe(2);
  });

  it('respects initial query', () => {
    const c = optionListView({ items: items('alpha', 'beta', 'algol'), query: 'al' });
    const [m] = c.init();
    expect(m.filteredIds).toEqual(['0', '2']);
  });
});

describe('optionListView — update / opt-query', () => {
  it('filters by label substring case-insensitively', () => {
    const c = optionListView({ items: items('Apple', 'Banana', 'apricot') });
    const [m0] = c.init();
    const [m1] = c.update({ type: 'opt-query', query: 'ap' }, m0);
    expect(m1.filteredIds).toEqual(['0', '2']);
    expect(m1.highlightedIndex).toBe(0);
  });

  it('emits onHighlight after query change', () => {
    const onHighlight = vi.fn();
    const c = optionListView({ items: items('a', 'b'), onHighlight });
    const [m0] = c.init();
    c.update({ type: 'opt-query', query: 'b' }, m0);
    expect(onHighlight).toHaveBeenCalledWith('1', 'b');
  });

  it('returns empty filteredIds when no match', () => {
    const c = optionListView({ items: items('alpha', 'beta') });
    const [m0] = c.init();
    const [m1] = c.update({ type: 'opt-query', query: 'zzz' }, m0);
    expect(m1.filteredIds).toEqual([]);
  });
});

describe('optionListView — opt-arrow', () => {
  it('arrow down wraps at end', () => {
    const c = optionListView({ items: items('a', 'b', 'c') });
    let [m] = c.init();
    for (let i = 0; i < 3; i++) [m] = c.update({ type: 'opt-arrow', direction: 'down' }, m);
    expect(m.highlightedIndex).toBe(0);
  });

  it('arrow up wraps at start', () => {
    const c = optionListView({ items: items('a', 'b', 'c') });
    const [m0] = c.init();
    const [m1] = c.update({ type: 'opt-arrow', direction: 'up' }, m0);
    expect(m1.highlightedIndex).toBe(2);
  });

  it('home and end jump to extremes', () => {
    const c = optionListView({ items: items('a', 'b', 'c', 'd') });
    const [m0] = c.init();
    const [m1] = c.update({ type: 'opt-arrow', direction: 'end' }, m0);
    expect(m1.highlightedIndex).toBe(3);
    const [m2] = c.update({ type: 'opt-arrow', direction: 'home' }, m1);
    expect(m2.highlightedIndex).toBe(0);
  });

  it('arrow with empty list is a no-op', () => {
    const c = optionListView({ items: [] });
    const [m0] = c.init();
    const [m1] = c.update({ type: 'opt-arrow', direction: 'down' }, m0);
    expect(m1).toBe(m0);
  });
});

describe('moveOptionHighlight', () => {
  it('centralizes wrap and clamp behavior for list-like components', () => {
    expect(moveOptionHighlight(0, 3, 'up')).toBe(2);
    expect(moveOptionHighlight(2, 3, 'down')).toBe(0);
    expect(moveOptionHighlight(9, 3, 'home')).toBe(0);
    expect(moveOptionHighlight(-1, 3, 'end')).toBe(2);
    expect(moveOptionHighlight(4, 0, 'down')).toBe(0);
  });
});

describe('optionListView — opt-select / opt-toggle', () => {
  it('opt-select fires onSelect with highlighted item', () => {
    const onSelect = vi.fn();
    const c = optionListView({ items: items('a', 'b', 'c'), onSelect });
    const [m0] = c.init();
    const [m1] = c.update({ type: 'opt-arrow', direction: 'down' }, m0);
    c.update({ type: 'opt-select' }, m1);
    expect(onSelect).toHaveBeenCalledWith('1', 'b');
  });

  it('disabled item is not selectable', () => {
    const onSelect = vi.fn();
    const c = optionListView({
      items: [{ id: '0', label: 'a', value: 'a', disabled: true }],
      onSelect,
    });
    const [m0] = c.init();
    c.update({ type: 'opt-select' }, m0);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('multiSelect toggles selectedIds', () => {
    const c = optionListView({ items: items('a', 'b'), multiSelect: true });
    const [m0] = c.init();
    const [m1] = c.update({ type: 'opt-select' }, m0);
    expect(m1.selectedIds.has('0')).toBe(true);
    const [m2] = c.update({ type: 'opt-select' }, m1);
    expect(m2.selectedIds.has('0')).toBe(false);
  });

  it('opt-toggle flips selection regardless of highlight', () => {
    const c = optionListView({ items: items('a', 'b'), multiSelect: true });
    const [m0] = c.init();
    const [m1] = c.update({ type: 'opt-toggle', id: '1' }, m0);
    expect(m1.selectedIds.has('1')).toBe(true);
  });
});

describe('optionListView — opt-hover', () => {
  it('hover sets highlight to hovered id', () => {
    const c = optionListView({ items: items('a', 'b', 'c') });
    const [m0] = c.init();
    const [m1] = c.update({ type: 'opt-hover', id: '2' }, m0);
    expect(m1.highlightedIndex).toBe(2);
  });

  it('hover on filtered-out id is a no-op', () => {
    const c = optionListView({ items: items('a', 'b'), query: 'a' });
    const [m0] = c.init();
    const [m1] = c.update({ type: 'opt-hover', id: '1' }, m0);
    expect(m1.highlightedIndex).toBe(0);
  });
});

describe('optionListView — virtualization + view', () => {
  it('virtualizes past maxVisible', () => {
    const big = Array.from({ length: 100 }, (_, i) => ({ id: `${i}`, label: `item-${i}`, value: i }));
    const c = optionListView({ items: big, maxVisible: 10 });
    const [m] = c.init();
    const v = c.view(m);
    expect(v.kind).toBe('column');
    if (v.kind === 'column') {
      // only 10 rows rendered, not 100
      expect(v.children.length).toBeLessThanOrEqual(10);
    }
  });

  it('shows empty-state node when filteredIds is empty', () => {
    const c = optionListView({ items: items('a'), query: 'zzz' });
    const [m] = c.init();
    const v = c.view(m);
    expect(v.kind).toBe('text');
  });

  it('bounds invalid viewport limits and snapshots caller-owned items', () => {
    const mutable = [{ id: '0', label: 'original', value: 'original' }];
    const c = optionListView({ items: mutable, maxVisible: Number.POSITIVE_INFINITY });
    mutable[0]!.label = 'changed';
    const [model] = c.init();
    expect(extractNodeText(c.view(model))).toContain('original');
    expect(extractNodeText(c.view(model))).not.toContain('changed');
  });

  it('rejects duplicate ids that would make selection ambiguous', () => {
    expect(() =>
      optionListView({
        items: [
          { id: 'same', label: 'A', value: 'a' },
          { id: 'same', label: 'B', value: 'b' },
        ],
      }),
    ).toThrow(/unique/i);
  });

  it('supports direct pointer-style selection and keeps its mouse subscription active', () => {
    const onSelect = vi.fn();
    const c = optionListView({ items: items('a', 'b'), onSelect });
    const [model] = c.init();
    expect(c.subscriptions!(model)._kind.kind).toBe('elementMouse');
    const [updated] = c.update({ type: 'opt-click', id: '1' }, model);
    expect(updated.highlightedIndex).toBe(1);
    expect(onSelect).toHaveBeenCalledWith('1', 'b');
  });
});

describe('filter helpers', () => {
  it('filterByLabel substring is case-insensitive', () => {
    const item: OptionListItem = { id: '0', label: 'Hello World', value: null };
    expect(filterByLabel(item, 'hello')).toBe(true);
    expect(filterByLabel(item, 'world')).toBe(true);
    expect(filterByLabel(item, 'xyz')).toBe(false);
  });

  it('filterByFuzzy matches in-order subsequence', () => {
    const item: OptionListItem = { id: '0', label: 'apricot', value: null };
    expect(filterByFuzzy(item, 'apt')).toBe(true);
    expect(filterByFuzzy(item, 'arc')).toBe(true);
    expect(filterByFuzzy(item, 'tap')).toBe(false);
  });

  it('empty query matches everything', () => {
    const item: OptionListItem = { id: '0', label: 'x', value: null };
    expect(filterByLabel(item, '')).toBe(true);
    expect(filterByFuzzy(item, '')).toBe(true);
  });
});

describe('optionListView — AC5 (100 items, query "a", arrow x3, enter)', () => {
  it('selects the 4th filtered item', () => {
    const big = Array.from({ length: 100 }, (_, i) => ({
      id: `${i}`,
      label: i % 2 === 0 ? `a-${i}` : `b-${i}`,
      value: i,
    }));
    const onSelect = vi.fn();
    const c = optionListView({ items: big, onSelect });
    let [m] = c.init();
    [m] = c.update({ type: 'opt-query', query: 'a' }, m);
    expect(m.filteredIds.length).toBe(50);
    for (let i = 0; i < 3; i++) [m] = c.update({ type: 'opt-arrow', direction: 'down' }, m);
    c.update({ type: 'opt-select' }, m);
    expect(onSelect).toHaveBeenCalledWith(m.filteredIds[3], 6);
  });
});
