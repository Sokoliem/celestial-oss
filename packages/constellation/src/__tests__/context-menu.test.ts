import { describe, expect, expectTypeOf, it } from 'vitest';
import { type ContextMenuState, contextMenuUpdate, createContextMenuState, getActiveItems, getSelectedItem, type MenuItem } from '../context-menu.js';

const sampleItems: MenuItem<string>[] = [
  { label: 'Cut', msg: 'cut', shortcut: 'Ctrl+X' },
  { label: 'Copy', msg: 'copy', shortcut: 'Ctrl+C' },
  { label: 'Paste', msg: 'paste', shortcut: 'Ctrl+V' },
];

const itemsWithSeparator: MenuItem<string>[] = [
  { label: 'Cut', msg: 'cut' },
  { label: 'Copy', msg: 'copy' },
  { separator: true, label: '---' },
  { label: 'Paste', msg: 'paste' },
];

const itemsWithSubmenu: MenuItem<string>[] = [
  { label: 'File', msg: 'file' },
  {
    label: 'Edit',
    submenu: [
      { label: 'Undo', msg: 'undo' },
      { label: 'Redo', msg: 'redo' },
    ],
  },
  { label: 'View', msg: 'view' },
];

describe('createContextMenuState', () => {
  it('starts closed', () => {
    const state = createContextMenuState();
    expect(state.open).toBe(false);
    expect(state.x).toBe(0);
    expect(state.y).toBe(0);
    expect(state.items).toEqual([]);
    expect(state.selectedIndex).toBe(0);
    expect(state.submenuStack).toEqual([]);
  });
});

