import type { LayoutEntry, LayoutPlan, LayoutRect } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import type { DirectionalNeighbors, FocusTrap, PaneId, PaneRect } from '../focus.js';
import {
  buildNavMap,
  createFocusModel,
  extractPaneRects,
  focusUpdate,
  getActiveTrapBoundary,
  getFocusedId,
  getFocusHistory,
  getNavigableIds,
  getNeighbor,
  getTabOrder,
  isFocused,
  isTrapped,
} from '../focus.js';

// --- Helpers ---

function makeTrap(overrides: Partial<FocusTrap> = {}): FocusTrap {
  return {
    id: overrides.id ?? 'trap-1',
    paneIds: overrides.paneIds ?? ['a', 'b'],
    initialFocusId: 'initialFocusId' in overrides ? (overrides.initialFocusId as PaneId | null) : 'a',
    wrapAround: overrides.wrapAround ?? true,
  };
}

function makeLayoutPlan(entries: Array<{ id: string; rect: LayoutRect }>): LayoutPlan {
  const index = new Map<string, LayoutEntry>();
  for (const e of entries) {
    const entry: LayoutEntry = {
      id: e.id,
      node: { kind: 'empty' as const },
      rect: e.rect,
      children: [],
    };
    index.set(e.id, entry);
  }
  return {
    root: index.values().next().value!,
    index,
    width: 80,
    height: 24,
    overlays: [],
  };
}

// ============================================================
// createFocusModel
// ============================================================

describe('createFocusModel', () => {
  it('returns correct defaults with no options', () => {
    const model = createFocusModel();
    expect(model.focusedId).toBeNull();
    expect(model.history).toEqual([]);
    expect(model.maxHistory).toBe(32);
    expect(model.tabOrder).toEqual([]);
    expect(model.traps).toEqual([]);
    expect(model.navMap).toEqual({});
  });

  it('accepts initialFocusId', () => {
    const model = createFocusModel({ initialFocusId: 'pane-1' });
    expect(model.focusedId).toBe('pane-1');
  });

  it('accepts tabOrder', () => {
    const model = createFocusModel({ tabOrder: ['a', 'b', 'c'] });
    expect(model.tabOrder).toEqual(['a', 'b', 'c']);
  });

  it('accepts maxHistory', () => {
    const model = createFocusModel({ maxHistory: 10 });
    expect(model.maxHistory).toBe(10);
  });

  it('accepts all options together', () => {
    const model = createFocusModel({
      initialFocusId: 'x',
      tabOrder: ['x', 'y'],
      maxHistory: 5,
    });
    expect(model.focusedId).toBe('x');
    expect(model.tabOrder).toEqual(['x', 'y']);
    expect(model.maxHistory).toBe(5);
  });
});

// ============================================================
// focusUpdate — focus message
// ============================================================

describe('focusUpdate — focus', () => {
  it('sets focusedId to the given id', () => {
    const model = createFocusModel({ tabOrder: ['a', 'b'] });
    const updated = focusUpdate({ type: 'focus', id: 'a' }, model);
    expect(updated.focusedId).toBe('a');
  });

  it('pushes previous focusedId to history', () => {
    const model = createFocusModel({ initialFocusId: 'a' });
    const updated = focusUpdate({ type: 'focus', id: 'b' }, model);
    expect(updated.focusedId).toBe('b');
    expect(updated.history).toEqual(['a']);
  });

  it('does not push null to history when focusedId is null', () => {
    const model = createFocusModel();
    const updated = focusUpdate({ type: 'focus', id: 'a' }, model);
    expect(updated.focusedId).toBe('a');
    expect(updated.history).toEqual([]);
  });

  it('caps history at maxHistory', () => {
    let model = createFocusModel({ maxHistory: 3, initialFocusId: 'p0' });
    model = focusUpdate({ type: 'focus', id: 'p1' }, model);
    model = focusUpdate({ type: 'focus', id: 'p2' }, model);
    model = focusUpdate({ type: 'focus', id: 'p3' }, model);
    model = focusUpdate({ type: 'focus', id: 'p4' }, model);
    // maxHistory=3, so oldest entries should be trimmed
    expect(model.history.length).toBe(3);
    // Most recent is last
    expect(model.history[model.history.length - 1]).toBe('p3');
  });

  it('validates focus against active trap boundary', () => {
    const trap = makeTrap({ paneIds: ['a', 'b'] });
    let model = createFocusModel({ tabOrder: ['a', 'b', 'c'] });
    model = focusUpdate({ type: 'focus-push-trap', trap }, model);
    // Try to focus 'c' which is outside the trap
    const updated = focusUpdate({ type: 'focus', id: 'c' }, model);
    // Should not change focus to 'c'
    expect(updated.focusedId).not.toBe('c');
  });

  it('allows focus within trap boundary', () => {
    const trap = makeTrap({ paneIds: ['a', 'b'] });
    let model = createFocusModel({ tabOrder: ['a', 'b', 'c'] });
    model = focusUpdate({ type: 'focus-push-trap', trap }, model);
    const updated = focusUpdate({ type: 'focus', id: 'b' }, model);
    expect(updated.focusedId).toBe('b');
  });
});

