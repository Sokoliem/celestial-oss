export interface MenuItem<M = unknown> {
  label: string;
  msg?: M;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
  submenu?: MenuItem<M>[];
  /**
   * Optional right-aligned hint string rendered to the right of the label
   * (eg. status hint, secondary metadata). Distinct from `shortcut`, which
   * renders as a keycap. Phase 0 P0-1 — used by sidebar-library context
   * menu items that show provenance metadata next to the action label.
   */
  hint?: string;
}

export interface SubmenuStackEntry<M = unknown> {
  parentItems: MenuItem<M>[];
  parentIndex: number;
}

export interface ContextMenuState<M = unknown> {
  open: boolean;
  x: number;
  y: number;
  items: MenuItem<M>[];
  selectedIndex: number;
  submenuStack: SubmenuStackEntry<M>[];
}

export const MAX_CONTEXT_MENU_ITEMS = 10_000;
const MAX_CONTEXT_MENU_DEPTH = 32;

export type ContextMenuMsg<M = unknown> =
  | { type: 'ctx-open'; x: number; y: number; items: MenuItem<M>[] }
  | { type: 'ctx-close' }
  | { type: 'ctx-up' }
  | { type: 'ctx-down' }
  | { type: 'ctx-highlight'; index: number }
  | { type: 'ctx-select' }
  | { type: 'ctx-enter-submenu' }
  | { type: 'ctx-exit-submenu' };

export function createContextMenuState<M = unknown>(): ContextMenuState<M> {
  return {
    open: false,
    x: 0,
    y: 0,
    items: [],
    selectedIndex: 0,
    submenuStack: [],
  };
}

/**
 * Find the next non-separator index in a given direction.
 * Wraps around the list. Returns the starting index if all items are separators.
 */
function findNextNonSeparator(items: readonly MenuItem[], currentIndex: number, direction: 1 | -1): number {
  if (items.length === 0) return -1;
  let index = Number.isInteger(currentIndex) ? currentIndex : direction === 1 ? -1 : 0;
  const len = items.length;
  for (let i = 0; i < len; i++) {
    index = (((index + direction) % len) + len) % len;
    const item = items[index];
    if (item && !item.separator && !item.disabled) return index;
  }
  return currentIndex;
}

/**
 * Find the first non-separator index starting from a given position.
 */
function findFirstNonSeparator(items: readonly MenuItem[], startIndex: number): number {
  if (items.length === 0) return -1;
  for (let i = 0; i < items.length; i++) {
    const idx = (startIndex + i) % items.length;
    const item = items[idx];
    if (item && !item.separator && !item.disabled) return idx;
  }
  return -1;
}

function snapshotMenuItems<M>(items: readonly MenuItem<M>[], depth = 0, ancestors = new Set<readonly MenuItem<M>[]>()): MenuItem<M>[] {
  if (depth > MAX_CONTEXT_MENU_DEPTH) throw new RangeError(`Context menus support at most ${MAX_CONTEXT_MENU_DEPTH} submenu levels.`);
  if (items.length > MAX_CONTEXT_MENU_ITEMS) throw new RangeError(`Context menus support at most ${MAX_CONTEXT_MENU_ITEMS} items per level.`);
  if (ancestors.has(items)) throw new TypeError('Context menu submenus must not contain cycles.');

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(items);
  return items.map((item) => ({
    ...item,
    submenu: item.submenu ? snapshotMenuItems(item.submenu, depth + 1, nextAncestors) : undefined,
  }));
}

function menuCoordinate(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100_000, Math.trunc(value))) : 0;
}

export function contextMenuUpdate<M>(msg: ContextMenuMsg<M>, state: ContextMenuState<M>): ContextMenuState<M> {
  switch (msg.type) {
    case 'ctx-open': {
      const items = snapshotMenuItems(msg.items);
      const selectedIndex = findFirstNonSeparator(items, 0);
      return {
        open: true,
        x: menuCoordinate(msg.x),
        y: menuCoordinate(msg.y),
        items,
        selectedIndex,
        submenuStack: [],
      };
    }

    case 'ctx-close':
      return createContextMenuState<M>();

    case 'ctx-down': {
      if (!state.open) return state;
      const activeItems = getActiveItems(state);
      const newIndex = findNextNonSeparator(activeItems, state.selectedIndex, 1);
      return { ...state, selectedIndex: newIndex };
    }

    case 'ctx-up': {
      if (!state.open) return state;
      const activeItems = getActiveItems(state);
      const newIndex = findNextNonSeparator(activeItems, state.selectedIndex, -1);
      return { ...state, selectedIndex: newIndex };
    }

    case 'ctx-highlight': {
      if (!state.open || !Number.isInteger(msg.index)) return state;
      const activeItems = getActiveItems(state);
      const item = activeItems[msg.index];
      if (!item || item.separator || item.disabled || msg.index === state.selectedIndex) return state;
      return { ...state, selectedIndex: msg.index };
    }

    case 'ctx-select':
      // Caller reads the selected item via getSelectedItem()
      return state;

    case 'ctx-enter-submenu': {
      if (!state.open) return state;
      const activeItems = getActiveItems(state);
      const selected = activeItems[state.selectedIndex];
      if (!selected?.submenu || selected.submenu.length === 0) {
        return state;
      }
      const newSelectedIndex = findFirstNonSeparator(selected.submenu, 0);
      return {
        ...state,
        submenuStack: [...state.submenuStack, { parentItems: state.items, parentIndex: state.selectedIndex }],
        items: selected.submenu,
        selectedIndex: newSelectedIndex,
      };
    }

    case 'ctx-exit-submenu': {
      if (!state.open || state.submenuStack.length === 0) return state;
      const newStack = state.submenuStack.slice(0, -1);
      const entry = state.submenuStack[state.submenuStack.length - 1]!;
      return {
        ...state,
        submenuStack: newStack,
        items: entry.parentItems,
        selectedIndex: entry.parentIndex,
      };
    }

    default:
      return state;
  }
}

/** Get the currently active menu items (handles submenu navigation) */
export function getActiveItems<M>(state: ContextMenuState<M>): MenuItem<M>[] {
  return state.items;
}

/** Get the currently selected item */
export function getSelectedItem<M>(state: ContextMenuState<M>): MenuItem<M> | null {
  if (!state.open) return null;
  const activeItems = getActiveItems(state);
  if (state.selectedIndex < 0 || state.selectedIndex >= activeItems.length) {
    return null;
  }
  const selected = activeItems[state.selectedIndex];
  return selected && !selected.separator && !selected.disabled ? selected : null;
}