describe('contextMenuUpdate', () => {
  it('ctx-open sets open state with items', () => {
    const state = createContextMenuState();
    const next = contextMenuUpdate({ type: 'ctx-open', x: 10, y: 20, items: sampleItems }, state);
    expect(next.open).toBe(true);
    expect(next.x).toBe(10);
    expect(next.y).toBe(20);
    expect(next.items).toBe(sampleItems);
    expect(next.selectedIndex).toBe(0);
    expect(next.submenuStack).toEqual([]);
  });

  it('ctx-close resets state', () => {
    let state = createContextMenuState();
    state = contextMenuUpdate({ type: 'ctx-open', x: 10, y: 20, items: sampleItems }, state);
    const next = contextMenuUpdate({ type: 'ctx-close' }, state);
    expect(next.open).toBe(false);
    expect(next.items).toEqual([]);
    expect(next.selectedIndex).toBe(0);
  });

  it('ctx-down increments selectedIndex', () => {
    let state = createContextMenuState();
    state = contextMenuUpdate({ type: 'ctx-open', x: 0, y: 0, items: sampleItems }, state);
    expect(state.selectedIndex).toBe(0);

    state = contextMenuUpdate({ type: 'ctx-down' }, state);
    expect(state.selectedIndex).toBe(1);

    state = contextMenuUpdate({ type: 'ctx-down' }, state);
    expect(state.selectedIndex).toBe(2);
  });

  it('ctx-up decrements selectedIndex', () => {
    let state = createContextMenuState();
    state = contextMenuUpdate({ type: 'ctx-open', x: 0, y: 0, items: sampleItems }, state);

    // Move to index 2 first
    state = contextMenuUpdate({ type: 'ctx-down' }, state);
    state = contextMenuUpdate({ type: 'ctx-down' }, state);
    expect(state.selectedIndex).toBe(2);

    state = contextMenuUpdate({ type: 'ctx-up' }, state);
    expect(state.selectedIndex).toBe(1);
  });

  it('navigation wraps around (down)', () => {
    let state = createContextMenuState();
    state = contextMenuUpdate({ type: 'ctx-open', x: 0, y: 0, items: sampleItems }, state);

    // Move to last item
    state = contextMenuUpdate({ type: 'ctx-down' }, state);
    state = contextMenuUpdate({ type: 'ctx-down' }, state);
    expect(state.selectedIndex).toBe(2);

    // Should wrap to 0
    state = contextMenuUpdate({ type: 'ctx-down' }, state);
    expect(state.selectedIndex).toBe(0);
  });

  it('navigation wraps around (up)', () => {
    let state = createContextMenuState();
    state = contextMenuUpdate({ type: 'ctx-open', x: 0, y: 0, items: sampleItems }, state);
    expect(state.selectedIndex).toBe(0);

    // Should wrap to last item
    state = contextMenuUpdate({ type: 'ctx-up' }, state);
    expect(state.selectedIndex).toBe(2);
  });

  it('navigation skips separators (down)', () => {
    let state = createContextMenuState();
    state = contextMenuUpdate({ type: 'ctx-open', x: 0, y: 0, items: itemsWithSeparator }, state);

    // Move from index 0 to 1
    state = contextMenuUpdate({ type: 'ctx-down' }, state);
    expect(state.selectedIndex).toBe(1);

    // Should skip separator at index 2, go to index 3
    state = contextMenuUpdate({ type: 'ctx-down' }, state);
    expect(state.selectedIndex).toBe(3);
  });

  it('navigation skips separators (up)', () => {
    let state = createContextMenuState();
    state = contextMenuUpdate({ type: 'ctx-open', x: 0, y: 0, items: itemsWithSeparator }, state);

    // Move to last item (index 3, Paste)
    state = contextMenuUpdate({ type: 'ctx-down' }, state);
    state = contextMenuUpdate({ type: 'ctx-down' }, state);
    expect(state.selectedIndex).toBe(3);

    // Going up should skip separator at index 2, land on index 1
    state = contextMenuUpdate({ type: 'ctx-up' }, state);
    expect(state.selectedIndex).toBe(1);
  });

  it('ctx-open skips initial separator', () => {
    const itemsStartingWithSeparator: MenuItem<string>[] = [
      { separator: true, label: '---' },
      { label: 'Cut', msg: 'cut' },
      { label: 'Copy', msg: 'copy' },
    ];
    const state = contextMenuUpdate({ type: 'ctx-open', x: 0, y: 0, items: itemsStartingWithSeparator }, createContextMenuState());
    expect(state.selectedIndex).toBe(1);
  });

  it('ctx-enter-submenu pushes to submenu stack', () => {
    let state = createContextMenuState();
    state = contextMenuUpdate({ type: 'ctx-open', x: 0, y: 0, items: itemsWithSubmenu }, state);

    // Move to "Edit" which has a submenu (index 1)
    state = contextMenuUpdate({ type: 'ctx-down' }, state);
    expect(state.selectedIndex).toBe(1);

    // Enter submenu
    state = contextMenuUpdate({ type: 'ctx-enter-submenu' }, state);
    expect(state.submenuStack.length).toBe(1);
    expect(state.submenuStack[0]!.parentIndex).toBe(1);
    expect(state.items.length).toBe(2); // Undo, Redo
    expect(state.selectedIndex).toBe(0);
  });

  it('ctx-exit-submenu pops from submenu stack', () => {
    let state = createContextMenuState();
    state = contextMenuUpdate({ type: 'ctx-open', x: 0, y: 0, items: itemsWithSubmenu }, state);

    // Navigate to Edit and enter submenu
    state = contextMenuUpdate({ type: 'ctx-down' }, state);
    state = contextMenuUpdate({ type: 'ctx-enter-submenu' }, state);
    expect(state.submenuStack.length).toBe(1);

    // Exit submenu
    state = contextMenuUpdate({ type: 'ctx-exit-submenu' }, state);
    expect(state.submenuStack).toEqual([]);
    expect(state.selectedIndex).toBe(1); // Back to Edit
  });

  it('ctx-enter-submenu does nothing if no submenu', () => {
    let state = createContextMenuState();
    state = contextMenuUpdate({ type: 'ctx-open', x: 0, y: 0, items: sampleItems }, state);
    const prev = state;
    state = contextMenuUpdate({ type: 'ctx-enter-submenu' }, state);
    expect(state).toBe(prev);
  });

  it('ctx-exit-submenu does nothing if stack is empty', () => {
    let state = createContextMenuState();
    state = contextMenuUpdate({ type: 'ctx-open', x: 0, y: 0, items: sampleItems }, state);
    const prev = state;
    state = contextMenuUpdate({ type: 'ctx-exit-submenu' }, state);
    expect(state).toBe(prev);
  });

  it('should restore parent items after exiting submenu (enter-exit round-trip)', () => {
    let state = createContextMenuState();
    state = contextMenuUpdate({ type: 'ctx-open', x: 0, y: 0, items: itemsWithSubmenu }, state);

    // Save original items reference
    const originalItems = state.items;
    expect(originalItems.length).toBe(3); // File, Edit, View

    // Navigate to Edit (index 1) and enter submenu
    state = contextMenuUpdate({ type: 'ctx-down' }, state);
    state = contextMenuUpdate({ type: 'ctx-enter-submenu' }, state);

    // Now inside submenu
    expect(state.items.length).toBe(2); // Undo, Redo
    expect(state.items[0]!.label).toBe('Undo');

    // Exit submenu - parent items MUST be restored
    state = contextMenuUpdate({ type: 'ctx-exit-submenu' }, state);
    expect(state.items.length).toBe(3);
    expect(state.items[0]!.label).toBe('File');
    expect(state.items[1]!.label).toBe('Edit');
    expect(state.items[2]!.label).toBe('View');
    expect(state.selectedIndex).toBe(1); // Back to Edit
  });

  it('should restore parent items through nested submenus', () => {
    const nestedItems: MenuItem<string>[] = [
      { label: 'Top1', msg: 'top1' },
      {
        label: 'Top2',
        submenu: [
          { label: 'Mid1', msg: 'mid1' },
          {
            label: 'Mid2',
            submenu: [
              { label: 'Deep1', msg: 'deep1' },
              { label: 'Deep2', msg: 'deep2' },
            ],
          },
        ],
      },
    ];

    let state = createContextMenuState();
    state = contextMenuUpdate({ type: 'ctx-open', x: 0, y: 0, items: nestedItems }, state);
    expect(state.items.length).toBe(2);

    // Enter first submenu (Top2 at index 1)
    state = contextMenuUpdate({ type: 'ctx-down' }, state);
    state = contextMenuUpdate({ type: 'ctx-enter-submenu' }, state);
    expect(state.items.length).toBe(2); // Mid1, Mid2
    expect(state.items[0]!.label).toBe('Mid1');

    // Enter nested submenu (Mid2 at index 1)
    state = contextMenuUpdate({ type: 'ctx-down' }, state);
    state = contextMenuUpdate({ type: 'ctx-enter-submenu' }, state);
    expect(state.items.length).toBe(2); // Deep1, Deep2
    expect(state.items[0]!.label).toBe('Deep1');

    // Exit back to mid level
    state = contextMenuUpdate({ type: 'ctx-exit-submenu' }, state);
    expect(state.items.length).toBe(2);
    expect(state.items[0]!.label).toBe('Mid1');
    expect(state.items[1]!.label).toBe('Mid2');

    // Exit back to top level
    state = contextMenuUpdate({ type: 'ctx-exit-submenu' }, state);
    expect(state.items.length).toBe(2);
    expect(state.items[0]!.label).toBe('Top1');
    expect(state.items[1]!.label).toBe('Top2');
  });
});