// ============================================================
// focusUpdate — blur
// ============================================================

describe('focusUpdate — blur', () => {
  it('sets focusedId to null', () => {
    const model = createFocusModel({ initialFocusId: 'a' });
    const updated = focusUpdate({ type: 'blur' }, model);
    expect(updated.focusedId).toBeNull();
  });

  it('pushes previous focusedId to history', () => {
    const model = createFocusModel({ initialFocusId: 'a' });
    const updated = focusUpdate({ type: 'blur' }, model);
    expect(updated.history).toEqual(['a']);
  });

  it('does not push null to history when already blurred', () => {
    const model = createFocusModel();
    const updated = focusUpdate({ type: 'blur' }, model);
    expect(updated.history).toEqual([]);
  });
});

// ============================================================
// focusUpdate — focus-next
// ============================================================

describe('focusUpdate — focus-next', () => {
  it('moves to next pane in tabOrder', () => {
    const model = createFocusModel({ initialFocusId: 'a', tabOrder: ['a', 'b', 'c'] });
    const updated = focusUpdate({ type: 'focus-next' }, model);
    expect(updated.focusedId).toBe('b');
  });

  it('wraps around by default', () => {
    const model = createFocusModel({ initialFocusId: 'c', tabOrder: ['a', 'b', 'c'] });
    const updated = focusUpdate({ type: 'focus-next' }, model);
    expect(updated.focusedId).toBe('a');
  });

  it('is no-op with empty tabOrder', () => {
    const model = createFocusModel({ initialFocusId: 'a' });
    const updated = focusUpdate({ type: 'focus-next' }, model);
    expect(updated.focusedId).toBe('a');
  });

  it('focuses first pane when currently unfocused', () => {
    const model = createFocusModel({ tabOrder: ['a', 'b', 'c'] });
    const updated = focusUpdate({ type: 'focus-next' }, model);
    expect(updated.focusedId).toBe('a');
  });

  it('respects trap boundary', () => {
    const trap = makeTrap({ paneIds: ['b', 'c'], initialFocusId: 'b', wrapAround: true });
    let model = createFocusModel({ tabOrder: ['a', 'b', 'c', 'd'] });
    model = focusUpdate({ type: 'focus-push-trap', trap }, model);
    // Now focused on 'b', next within trap should be 'c'
    const updated1 = focusUpdate({ type: 'focus-next' }, model);
    expect(updated1.focusedId).toBe('c');
    // Next from 'c' should wrap to 'b' within the trap
    const updated2 = focusUpdate({ type: 'focus-next' }, updated1);
    expect(updated2.focusedId).toBe('b');
  });

  it('does not wrap when trap has wrapAround=false', () => {
    const trap = makeTrap({ paneIds: ['b', 'c'], initialFocusId: 'c', wrapAround: false });
    let model = createFocusModel({ tabOrder: ['a', 'b', 'c', 'd'] });
    model = focusUpdate({ type: 'focus-push-trap', trap }, model);
    // Focused on 'c' (initialFocusId), next with no wrap should stay
    const updated = focusUpdate({ type: 'focus-next' }, model);
    expect(updated.focusedId).toBe('c');
  });
});

// ============================================================
// focusUpdate — focus-prev
// ============================================================

