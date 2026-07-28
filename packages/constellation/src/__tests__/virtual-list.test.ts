import { getVNodeMeta, text } from '@celestial/core/nebula';
import { describe, expect, it, vi } from 'vitest';
import { virtualList } from '../virtual-list.js';

interface Item {
  id: string;
  label: string;
  disabled?: boolean;
}

function items(count: number, offset = 0): Item[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `item-${offset + index}`,
    label: `Item ${offset + index}`,
  }));
}

function component(overrides: Partial<Parameters<typeof virtualList<Item>>[0]> = {}) {
  return virtualList<Item>({
    id: 'audit-list',
    items: items(10),
    viewportRows: 3,
    getKey: (item) => item.id,
    isDisabled: (item) => item.disabled ?? false,
    renderItem: (item) => text(item.label),
    ...overrides,
  });
}

describe('virtualList structure and identity', () => {
  it('renders exactly the viewport row count and a proportional scrollbar', () => {
    const descriptor = component();
    const [model] = descriptor.init();
    const view = descriptor.view(model);
    expect(view.kind).toBe('row');
    expect(getVNodeMeta(view)?.a11y).toMatchObject({ role: 'listbox', label: 'Virtual list' });
    if (view.kind !== 'row' || view.children[0]?.kind !== 'column' || view.children[1]?.kind !== 'column') {
      throw new Error('Expected rows and scrollbar columns');
    }
    expect(view.children[0].children).toHaveLength(3);
    expect(view.children[1].children).toHaveLength(3);
    expect(JSON.stringify(view)).toContain('Item 0');
    expect(JSON.stringify(view)).not.toContain('Item 3');
  });

  it('keeps an empty collection at a stable, padded viewport with inert scroll state', () => {
    const descriptor = component({ items: [], viewportRows: 3, emptyLabel: 'No receipts' });
    const [model] = descriptor.init();
    const view = descriptor.view(model);
    expect(model).toMatchObject({ scrollOffset: 0, focusedKey: null, selectedKey: null });
    expect(JSON.stringify(view)).toContain('No receipts');
    if (view.kind !== 'row' || view.children[0]?.kind !== 'column') {
      throw new Error('Expected an empty padded viewport');
    }
    expect(view.children[0].children).toHaveLength(3);
    expect(descriptor.update({ type: 'vl-wheel', direction: 1 }, model)[0]).toMatchObject({ scrollOffset: 0 });
  });

  it('rejects missing, duplicate, and throwing keys before producing state', () => {
    expect(() => component({ items: [{ id: '', label: 'empty' }] }).init()).toThrow('non-empty string key');
    expect(() => component({ items: [{ id: 'same', label: 'A' }, { id: 'same', label: 'B' }] }).init()).toThrow('duplicate key "same"');
    expect(() =>
      component({
        getKey: () => {
          throw new Error('bad key');
        },
      }).init(),
    ).toThrow('getKey failed at index 0');
    expect(() => component({ items: [{ id: 'unsafe\u001b[2J', label: 'escape' }] }).init()).toThrow('safe single-line metadata');
    expect(() => component({ items: [{ id: 'spoof\u202Ekey', label: 'bidi' }] }).init()).toThrow('safe single-line metadata');
  });

  it('copies the item array so external mutation cannot silently change model geometry', () => {
    const source = items(4);
    const descriptor = component({ items: source });
    const [model] = descriptor.init();
    source.push({ id: 'late', label: 'Late mutation' });
    expect(model.items).toHaveLength(4);
    expect(model.keys).not.toContain('late');
  });

  it('contains row render failures without crashing the full view', () => {
    const descriptor = component({
      renderItem: (item) => {
        if (item.id === 'item-1') throw new Error('broken row');
        return text(item.label);
      },
    });
    const [model] = descriptor.init();
    expect(() => descriptor.view(model)).not.toThrow();
    expect(JSON.stringify(descriptor.view(model))).toContain('[row render failed]');
  });
});