describe('disabled items', () => {
  const itemsWithDisabled: MenuItem<string>[] = [
    { label: 'Cut', msg: 'cut' },
    { label: 'Copy', msg: 'copy', disabled: true },
    { label: 'Paste', msg: 'paste' },
  ];

  it('should skip disabled items when navigating down', () => {
    let state = createContextMenuState();
    state = contextMenuUpdate({ type: 'ctx-open', x: 0, y: 0, items: itemsWithDisabled }, state);
    expect(state.selectedIndex).toBe(0); // Cut
    // Navigate down should skip disabled Copy (index 1) and go to Paste (index 2)
    state = contextMenuUpdate({ type: 'ctx-down' }, state);
    expect(state.selectedIndex).toBe(2); // Paste, not Copy
  });

  it('should skip disabled items when navigating up', () => {
    let state = createContextMenuState();
    state = contextMenuUpdate({ type: 'ctx-open', x: 0, y: 0, items: itemsWithDisabled }, state);
    // Navigate to Paste (index 2)
    state = contextMenuUpdate({ type: 'ctx-down' }, state);
    expect(state.selectedIndex).toBe(2);
    // Navigate up should skip disabled Copy (index 1) and go to Cut (index 0)
    state = contextMenuUpdate({ type: 'ctx-up' }, state);
    expect(state.selectedIndex).toBe(0); // Cut, not Copy
  });

  it('should skip disabled items on initial open', () => {
    const itemsStartingDisabled: MenuItem<string>[] = [
      { label: 'Disabled', msg: 'disabled', disabled: true },
      { label: 'Enabled', msg: 'enabled' },
    ];
    const state = contextMenuUpdate({ type: 'ctx-open', x: 0, y: 0, items: itemsStartingDisabled }, createContextMenuState());
    expect(state.selectedIndex).toBe(1); // Should skip disabled first item
  });
});

describe('getSelectedItem', () => {
  it('returns correct item', () => {
    let state = createContextMenuState();
    state = contextMenuUpdate({ type: 'ctx-open', x: 0, y: 0, items: sampleItems }, state);
    expect(getSelectedItem(state)).toBe(sampleItems[0]);

    state = contextMenuUpdate({ type: 'ctx-down' }, state);
    expect(getSelectedItem(state)).toBe(sampleItems[1]);
  });

  it('returns null when closed', () => {
    const state = createContextMenuState();
    expect(getSelectedItem(state)).toBeNull();
  });
});