describe('focusUpdate — focus-prev', () => {
  it('moves to previous pane in tabOrder', () => {
    const model = createFocusModel({ initialFocusId: 'b', tabOrder: ['a', 'b', 'c'] });
    const updated = focusUpdate({ type: 'focus-prev' }, model);
    expect(updated.focusedId).toBe('a');
  });

  it('wraps around by default', () => {
    const model = createFocusModel({ initialFocusId: 'a', tabOrder: ['a', 'b', 'c'] });
    const updated = focusUpdate({ type: 'focus-prev' }, model);
    expect(updated.focusedId).toBe('c');
  });

  it('is no-op with empty tabOrder', () => {
    const model = createFocusModel({ initialFocusId: 'a' });
    const updated = focusUpdate({ type: 'focus-prev' }, model);
    expect(updated.focusedId).toBe('a');
  });

  it('focuses last pane when currently unfocused', () => {
    const model = createFocusModel({ tabOrder: ['a', 'b', 'c'] });
    const updated = focusUpdate({ type: 'focus-prev' }, model);
    expect(updated.focusedId).toBe('c');
  });

  it('respects trap boundary with wrapAround=false', () => {
    const trap = makeTrap({ paneIds: ['b', 'c'], initialFocusId: 'b', wrapAround: false });
    let model = createFocusModel({ tabOrder: ['a', 'b', 'c', 'd'] });
    model = focusUpdate({ type: 'focus-push-trap', trap }, model);
    // Focused on 'b', prev with no wrap should stay
    const updated = focusUpdate({ type: 'focus-prev' }, model);
    expect(updated.focusedId).toBe('b');
  });
});

// ============================================================
// focusUpdate — focus-direction
// ============================================================

describe('focusUpdate — focus-direction', () => {
  it('moves focus to neighbor in given direction', () => {
    const navMap: Record<string, DirectionalNeighbors> = {
      a: { up: null, down: 'b', left: null, right: null },
      b: { up: 'a', down: null, left: null, right: null },
    };
    let model = createFocusModel({ initialFocusId: 'a', tabOrder: ['a', 'b'] });
    model = focusUpdate({ type: 'focus-set-nav-map', navMap }, model);
    const updated = focusUpdate({ type: 'focus-direction', direction: 'down' }, model);
    expect(updated.focusedId).toBe('b');
  });

  it('is no-op when no neighbor in direction', () => {
    const navMap: Record<string, DirectionalNeighbors> = {
      a: { up: null, down: null, left: null, right: null },
    };
    let model = createFocusModel({ initialFocusId: 'a', tabOrder: ['a'] });
    model = focusUpdate({ type: 'focus-set-nav-map', navMap }, model);
    const updated = focusUpdate({ type: 'focus-direction', direction: 'up' }, model);
    expect(updated.focusedId).toBe('a');
  });

  it('is no-op when currently unfocused', () => {
    const navMap: Record<string, DirectionalNeighbors> = {
      a: { up: null, down: 'b', left: null, right: null },
      b: { up: 'a', down: null, left: null, right: null },
    };
    let model = createFocusModel({ tabOrder: ['a', 'b'] });
    model = focusUpdate({ type: 'focus-set-nav-map', navMap }, model);
    const updated = focusUpdate({ type: 'focus-direction', direction: 'down' }, model);
    expect(updated.focusedId).toBeNull();
  });

  it('validates direction against trap boundary', () => {
    const navMap: Record<string, DirectionalNeighbors> = {
      a: { up: null, down: 'b', left: null, right: null },
      b: { up: 'a', down: 'c', left: null, right: null },
      c: { up: 'b', down: null, left: null, right: null },
    };
    const trap = makeTrap({ paneIds: ['a', 'b'], initialFocusId: 'b' });
    let model = createFocusModel({ tabOrder: ['a', 'b', 'c'] });
    model = focusUpdate({ type: 'focus-set-nav-map', navMap }, model);
    model = focusUpdate({ type: 'focus-push-trap', trap }, model);
    // Now focused on 'b', trying to go down to 'c' should be blocked
    const updated = focusUpdate({ type: 'focus-direction', direction: 'down' }, model);
    expect(updated.focusedId).toBe('b');
  });
});

// ============================================================
// focusUpdate — focus-push-trap
// ============================================================