describe('virtualList interactions', () => {
  it('scrolls the pointed viewport without moving keyboard focus and clamps at both ends', () => {
    const descriptor = component();
    const [model] = descriptor.init();
    const [scrolled] = descriptor.update({ type: 'vl-wheel', direction: 1 }, model);
    expect(scrolled.scrollOffset).toBe(3);
    expect(scrolled.focusedKey).toBe('item-0');
    const [ended] = descriptor.update({ type: 'vl-end' }, scrolled);
    expect(ended.focusedKey).toBe('item-9');
    expect(ended.scrollOffset).toBe(7);
    const [stillEnded] = descriptor.update({ type: 'vl-wheel', direction: 1 }, ended);
    expect(stillEnded.scrollOffset).toBe(7);
  });

  it('skips disabled rows for arrows, pages, Home, and End, including all-disabled input', () => {
    const source = items(6);
    source[0]!.disabled = true;
    source[2]!.disabled = true;
    source[5]!.disabled = true;
    const descriptor = component({ items: source, focused: true });
    const [model] = descriptor.init();
    expect(model.focusedKey).toBe('item-1');
    const [down] = descriptor.update({ type: 'vl-arrow', direction: 1 }, model);
    expect(down.focusedKey).toBe('item-3');
    const [home] = descriptor.update({ type: 'vl-home' }, down);
    expect(home.focusedKey).toBe('item-1');
    const [end] = descriptor.update({ type: 'vl-end' }, home);
    expect(end.focusedKey).toBe('item-4');

    const allDisabled = component({ items: source.map((entry) => ({ ...entry, disabled: true })) });
    const [disabledModel] = allDisabled.init();
    expect(disabledModel.focusedKey).toBeNull();
    expect(allDisabled.update({ type: 'vl-end' }, disabledModel)[0]).toBe(disabledModel);
  });

  it('keeps newer row and pip hover state when stale leave messages arrive', () => {
    const descriptor = component();
    const [model] = descriptor.init();
    const [first] = descriptor.update({ type: 'vl-hover', key: 'item-0' }, model);
    const [second] = descriptor.update({ type: 'vl-hover', key: 'item-1' }, first);
    expect(descriptor.update({ type: 'vl-leave', key: 'item-0' }, second)[0].hoveredKey).toBe('item-1');
    const [pip] = descriptor.update({ type: 'vl-hover-pip' }, second);
    expect(descriptor.update({ type: 'vl-leave-pip' }, pip)[0].pipHovered).toBe(false);
  });

  it('converges pointer selection/activation with keyboard and isolates host failures', () => {
    const onSelect = vi.fn(() => {
      throw new Error('selection observer failed');
    });
    const onActivate = vi.fn(() => {
      throw new Error('activation observer failed');
    });
    const descriptor = component({ selection: 'single', onSelect, onActivate, focused: true });
    const [model] = descriptor.init();
    expect(() => descriptor.update({ type: 'vl-click', key: 'item-1' }, model)).not.toThrow();
    const [clicked] = descriptor.update({ type: 'vl-click', key: 'item-1' }, model);
    expect(clicked).toMatchObject({ focusedKey: 'item-1', selectedKey: 'item-1' });
    const [moved] = descriptor.update({ type: 'vl-arrow', direction: 1 }, clicked);
    const [selected] = descriptor.update({ type: 'vl-select' }, moved);
    expect(selected.selectedKey).toBe('item-2');
    expect(() => descriptor.update({ type: 'vl-activate' }, selected)).not.toThrow();
    expect(onSelect).toHaveBeenCalled();
    expect(onActivate).toHaveBeenCalled();
  });

  it('keeps disabled rows inert under pointer messages', () => {
    const onSelect = vi.fn();
    const descriptor = component({
      items: [{ id: 'blocked', label: 'Blocked', disabled: true }, ...items(3)],
      selection: 'single',
      onSelect,
    });
    const [model] = descriptor.init();
    const [clicked] = descriptor.update({ type: 'vl-click', key: 'blocked' }, model);
    expect(clicked).toBe(model);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('preserves nested scrollbar drag until global release and projects its offset', () => {
    const descriptor = component();
    const [model] = descriptor.init();
    const [pressed] = descriptor.update(
      { type: 'vl-scrollbar', msg: { type: 'sb-press', cell: 0, pointer: 10 } },
      model,
    );
    expect(pressed.scrollbar.drag).not.toBeNull();
    expect(pressed.scrollbar.focused).toBe(true);
    expect(pressed.focused).toBe(false);
    const [dragged] = descriptor.update(
      { type: 'vl-scrollbar', msg: { type: 'sb-drag', pointer: 12 } },
      pressed,
    );
    expect(dragged.scrollOffset).toBe(7);
    expect(dragged.scrollbar.drag).not.toBeNull();
    const [released] = descriptor.update({ type: 'vl-scrollbar', msg: { type: 'sb-release' } }, dragged);
    expect(released.scrollOffset).toBe(7);
    expect(released.scrollbar.drag).toBeNull();
    expect(released.scrollbar.focused).toBe(true);
    const [listFocused] = descriptor.update({ type: 'vl-focus' }, released);
    expect(listFocused.focused).toBe(true);
    expect(listFocused.scrollbar.focused).toBe(false);
  });
});

describe('virtualList reconciliation', () => {
  it('preserves focus and selection by key through reorder and clears removed identity', () => {
    const descriptor = component({ selection: 'single' });
    const [model] = descriptor.init();
    const [selected] = descriptor.update({ type: 'vl-click', key: 'item-2' }, model);
    const reordered = [items(4)[3]!, items(4)[2]!, items(4)[1]!, items(4)[0]!];
    const [replaced] = descriptor.update({ type: 'vl-replace-items', items: reordered }, selected);
    expect(replaced).toMatchObject({ focusedKey: 'item-2', selectedKey: 'item-2' });
    expect(replaced.keyIndex.get('item-2')).toBe(1);
    const [shrunk] = descriptor.update({ type: 'vl-replace-items', items: [reordered[0]!] }, replaced);
    expect(shrunk.focusedKey).toBe('item-3');
    expect(shrunk.selectedKey).toBeNull();
    expect(shrunk.scrollOffset).toBe(0);
  });

  it('rejects duplicate replacement keys without mutating the existing model', () => {
    const descriptor = component();
    const [model] = descriptor.init();
    expect(() =>
      descriptor.update(
        {
          type: 'vl-replace-items',
          items: [
            { id: 'dup', label: 'One' },
            { id: 'dup', label: 'Two' },
          ],
        },
        model,
      ),
    ).toThrow('duplicate key "dup"');
    expect(model.items).toHaveLength(10);
  });

  it('sticks strict appends at the tail and counts unseen appends after manual scroll-away', () => {
    const descriptor = component({ items: items(5), viewportRows: 3, scrollAnchor: 'bottom-sticky' });
    const [model] = descriptor.init();
    expect(model).toMatchObject({ scrollOffset: 2, stickyToBottom: true, unseenCount: 0 });
    const [anchoredAppend] = descriptor.update({ type: 'vl-replace-items', items: items(6) }, model);
    expect(anchoredAppend).toMatchObject({ scrollOffset: 3, stickyToBottom: true, unseenCount: 0 });
    const [away] = descriptor.update({ type: 'vl-wheel', direction: -1 }, anchoredAppend);
    expect(away).toMatchObject({ scrollOffset: 0, stickyToBottom: false });
    const [unseen] = descriptor.update({ type: 'vl-replace-items', items: items(8) }, away);
    expect(unseen).toMatchObject({ scrollOffset: 0, stickyToBottom: false, unseenCount: 2 });
    expect(JSON.stringify(descriptor.view(unseen))).toContain('▼ 2 new');
    const [jumped] = descriptor.update({ type: 'vl-jump-bottom' }, unseen);
    expect(jumped).toMatchObject({ scrollOffset: 5, stickyToBottom: true, unseenCount: 0 });
  });

  it('does not project bottom-tail receipts in the default top-anchor mode', () => {
    const descriptor = component({ items: items(5), viewportRows: 3 });
    const [model] = descriptor.init();
    const [appended] = descriptor.update({ type: 'vl-replace-items', items: items(8) }, model);
    expect(appended).toMatchObject({ scrollOffset: 0, stickyToBottom: false, unseenCount: 0 });
    expect(JSON.stringify(descriptor.view(appended))).not.toContain('new');
  });

  it('keeps a sticky tail on responsive viewport changes and clamps malformed sizes', () => {
    const descriptor = component({ items: items(10), viewportRows: 3, scrollAnchor: 'bottom-sticky' });
    const [model] = descriptor.init();
    const [wider] = descriptor.update({ type: 'vl-sync-viewport', viewportRows: 5 }, model);
    expect(wider).toMatchObject({ viewportRows: 5, scrollOffset: 5, stickyToBottom: true });
    const [malformed] = descriptor.update({ type: 'vl-sync-viewport', viewportRows: Number.NaN }, wider);
    expect(malformed).toMatchObject({ viewportRows: 1, scrollOffset: 9, stickyToBottom: true });
  });
});