describe('getActiveItems', () => {
  it('returns top-level items when no submenu', () => {
    let state = createContextMenuState<string>();
    state = contextMenuUpdate({ type: 'ctx-open', x: 0, y: 0, items: sampleItems }, state);
    expect(getActiveItems(state)).toBe(sampleItems);
  });

  it('returns submenu items when in submenu', () => {
    let state = createContextMenuState<string>();
    state = contextMenuUpdate({ type: 'ctx-open', x: 0, y: 0, items: itemsWithSubmenu }, state);

    // Enter Edit submenu
    state = contextMenuUpdate({ type: 'ctx-down' }, state);
    state = contextMenuUpdate({ type: 'ctx-enter-submenu' }, state);

    const active = getActiveItems(state);
    expect(active.length).toBe(2);
    expect(active[0]!.label).toBe('Undo');
    expect(active[1]!.label).toBe('Redo');
  });
});

describe('generic type preservation through submenu round-trip', () => {
  it('should preserve M type on getSelectedItem after submenu exit', () => {
    let state = createContextMenuState<string>();
    state = contextMenuUpdate({ type: 'ctx-open', x: 0, y: 0, items: itemsWithSubmenu }, state);

    // Enter Edit submenu (index 1)
    state = contextMenuUpdate({ type: 'ctx-down' }, state);
    state = contextMenuUpdate({ type: 'ctx-enter-submenu' }, state);

    // Select an item inside the submenu
    const submenuItem = getSelectedItem(state);
    expect(submenuItem).not.toBeNull();
    expect(submenuItem!.msg).toBe('undo');

    // Exit submenu - the parent items must retain their M type
    state = contextMenuUpdate({ type: 'ctx-exit-submenu' }, state);

    const restored = getSelectedItem(state);
    expect(restored).not.toBeNull();
    expect(restored!.label).toBe('Edit');
    // The msg field must be accessible as the original M type (string), not unknown
    expect(restored!.msg).toBeUndefined(); // Edit has no msg, but it's typed MenuItem<string>

    // Navigate to File (index 0) which has msg: 'file'
    state = contextMenuUpdate({ type: 'ctx-up' }, state);
    const fileItem = getSelectedItem(state);
    expect(fileItem).not.toBeNull();
    expect(fileItem!.msg).toBe('file');
  });

  it('should have ContextMenuState generic parameter flow through all APIs', () => {
    const state = createContextMenuState<string>();

    // ContextMenuState<string> should carry the string generic
    expectTypeOf(state).toMatchTypeOf<ContextMenuState<string>>();

    // After update, state should still be ContextMenuState<string>
    const opened = contextMenuUpdate({ type: 'ctx-open', x: 0, y: 0, items: sampleItems }, state);
    expectTypeOf(opened).toMatchTypeOf<ContextMenuState<string>>();

    // getSelectedItem should return MenuItem<string> | null
    const item = getSelectedItem(opened);
    expectTypeOf(item).toMatchTypeOf<MenuItem<string> | null>();

    // getActiveItems should return MenuItem<string>[]
    const items = getActiveItems(opened);
    expectTypeOf(items).toMatchTypeOf<MenuItem<string>[]>();
  });

  it('should preserve M type through nested submenu stack entries', () => {
    const nestedItems: MenuItem<string>[] = [
      { label: 'Top1', msg: 'top1' },
      {
        label: 'Top2',
        submenu: [
          { label: 'Mid1', msg: 'mid1' },
          {
            label: 'Mid2',
            submenu: [
              { label: 'Deep1', msg: 'deep1' },
              { label: 'Deep2', msg: 'deep2' },
            ],
          },
        ],
      },
    ];

    let state = createContextMenuState<string>();
    state = contextMenuUpdate({ type: 'ctx-open', x: 0, y: 0, items: nestedItems }, state);

    // Enter first submenu
    state = contextMenuUpdate({ type: 'ctx-down' }, state);
    state = contextMenuUpdate({ type: 'ctx-enter-submenu' }, state);

    // Enter nested submenu
    state = contextMenuUpdate({ type: 'ctx-down' }, state);
    state = contextMenuUpdate({ type: 'ctx-enter-submenu' }, state);

    // Deep item should be typed MenuItem<string>
    const deep = getSelectedItem(state);
    expect(deep).not.toBeNull();
    expect(deep!.msg).toBe('deep1');

    // Exit back to mid level -- parentIndex was 1 (Mid2), so selection lands on Mid2
    state = contextMenuUpdate({ type: 'ctx-exit-submenu' }, state);
    const mid = getSelectedItem(state);
    expect(mid).not.toBeNull();
    expect(mid!.label).toBe('Mid2');

    // Exit back to top level
    state = contextMenuUpdate({ type: 'ctx-exit-submenu' }, state);
    const top = getSelectedItem(state);
    expect(top).not.toBeNull();
    // parentIndex was 1 (Top2)
    expect(top!.label).toBe('Top2');

    // Navigate to Top1 to verify msg type is preserved
    state = contextMenuUpdate({ type: 'ctx-up' }, state);
    const top1 = getSelectedItem(state);
    expect(top1).not.toBeNull();
    expect(top1!.msg).toBe('top1');
  });
});