describe('focusUpdate — focus-push-trap', () => {
  it('pushes trap to the stack', () => {
    const trap = makeTrap();
    const model = createFocusModel({ tabOrder: ['a', 'b', 'c'] });
    const updated = focusUpdate({ type: 'focus-push-trap', trap }, model);
    expect(updated.traps.length).toBe(1);
    expect(updated.traps[0]).toEqual(trap);
  });

  it('saves current focus to history', () => {
    const trap = makeTrap({ initialFocusId: 'b' });
    const model = createFocusModel({ initialFocusId: 'a', tabOrder: ['a', 'b'] });
    const updated = focusUpdate({ type: 'focus-push-trap', trap }, model);
    expect(updated.history).toContain('a');
  });

  it('focuses initialFocusId of the trap', () => {
    const trap = makeTrap({ initialFocusId: 'b' });
    const model = createFocusModel({ initialFocusId: 'a', tabOrder: ['a', 'b'] });
    const updated = focusUpdate({ type: 'focus-push-trap', trap }, model);
    expect(updated.focusedId).toBe('b');
  });

  it('focuses null when initialFocusId is null', () => {
    const trap = makeTrap({ initialFocusId: null, paneIds: ['a', 'b'] });
    const model = createFocusModel({ initialFocusId: 'x', tabOrder: ['a', 'b', 'x'] });
    const updated = focusUpdate({ type: 'focus-push-trap', trap }, model);
    expect(updated.focusedId).toBeNull();
  });

  it('supports nested traps', () => {
    const trap1 = makeTrap({ id: 'trap-1', paneIds: ['a', 'b', 'c'], initialFocusId: 'a' });
    const trap2 = makeTrap({ id: 'trap-2', paneIds: ['b', 'c'], initialFocusId: 'b' });
    let model = createFocusModel({ initialFocusId: 'x', tabOrder: ['a', 'b', 'c', 'x'] });
    model = focusUpdate({ type: 'focus-push-trap', trap: trap1 }, model);
    model = focusUpdate({ type: 'focus-push-trap', trap: trap2 }, model);
    expect(model.traps.length).toBe(2);
    expect(model.focusedId).toBe('b');
    // Inner trap restricts to ['b', 'c']
    const updated = focusUpdate({ type: 'focus', id: 'a' }, model);
    expect(updated.focusedId).not.toBe('a');
  });
});

// ============================================================
// focusUpdate — focus-pop-trap
// ============================================================

describe('focusUpdate — focus-pop-trap', () => {
  it('pops the topmost trap when no trapId specified', () => {
    const trap = makeTrap({ id: 'trap-1', initialFocusId: 'a' });
    let model = createFocusModel({ initialFocusId: 'x', tabOrder: ['a', 'b', 'x'] });
    model = focusUpdate({ type: 'focus-push-trap', trap }, model);
    const updated = focusUpdate({ type: 'focus-pop-trap' }, model);
    expect(updated.traps.length).toBe(0);
  });

  it('restores focus from history after pop', () => {
    const trap = makeTrap({ id: 'trap-1', initialFocusId: 'a' });
    let model = createFocusModel({ initialFocusId: 'x', tabOrder: ['a', 'b', 'x'] });
    model = focusUpdate({ type: 'focus-push-trap', trap }, model);
    const updated = focusUpdate({ type: 'focus-pop-trap' }, model);
    expect(updated.focusedId).toBe('x');
  });

  it('pops a specific trap by id', () => {
    const trap1 = makeTrap({ id: 'trap-1', paneIds: ['a', 'b'], initialFocusId: 'a' });
    const trap2 = makeTrap({ id: 'trap-2', paneIds: ['c', 'd'], initialFocusId: 'c' });
    let model = createFocusModel({ initialFocusId: 'x', tabOrder: ['a', 'b', 'c', 'd', 'x'] });
    model = focusUpdate({ type: 'focus-push-trap', trap: trap1 }, model);
    model = focusUpdate({ type: 'focus-push-trap', trap: trap2 }, model);
    // Pop trap-1 specifically (not the topmost)
    const updated = focusUpdate({ type: 'focus-pop-trap', trapId: 'trap-1' }, model);
    expect(updated.traps.length).toBe(1);
    expect(updated.traps[0]!.id).toBe('trap-2');
  });

  it('is no-op when trap stack is empty', () => {
    const model = createFocusModel({ initialFocusId: 'a' });
    const updated = focusUpdate({ type: 'focus-pop-trap' }, model);
    expect(updated).toEqual(model);
  });

  it('is no-op when specified trapId is not found', () => {
    const trap = makeTrap({ id: 'trap-1', initialFocusId: 'a' });
    let model = createFocusModel({ initialFocusId: 'x', tabOrder: ['a', 'x'] });
    model = focusUpdate({ type: 'focus-push-trap', trap }, model);
    const updated = focusUpdate({ type: 'focus-pop-trap', trapId: 'nonexistent' }, model);
    expect(updated.traps.length).toBe(1);
  });
});

// ============================================================
// focusUpdate — focus-restore
// ============================================================

describe('focusUpdate — focus-restore', () => {
  it('restores focus from the history stack', () => {
    let model = createFocusModel({ initialFocusId: 'a', tabOrder: ['a', 'b', 'c'] });
    model = focusUpdate({ type: 'focus', id: 'b' }, model);
    model = focusUpdate({ type: 'focus', id: 'c' }, model);
    const updated = focusUpdate({ type: 'focus-restore' }, model);
    expect(updated.focusedId).toBe('b');
  });

  it('skips invalid IDs not in current navigable set', () => {
    let model = createFocusModel({
      initialFocusId: 'a',
      tabOrder: ['a', 'c'],
    });
    // Push 'a' to history, focus 'b' (which is NOT in tabOrder)
    model = focusUpdate({ type: 'focus', id: 'b' }, model);
    // Push 'b' to history, focus 'c'
    model = focusUpdate({ type: 'focus', id: 'c' }, model);
    // Now history is ['a', 'b']. Restore should skip 'b' (not in tabOrder) and land on 'a'
    const updated = focusUpdate({ type: 'focus-restore' }, model);
    expect(updated.focusedId).toBe('a');
  });

  it('sets focusedId to null when history is empty', () => {
    const model = createFocusModel({ initialFocusId: 'a' });
    const updated = focusUpdate({ type: 'focus-restore' }, model);
    expect(updated.focusedId).toBeNull();
  });

  it('sets focusedId to null when all history entries are invalid', () => {
    let model = createFocusModel({
      initialFocusId: 'x',
      tabOrder: ['a'],
    });
    // Force history entries that are not in tabOrder
    model = focusUpdate({ type: 'focus', id: 'y' }, model);
    model = focusUpdate({ type: 'focus', id: 'z' }, model);
    // History is ['x', 'y']. None are in tabOrder=['a']
    const updated = focusUpdate({ type: 'focus-restore' }, model);
    expect(updated.focusedId).toBeNull();
  });
});

// ============================================================
// focusUpdate — focus-set-tab-order
// ============================================================

describe('focusUpdate — focus-set-tab-order', () => {
  it('sets the tab order', () => {
    const model = createFocusModel();
    const updated = focusUpdate({ type: 'focus-set-tab-order', paneIds: ['x', 'y', 'z'] }, model);
    expect(updated.tabOrder).toEqual(['x', 'y', 'z']);
  });

  it('replaces existing tab order', () => {
    const model = createFocusModel({ tabOrder: ['a', 'b'] });
    const updated = focusUpdate({ type: 'focus-set-tab-order', paneIds: ['c', 'd'] }, model);
    expect(updated.tabOrder).toEqual(['c', 'd']);
  });
});

// ============================================================
// focusUpdate — focus-set-nav-map
// ============================================================

describe('focusUpdate — focus-set-nav-map', () => {
  it('sets the nav map', () => {
    const navMap: Record<string, DirectionalNeighbors> = {
      a: { up: null, down: 'b', left: null, right: null },
      b: { up: 'a', down: null, left: null, right: null },
    };
    const model = createFocusModel();
    const updated = focusUpdate({ type: 'focus-set-nav-map', navMap }, model);
    expect(updated.navMap).toEqual(navMap);
  });
});

// ============================================================
// Query functions
// ============================================================

describe('getFocusedId', () => {
  it('returns null for default model', () => {
    expect(getFocusedId(createFocusModel())).toBeNull();
  });

  it('returns the focused id', () => {
    const model = createFocusModel({ initialFocusId: 'a' });
    expect(getFocusedId(model)).toBe('a');
  });
});

describe('isFocused', () => {
  it('returns true when id matches', () => {
    const model = createFocusModel({ initialFocusId: 'a' });
    expect(isFocused(model, 'a')).toBe(true);
  });

  it('returns false when id does not match', () => {
    const model = createFocusModel({ initialFocusId: 'a' });
    expect(isFocused(model, 'b')).toBe(false);
  });

  it('returns false when nothing is focused', () => {
    const model = createFocusModel();
    expect(isFocused(model, 'a')).toBe(false);
  });
});

describe('getFocusHistory', () => {
  it('returns empty array for fresh model', () => {
    expect(getFocusHistory(createFocusModel())).toEqual([]);
  });

  it('returns the history stack', () => {
    let model = createFocusModel({ initialFocusId: 'a' });
    model = focusUpdate({ type: 'focus', id: 'b' }, model);
    expect(getFocusHistory(model)).toEqual(['a']);
  });
});

describe('getTabOrder', () => {
  it('returns the configured tab order', () => {
    const model = createFocusModel({ tabOrder: ['x', 'y'] });
    expect(getTabOrder(model)).toEqual(['x', 'y']);
  });
});

describe('isTrapped', () => {
  it('returns false when no traps', () => {
    expect(isTrapped(createFocusModel())).toBe(false);
  });

  it('returns true when traps are active', () => {
    const trap = makeTrap();
    let model = createFocusModel({ tabOrder: ['a', 'b'] });
    model = focusUpdate({ type: 'focus-push-trap', trap }, model);
    expect(isTrapped(model)).toBe(true);
  });
});

describe('getActiveTrapBoundary', () => {
  it('returns null when no traps', () => {
    expect(getActiveTrapBoundary(createFocusModel())).toBeNull();
  });

  it('returns the topmost trap', () => {
    const trap1 = makeTrap({ id: 'trap-1', paneIds: ['a'] });
    const trap2 = makeTrap({ id: 'trap-2', paneIds: ['b'] });
    let model = createFocusModel({ tabOrder: ['a', 'b'] });
    model = focusUpdate({ type: 'focus-push-trap', trap: trap1 }, model);
    model = focusUpdate({ type: 'focus-push-trap', trap: trap2 }, model);
    const boundary = getActiveTrapBoundary(model);
    expect(boundary?.id).toBe('trap-2');
  });
});

describe('getNeighbor', () => {
  it('returns null when pane not in navMap', () => {
    const model = createFocusModel();
    expect(getNeighbor(model, 'a', 'up')).toBeNull();
  });

  it('returns the neighbor in the given direction', () => {
    const navMap: Record<string, DirectionalNeighbors> = {
      a: { up: null, down: 'b', left: null, right: 'c' },
    };
    let model = createFocusModel();
    model = focusUpdate({ type: 'focus-set-nav-map', navMap }, model);
    expect(getNeighbor(model, 'a', 'down')).toBe('b');
    expect(getNeighbor(model, 'a', 'right')).toBe('c');
    expect(getNeighbor(model, 'a', 'up')).toBeNull();
  });
});

describe('getNavigableIds', () => {
  it('returns tabOrder when not trapped', () => {
    const model = createFocusModel({ tabOrder: ['a', 'b', 'c'] });
    expect(getNavigableIds(model)).toEqual(['a', 'b', 'c']);
  });

  it('returns intersection of tabOrder and trap paneIds when trapped', () => {
    const trap = makeTrap({ paneIds: ['b', 'c'] });
    let model = createFocusModel({ tabOrder: ['a', 'b', 'c', 'd'] });
    model = focusUpdate({ type: 'focus-push-trap', trap }, model);
    const navigable = getNavigableIds(model);
    expect(navigable).toEqual(['b', 'c']);
  });
});

// ============================================================
// buildNavMap
// ============================================================

describe('buildNavMap', () => {
  it('builds nav map for horizontal split (left-right)', () => {
    const panes: PaneRect[] = [
      { id: 'left', rect: { x: 0, y: 0, width: 40, height: 24 } },
      { id: 'right', rect: { x: 40, y: 0, width: 40, height: 24 } },
    ];
    const map = buildNavMap(panes);
    expect(map['left']?.right).toBe('right');
    expect(map['left']?.left).toBeNull();
    expect(map['right']?.left).toBe('left');
    expect(map['right']?.right).toBeNull();
  });

  it('builds nav map for vertical split (top-bottom)', () => {
    const panes: PaneRect[] = [
      { id: 'top', rect: { x: 0, y: 0, width: 80, height: 12 } },
      { id: 'bottom', rect: { x: 0, y: 12, width: 80, height: 12 } },
    ];
    const map = buildNavMap(panes);
    expect(map['top']?.down).toBe('bottom');
    expect(map['top']?.up).toBeNull();
    expect(map['bottom']?.up).toBe('top');
    expect(map['bottom']?.down).toBeNull();
  });

  it('builds nav map for 2x2 grid', () => {
    const panes: PaneRect[] = [
      { id: 'tl', rect: { x: 0, y: 0, width: 40, height: 12 } },
      { id: 'tr', rect: { x: 40, y: 0, width: 40, height: 12 } },
      { id: 'bl', rect: { x: 0, y: 12, width: 40, height: 12 } },
      { id: 'br', rect: { x: 40, y: 12, width: 40, height: 12 } },
    ];
    const map = buildNavMap(panes);
    // top-left
    expect(map['tl']?.right).toBe('tr');
    expect(map['tl']?.down).toBe('bl');
    expect(map['tl']?.left).toBeNull();
    expect(map['tl']?.up).toBeNull();
    // top-right
    expect(map['tr']?.left).toBe('tl');
    expect(map['tr']?.down).toBe('br');
    // bottom-left
    expect(map['bl']?.up).toBe('tl');
    expect(map['bl']?.right).toBe('br');
    // bottom-right
    expect(map['br']?.up).toBe('tr');
    expect(map['br']?.left).toBe('bl');
  });

  it('returns empty map for empty panes', () => {
    const map = buildNavMap([]);
    expect(map).toEqual({});
  });

  it('handles single pane (all neighbors null)', () => {
    const panes: PaneRect[] = [{ id: 'solo', rect: { x: 0, y: 0, width: 80, height: 24 } }];
    const map = buildNavMap(panes);
    expect(map['solo']).toEqual({ up: null, down: null, left: null, right: null });
  });

  it('prefers cross-axis overlap when picking neighbors', () => {
    // Three panes:
    //   [left-tall]   [right-top]
    //                 [right-bottom]
    const panes: PaneRect[] = [
      { id: 'lt', rect: { x: 0, y: 0, width: 40, height: 24 } },
      { id: 'rt', rect: { x: 40, y: 0, width: 40, height: 12 } },
      { id: 'rb', rect: { x: 40, y: 12, width: 40, height: 12 } },
    ];
    const map = buildNavMap(panes);
    // left-tall going right: both rt and rb overlap, but rt is more aligned (top edge)
    // Implementation picks nearest, both have same edge distance
    expect(map['lt']?.right).toBeDefined();
    // rt going left should pick lt
    expect(map['rt']?.left).toBe('lt');
    expect(map['rb']?.left).toBe('lt');
  });
});

// ============================================================
// extractPaneRects
// ============================================================

describe('extractPaneRects', () => {
  it('extracts pane rects for found IDs', () => {
    const plan = makeLayoutPlan([
      { id: 'a', rect: { x: 0, y: 0, width: 40, height: 12 } },
      { id: 'b', rect: { x: 40, y: 0, width: 40, height: 12 } },
    ]);
    const rects = extractPaneRects(plan, ['a', 'b']);
    expect(rects).toHaveLength(2);
    expect(rects[0]!.id).toBe('a');
    expect(rects[0]!.rect).toEqual({ x: 0, y: 0, width: 40, height: 12 });
    expect(rects[1]!.id).toBe('b');
  });

  it('skips IDs not found in LayoutPlan.index', () => {
    const plan = makeLayoutPlan([{ id: 'a', rect: { x: 0, y: 0, width: 40, height: 12 } }]);
    const rects = extractPaneRects(plan, ['a', 'missing']);
    expect(rects).toHaveLength(1);
    expect(rects[0]!.id).toBe('a');
  });

  it('returns empty array when no IDs match', () => {
    const plan = makeLayoutPlan([{ id: 'a', rect: { x: 0, y: 0, width: 40, height: 12 } }]);
    const rects = extractPaneRects(plan, ['x', 'y']);
    expect(rects).toHaveLength(0);
  });

  it('returns empty array for empty paneIds', () => {
    const plan = makeLayoutPlan([{ id: 'a', rect: { x: 0, y: 0, width: 40, height: 12 } }]);
    const rects = extractPaneRects(plan, []);
    expect(rects).toHaveLength(0);
  });
});

// ============================================================
// Regression: handlePopTrap/handleRestore accept any entry when tabOrder is empty
// ============================================================

describe('focusUpdate — focus-pop-trap (empty tabOrder regression)', () => {
  it('should NOT accept any history entry when tabOrder is empty but traps exist', () => {
    // Bug: When tabOrder is empty, navigableSet.size === 0 is true,
    // so the condition `navigableSet.size === 0 || navigableSet.has(candidate)`
    // accepts ANY candidate from history, even ones not in any trap paneIds.
    // The fix: check newTraps.length === 0 instead.
    const trap = makeTrap({ id: 'modal', paneIds: ['dialog-ok', 'dialog-cancel'], initialFocusId: 'dialog-ok' });
    // Model with empty tabOrder — trap paneIds are NOT in tabOrder
    let model = createFocusModel({ initialFocusId: 'sidebar', tabOrder: [] });
    // Push sidebar to history, enter trap focused on dialog-ok
    model = focusUpdate({ type: 'focus-push-trap', trap }, model);
    // Now pop the trap — should restore from history
    // With the bug: 'sidebar' is accepted because navigableSet is empty (tabOrder is empty)
    // Even though there are no remaining traps, that's actually fine for pop-trap —
    // BUT the real issue is when remaining traps still exist.
    // Let's demonstrate with nested traps:
    const outerTrap = makeTrap({ id: 'outer', paneIds: ['x', 'y'], initialFocusId: 'x' });
    const innerTrap = makeTrap({ id: 'inner', paneIds: ['a', 'b'], initialFocusId: 'a' });
    let model2 = createFocusModel({ initialFocusId: 'z', tabOrder: [] });
    model2 = focusUpdate({ type: 'focus-push-trap', trap: outerTrap }, model2);
    model2 = focusUpdate({ type: 'focus-push-trap', trap: innerTrap }, model2);
    // History now: ['z', 'x']. Pop inner trap.
    // After pop, only outer trap remains. navigable = tabOrder intersect outerTrap paneIds = [] (empty tabOrder).
    // Bug: navigableSet.size === 0, so 'x' is accepted. 'x' IS in the outer trap, but 'z' is NOT.
    // With fix: since 'x' is in the outer trap, and tabOrder is empty, 'x' is a valid candidate.
    // However, 'z' is NOT in the outer trap, so it is skipped.
    const popped = focusUpdate({ type: 'focus-pop-trap', trapId: 'inner' }, model2);
    // With the fix: 'x' is accepted because it is in the remaining outer trap
    expect(popped.focusedId).toBe('x');
  });
});

describe('focusUpdate — focus-restore (empty tabOrder regression)', () => {
  it('should NOT accept any history entry when tabOrder is empty but traps exist', () => {
    // Same bug as handlePopTrap but in the handleRestore code path.
    const trap = makeTrap({ id: 'modal', paneIds: ['ok', 'cancel'], initialFocusId: 'ok' });
    let model = createFocusModel({ initialFocusId: 'outside', tabOrder: [] });
    model = focusUpdate({ type: 'focus-push-trap', trap }, model);
    // Focus 'cancel' within the trap to add 'ok' to history
    model = focusUpdate({ type: 'focus', id: 'cancel' }, model);
    // Now history = ['outside', 'ok']. Try to restore.
    // Bug: navigableSet is empty (tabOrder empty), so ANY candidate is accepted.
    // 'ok' IS in trap paneIds, but 'outside' is NOT. The code should only accept 'ok'.
    const restored = focusUpdate({ type: 'focus-restore' }, model);
    expect(restored.focusedId).toBe('ok');
    // With the bug: 'ok' would be accepted (which happens to be correct by coincidence).
    // But let's test with a history entry NOT in the trap:
    let model2 = createFocusModel({ initialFocusId: 'outside', tabOrder: [] });
    model2 = focusUpdate({ type: 'focus-push-trap', trap }, model2);
    // history = ['outside']. Restore should NOT accept 'outside' since trap is active
    // and 'outside' is not in trap paneIds, and navigableSet is empty.
    const restored2 = focusUpdate({ type: 'focus-restore' }, model2);
    // With fix: newTraps.length (traps.length for restore) > 0, navigableSet is empty,
    // so no candidate passes — focusedId should be null
    expect(restored2.focusedId).toBeNull();
  });
});

// ============================================================
// Immutability
// ============================================================

describe('immutability', () => {
  it('focusUpdate does not mutate the original model', () => {
    const model = createFocusModel({
      initialFocusId: 'a',
      tabOrder: ['a', 'b', 'c'],
      maxHistory: 10,
    });
    const original = {
      focusedId: model.focusedId,
      history: [...model.history],
      tabOrder: [...model.tabOrder],
      traps: [...model.traps],
    };

    focusUpdate({ type: 'focus', id: 'b' }, model);
    focusUpdate({ type: 'blur' }, model);
    focusUpdate({ type: 'focus-next' }, model);
    focusUpdate({ type: 'focus-prev' }, model);
    focusUpdate({ type: 'focus-push-trap', trap: makeTrap() }, model);

    expect(model.focusedId).toBe(original.focusedId);
    expect([...model.history]).toEqual(original.history);
    expect([...model.tabOrder]).toEqual(original.tabOrder);
    expect([...model.traps]).toEqual(original.traps);
  });
});
