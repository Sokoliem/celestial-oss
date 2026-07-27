import { describe, expect, it } from 'vitest';
import type { HorizonMouseModel } from '../mouse.js';
import {
  createHorizonMouseModel,
  DEFAULT_EDGE_SNAP,
  DEFAULT_SNAP_CONFIG,
  getTabPreviewOrder,
  horizonMouseCursor,
  horizonMouseUpdate,
  isDraggingFloat,
  isDraggingSeparator,
  shouldEnableMouse,
} from '../mouse.js';
import type { FloatGeometry, GeometryCache, SplitGeometry, TabGeometry } from '../primitives/geometry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyGeometry(): GeometryCache {
  return { splits: [], tabs: [], floats: [], panes: [] };
}

/** Helper to build a horizontal SplitGeometry with secondPane fields computed automatically */
function hSplit(splitId: string, sepX: number, totalW: number, h: number): SplitGeometry {
  return {
    splitId,
    direction: 'horizontal',
    separatorX: sepX,
    separatorY: 0,
    separatorWidth: 1,
    separatorHeight: h,
    totalSize: totalW,
    firstPaneX: 0,
    firstPaneY: 0,
    firstPaneWidth: sepX,
    firstPaneHeight: h,
    secondPaneX: sepX + 1,
    secondPaneY: 0,
    secondPaneWidth: totalW - sepX - 1,
    secondPaneHeight: h,
  };
}

function vSplit(splitId: string, sepY: number, totalH: number, w: number): SplitGeometry {
  return {
    splitId,
    direction: 'vertical',
    separatorX: 0,
    separatorY: sepY,
    separatorWidth: w,
    separatorHeight: 1,
    totalSize: totalH,
    firstPaneX: 0,
    firstPaneY: 0,
    firstPaneWidth: w,
    firstPaneHeight: sepY,
    secondPaneX: 0,
    secondPaneY: sepY + 1,
    secondPaneWidth: w,
    secondPaneHeight: totalH - sepY - 1,
  };
}

function floating(floatId = 'f1'): FloatGeometry {
  return {
    floatId,
    frame: { x: 10, y: 4, width: 20, height: 10 },
    titleBarX: 10,
    titleBarY: 5,
    titleBarWidth: 20,
    titleBarHeight: 1,
    contentX: 10,
    contentY: 6,
    contentWidth: 20,
    contentHeight: 7,
  };
}

function makeModel(overrides: Partial<HorizonMouseModel> = {}): HorizonMouseModel {
  return {
    ...createHorizonMouseModel({ cols: 80, rows: 24 }),
    enabled: true,
    ...overrides,
  };
}

function pressEvent(x: number, y: number, button: 0 | 1 | 2 = 0) {
  return {
    type: 'mouse-event' as const,
    event: { type: 'press' as const, button, x, y, ctrl: false, alt: false, shift: false },
  };
}

function releaseEvent(x: number, y: number, button: 0 | 1 | 2 = 0) {
  return {
    type: 'mouse-event' as const,
    event: { type: 'release' as const, button, x, y, ctrl: false, alt: false, shift: false },
  };
}

function moveEvent(x: number, y: number) {
  return {
    type: 'mouse-event' as const,
    event: { type: 'move' as const, button: 'none' as const, x, y, ctrl: false, alt: false, shift: false },
  };
}

function scrollUpEvent(x: number, y: number) {
  return {
    type: 'mouse-event' as const,
    event: { type: 'scroll-up' as const, button: 'none' as const, x, y, ctrl: false, alt: false, shift: false },
  };
}

function scrollDownEvent(x: number, y: number) {
  return {
    type: 'mouse-event' as const,
    event: { type: 'scroll-down' as const, button: 'none' as const, x, y, ctrl: false, alt: false, shift: false },
  };
}

// ---------------------------------------------------------------------------
// createHorizonMouseModel
// ---------------------------------------------------------------------------

describe('createHorizonMouseModel', () => {
  it('returns correct defaults', () => {
    const model = createHorizonMouseModel();
    expect(model.active).toEqual({ kind: 'none' });
    expect(model.hoveredPaneId).toBeNull();
    expect(model.cursorX).toBe(0);
    expect(model.cursorY).toBe(0);
    expect(model.termCols).toBe(80);
    expect(model.termRows).toBe(24);
    expect(model.geometry).toEqual(emptyGeometry());
    expect(model.drag.phase).toBe('idle');
    expect(model.sortable.draggingIndex).toBeNull();
  });

  it('accepts custom cols and rows', () => {
    const model = createHorizonMouseModel({ cols: 120, rows: 40 });
    expect(model.termCols).toBe(120);
    expect(model.termRows).toBe(40);
  });

  it('sets enabled based on capability detection', () => {
    // detectCapabilities is cached and depends on env; just verify the field exists
    const model = createHorizonMouseModel();
    expect(typeof model.enabled).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// mouse-enable / mouse-disable
// ---------------------------------------------------------------------------

describe('mouse-enable / mouse-disable', () => {
  it('mouse-enable sets enabled to true', () => {
    const model = makeModel({ enabled: false });
    const { model: next } = horizonMouseUpdate({ type: 'mouse-enable' }, model);
    expect(next.enabled).toBe(true);
  });

  it('mouse-disable sets enabled to false', () => {
    const model = makeModel({ enabled: true });
    const { model: next } = horizonMouseUpdate({ type: 'mouse-disable' }, model);
    expect(next.enabled).toBe(false);
  });

  it('mouse-disable cancels in-progress resize interaction', () => {
    const model = makeModel({
      enabled: true,
      active: { kind: 'resize-split', splitId: 's1', direction: 'horizontal' },
    });
    const { model: next } = horizonMouseUpdate({ type: 'mouse-disable' }, model);
    expect(next.enabled).toBe(false);
    expect(next.active).toEqual({ kind: 'none' });
    expect(next.drag.phase).toBe('idle');
  });

  it('mouse-disable cancels in-progress tab reorder', () => {
    const model = makeModel({
      enabled: true,
      active: { kind: 'reorder-tab', tabbedId: 't1' },
    });
    const { model: next } = horizonMouseUpdate({ type: 'mouse-disable' }, model);
    expect(next.active).toEqual({ kind: 'none' });
    expect(next.sortable.draggingIndex).toBeNull();
  });

  it('mouse-disable cancels in-progress float drag', () => {
    const model = makeModel({
      enabled: true,
      active: { kind: 'drag-float', floatId: 'f1' },
    });
    const { model: next } = horizonMouseUpdate({ type: 'mouse-disable' }, model);
    expect(next.active).toEqual({ kind: 'none' });
    expect(next.drag.phase).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// mouse-resize
// ---------------------------------------------------------------------------

describe('mouse-resize', () => {
  it('updates terminal dimensions', () => {
    const model = makeModel();
    const { model: next } = horizonMouseUpdate({ type: 'mouse-resize', cols: 120, rows: 40 }, model);
    expect(next.termCols).toBe(120);
    expect(next.termRows).toBe(40);
  });

  it('normalizes forged dimensions and cancels an active interaction with rollback', () => {
    const split = hSplit('s1', 40, 80, 24);
    const model = makeModel({ geometry: { ...emptyGeometry(), splits: [split] } });
    const { model: resizing } = horizonMouseUpdate(pressEvent(40, 10), model);
    const { model: resized, effects } = horizonMouseUpdate({ type: 'mouse-resize', cols: Number.NaN, rows: 40 }, resizing);

    expect(resized.termCols).toBe(80);
    expect(resized.termRows).toBe(40);
    expect(resized.active).toEqual({ kind: 'none' });
    expect(effects).toEqual([{ effect: 'set-split-ratio', splitId: 's1', ratio: 0.5 }]);
  });
});

describe('resize cursors and cancellation', () => {
  it.each([
    [10, 4, 'nwse-resize'],
    [29, 4, 'nesw-resize'],
    [10, 13, 'nesw-resize'],
    [29, 13, 'nwse-resize'],
    [10, 8, 'ew-resize'],
    [29, 8, 'ew-resize'],
    [20, 4, 'ns-resize'],
    [20, 13, 'ns-resize'],
  ] as const)('maps floating edge (%i,%i) to %s', (x, y, cursor) => {
    const model = makeModel({ geometry: { ...emptyGeometry(), floats: [floating()] } });
    const { model: hovered } = horizonMouseUpdate(moveEvent(x, y), model);
    expect(horizonMouseCursor(hovered)).toBe(cursor);
  });

  it('uses directional split cursors and captures them until release outside', () => {
    const model = makeModel({ geometry: { ...emptyGeometry(), splits: [hSplit('s1', 40, 80, 24)] } });
    const { model: hovered } = horizonMouseUpdate(moveEvent(40, 10), model);
    const { model: resizing } = horizonMouseUpdate(pressEvent(40, 10), hovered);
    const { model: outside } = horizonMouseUpdate(moveEvent(200, 200), resizing);
    const { model: released } = horizonMouseUpdate(releaseEvent(200, 200), outside);

    expect(hovered.cursor).toBe('ew-resize');
    expect(resizing.cursor).toBe('ew-resize');
    expect(outside.cursor).toBe('ew-resize');
    expect(released.cursor).toBe('default');
  });

  it('ignores secondary-button and non-finite pointer events', () => {
    const model = makeModel({ geometry: { ...emptyGeometry(), floats: [floating()] } });
    const { model: secondary } = horizonMouseUpdate(pressEvent(10, 8, 2), model);
    const forged = {
      type: 'mouse-event' as const,
      event: { type: 'move' as const, button: 'none' as const, x: Number.NaN, y: 5, ctrl: false, alt: false, shift: false },
    };

    expect(secondary.active).toEqual({ kind: 'none' });
    expect(horizonMouseUpdate(forged, secondary).model).toBe(secondary);
  });

  it('rolls a floating resize back to its original frame on cancel', () => {
    const model = makeModel({ geometry: { ...emptyGeometry(), floats: [floating()] } });
    const { model: resizing } = horizonMouseUpdate(pressEvent(29, 13), model);
    const { model: moved } = horizonMouseUpdate(moveEvent(40, 20), resizing);
    const { model: cancelled, effects } = horizonMouseUpdate({ type: 'mouse-cancel' }, moved);

    expect(cancelled.active).toEqual({ kind: 'none' });
    expect(cancelled.drag.phase).toBe('idle');
    expect(effects).toEqual([{
      effect: 'resize-float',
      floatId: 'f1',
      edge: 'bottom-right',
      frame: { x: 10, y: 4, width: 20, height: 10 },
    }]);
  });

  it('normalizes invalid initial terminal dimensions', () => {
    const model = createHorizonMouseModel({ cols: Number.NaN, rows: -20 });
    expect(model.termCols).toBe(80);
    expect(model.termRows).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Geometry registration
// ---------------------------------------------------------------------------

describe('geometry registration', () => {
  it('mouse-register-splits updates geometry cache', () => {
    const model = makeModel();
    const splits: SplitGeometry[] = [hSplit('s1', 40, 80, 24)];
    const { model: next } = horizonMouseUpdate({ type: 'mouse-register-splits', splits }, model);
    expect(next.geometry.splits).toEqual(splits);
  });

  it('mouse-register-tabs updates geometry cache', () => {
    const model = makeModel();
    const tabs: TabGeometry[] = [
      {
        tabbedId: 't1',
        tabs: [{ index: 0, x: 0, y: 0, width: 10, height: 1, label: 'Tab 1' }],
      },
    ];
    const { model: next } = horizonMouseUpdate({ type: 'mouse-register-tabs', tabs }, model);
    expect(next.geometry.tabs).toEqual(tabs);
  });

  it('mouse-register-floats updates geometry cache', () => {
    const model = makeModel();
    const floats: FloatGeometry[] = [
      {
        floatId: 'f1',
        titleBarX: 10,
        titleBarY: 5,
        titleBarWidth: 30,
        titleBarHeight: 1,
        contentX: 10,
        contentY: 6,
        contentWidth: 30,
        contentHeight: 10,
      },
    ];
    const { model: next } = horizonMouseUpdate({ type: 'mouse-register-floats', floats }, model);
    expect(next.geometry.floats).toEqual(floats);
  });

  it('mouse-register-panes updates geometry cache', () => {
    const model = makeModel();
    const panes = [{ id: 'p1', x: 0, y: 0, width: 40, height: 24 }];
    const { model: next } = horizonMouseUpdate({ type: 'mouse-register-panes', panes }, model);
    expect(next.geometry.panes).toEqual(panes);
  });
});

// ---------------------------------------------------------------------------
// Click-to-focus
// ---------------------------------------------------------------------------

describe('click-to-focus', () => {
  it('press on a pane emits focus-pane effect', () => {
    const model = makeModel({
      geometry: {
        ...emptyGeometry(),
        panes: [{ id: 'p1', x: 0, y: 0, width: 40, height: 24 }],
      },
    });
    const { effects } = horizonMouseUpdate(pressEvent(5, 5), model);
    expect(effects).toContainEqual({ effect: 'focus-pane', paneId: 'p1' });
  });

  it('press on empty area does not emit focus-pane', () => {
    const model = makeModel({
      geometry: {
        ...emptyGeometry(),
        panes: [{ id: 'p1', x: 0, y: 0, width: 10, height: 10 }],
      },
    });
    const { effects } = horizonMouseUpdate(pressEvent(50, 50), model);
    const focusEffects = effects.filter((e) => e.effect === 'focus-pane');
    expect(focusEffects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Split resize
// ---------------------------------------------------------------------------

describe('split resize', () => {
  const splitGeometry = hSplit('s1', 40, 80, 24);

  it('press on separator starts resize interaction', () => {
    const model = makeModel({
      geometry: { ...emptyGeometry(), splits: [splitGeometry] },
    });
    const { model: next } = horizonMouseUpdate(pressEvent(40, 10), model);
    expect(next.active).toEqual({ kind: 'resize-split', splitId: 's1', direction: 'horizontal' });
    expect(next.drag.phase).toBe('dragging');
  });

  it('move during resize emits set-split-ratio effect', () => {
    // Start the drag first
    const model = makeModel({
      geometry: { ...emptyGeometry(), splits: [splitGeometry] },
    });
    const { model: dragging } = horizonMouseUpdate(pressEvent(40, 10), model);
    // Move to x=60 in an 80-col split
    const { effects } = horizonMouseUpdate(moveEvent(60, 10), dragging);
    const ratioEffects = effects.filter((e) => e.effect === 'set-split-ratio');
    expect(ratioEffects).toHaveLength(1);
    expect(ratioEffects[0]).toEqual({ effect: 'set-split-ratio', splitId: 's1', ratio: 0.75 });
  });

  it('release finalizes resize and returns to none interaction', () => {
    const model = makeModel({
      geometry: { ...emptyGeometry(), splits: [splitGeometry] },
    });
    const { model: dragging } = horizonMouseUpdate(pressEvent(40, 10), model);
    const { model: moved } = horizonMouseUpdate(moveEvent(60, 10), dragging);
    const { model: released, effects } = horizonMouseUpdate(releaseEvent(60, 10), moved);
    expect(released.active).toEqual({ kind: 'none' });
    expect(released.drag.phase).toBe('idle');
    // Final ratio effect on release
    const ratioEffects = effects.filter((e) => e.effect === 'set-split-ratio');
    expect(ratioEffects).toHaveLength(1);
  });

  it('vertical split resize computes ratio from Y', () => {
    const vertSplit = vSplit('sv', 12, 24, 80);
    const model = makeModel({
      geometry: { ...emptyGeometry(), splits: [vertSplit] },
    });
    const { model: dragging } = horizonMouseUpdate(pressEvent(10, 12), model);
    const { effects } = horizonMouseUpdate(moveEvent(10, 18), dragging);
    const ratioEffects = effects.filter((e) => e.effect === 'set-split-ratio');
    expect(ratioEffects).toHaveLength(1);
    expect(ratioEffects[0]).toEqual({ effect: 'set-split-ratio', splitId: 'sv', ratio: 0.75 });
  });
});

// ---------------------------------------------------------------------------
// Tab reorder
// ---------------------------------------------------------------------------

describe('tab reorder', () => {
  const tabGeometry: TabGeometry = {
    tabbedId: 't1',
    tabs: [
      { index: 0, x: 0, y: 0, width: 10, height: 1, label: 'Tab 0' },
      { index: 1, x: 10, y: 0, width: 10, height: 1, label: 'Tab 1' },
      { index: 2, x: 20, y: 0, width: 10, height: 1, label: 'Tab 2' },
    ],
  };

  it('press on a tab starts reorder interaction', () => {
    const model = makeModel({
      geometry: { ...emptyGeometry(), tabs: [tabGeometry] },
    });
    const { model: next } = horizonMouseUpdate(pressEvent(5, 0), model);
    expect(next.active).toEqual({ kind: 'reorder-tab', tabbedId: 't1', overTabbedId: 't1' });
    expect(next.sortable.draggingIndex).toBe(0);
  });

  it('move over another tab updates sortable overIndex', () => {
    const model = makeModel({
      geometry: { ...emptyGeometry(), tabs: [tabGeometry] },
    });
    const { model: dragging } = horizonMouseUpdate(pressEvent(5, 0), model);
    const { model: moved } = horizonMouseUpdate(moveEvent(15, 0), dragging);
    expect(moved.sortable.overIndex).toBe(1);
  });

  it('release emits reorder-tabs effect with from/to indices', () => {
    const model = makeModel({
      geometry: { ...emptyGeometry(), tabs: [tabGeometry] },
    });
    const { model: dragging } = horizonMouseUpdate(pressEvent(5, 0), model);
    const { model: moved } = horizonMouseUpdate(moveEvent(25, 0), dragging);
    const { model: released, effects } = horizonMouseUpdate(releaseEvent(25, 0), moved);
    expect(released.active).toEqual({ kind: 'none' });
    const reorderEffects = effects.filter((e) => e.effect === 'reorder-tabs');
    expect(reorderEffects).toHaveLength(1);
    expect(reorderEffects[0]).toEqual({ effect: 'reorder-tabs', tabbedId: 't1', fromIndex: 0, toIndex: 2 });
  });

  it('press on a tab also emits activate-tab effect', () => {
    const model = makeModel({
      geometry: { ...emptyGeometry(), tabs: [tabGeometry] },
    });
    const { effects } = horizonMouseUpdate(pressEvent(15, 0), model);
    const activateEffects = effects.filter((e) => e.effect === 'activate-tab');
    expect(activateEffects).toHaveLength(1);
    expect(activateEffects[0]).toEqual({ effect: 'activate-tab', tabbedId: 't1', tabIndex: 1 });
  });

  it('release without move does not emit reorder-tabs', () => {
    const model = makeModel({
      geometry: { ...emptyGeometry(), tabs: [tabGeometry] },
    });
    const { model: dragging } = horizonMouseUpdate(pressEvent(5, 0), model);
    const { effects } = horizonMouseUpdate(releaseEvent(5, 0), dragging);
    const reorderEffects = effects.filter((e) => e.effect === 'reorder-tabs');
    expect(reorderEffects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Float drag
// ---------------------------------------------------------------------------

describe('float drag', () => {
  const floatGeometry: FloatGeometry = {
    floatId: 'f1',
    titleBarX: 10,
    titleBarY: 5,
    titleBarWidth: 30,
    titleBarHeight: 1,
    contentX: 10,
    contentY: 6,
    contentWidth: 30,
    contentHeight: 10,
  };

  it('press on title bar starts drag-float interaction', () => {
    const model = makeModel({
      geometry: { ...emptyGeometry(), floats: [floatGeometry] },
    });
    const { model: next } = horizonMouseUpdate(pressEvent(20, 5), model);
    expect(next.active).toEqual({ kind: 'drag-float', floatId: 'f1' });
    expect(next.drag.phase).toBe('dragging');
  });

  it('move during float drag emits move-float effect', () => {
    const model = makeModel({
      geometry: { ...emptyGeometry(), floats: [floatGeometry] },
    });
    const { model: dragging } = horizonMouseUpdate(pressEvent(20, 5), model);
    const { effects } = horizonMouseUpdate(moveEvent(30, 8), dragging);
    const moveEffects = effects.filter((e) => e.effect === 'move-float');
    expect(moveEffects).toHaveLength(1);
    // Original position (10, 5), drag started at (20, 5), moved to (30, 8)
    // New position: original + offset = (10 + (30-20), 5 + (8-5)) = (20, 8)
    expect(moveEffects[0]).toEqual({ effect: 'move-float', floatId: 'f1', x: 20, y: 8 });
  });

  it('release finalizes float drag', () => {
    const model = makeModel({
      geometry: { ...emptyGeometry(), floats: [floatGeometry] },
    });
    const { model: dragging } = horizonMouseUpdate(pressEvent(20, 5), model);
    const { model: moved } = horizonMouseUpdate(moveEvent(30, 8), dragging);
    const { model: released, effects } = horizonMouseUpdate(releaseEvent(30, 8), moved);
    expect(released.active).toEqual({ kind: 'none' });
    expect(released.drag.phase).toBe('idle');
    const moveEffects = effects.filter((e) => e.effect === 'move-float');
    expect(moveEffects).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Double-click maximize
// ---------------------------------------------------------------------------

describe('double-click maximize', () => {
  it('gesture double-click on a pane emits toggle-maximize', () => {
    const model = makeModel({
      geometry: {
        ...emptyGeometry(),
        panes: [{ id: 'p1', x: 0, y: 0, width: 40, height: 24 }],
      },
    });
    const { effects } = horizonMouseUpdate({ type: 'mouse-gesture', gesture: { gesture: 'double-click', x: 5, y: 5 } }, model);
    expect(effects).toContainEqual({ effect: 'toggle-maximize', paneId: 'p1' });
  });

  it('gesture double-click on empty area produces no effect', () => {
    const model = makeModel({
      geometry: {
        ...emptyGeometry(),
        panes: [{ id: 'p1', x: 0, y: 0, width: 10, height: 10 }],
      },
    });
    const { effects } = horizonMouseUpdate({ type: 'mouse-gesture', gesture: { gesture: 'double-click', x: 50, y: 50 } }, model);
    const maxEffects = effects.filter((e) => e.effect === 'toggle-maximize');
    expect(maxEffects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Scroll
// ---------------------------------------------------------------------------

describe('scroll', () => {
  it('scroll-up on a pane emits scroll-pane effect with negative delta', () => {
    const model = makeModel({
      geometry: {
        ...emptyGeometry(),
        panes: [{ id: 'p1', x: 0, y: 0, width: 40, height: 24 }],
      },
    });
    const { effects } = horizonMouseUpdate(scrollUpEvent(5, 5), model);
    expect(effects).toContainEqual({ effect: 'scroll-pane', paneId: 'p1', delta: -1 });
  });

  it('scroll-down on a pane emits scroll-pane effect with positive delta', () => {
    const model = makeModel({
      geometry: {
        ...emptyGeometry(),
        panes: [{ id: 'p1', x: 0, y: 0, width: 40, height: 24 }],
      },
    });
    const { effects } = horizonMouseUpdate(scrollDownEvent(5, 5), model);
    expect(effects).toContainEqual({ effect: 'scroll-pane', paneId: 'p1', delta: 1 });
  });

  it('scroll on empty area produces no effect', () => {
    const model = makeModel({
      geometry: {
        ...emptyGeometry(),
        panes: [{ id: 'p1', x: 0, y: 0, width: 10, height: 10 }],
      },
    });
    const { effects } = horizonMouseUpdate(scrollUpEvent(50, 50), model);
    const scrollEffects = effects.filter((e) => e.effect === 'scroll-pane');
    expect(scrollEffects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Hover tracking
// ---------------------------------------------------------------------------

describe('hover tracking', () => {
  it('move event updates hoveredPaneId', () => {
    const model = makeModel({
      geometry: {
        ...emptyGeometry(),
        panes: [
          { id: 'p1', x: 0, y: 0, width: 40, height: 24 },
          { id: 'p2', x: 40, y: 0, width: 40, height: 24 },
        ],
      },
    });
    const { model: next } = horizonMouseUpdate(moveEvent(5, 5), model);
    expect(next.hoveredPaneId).toBe('p1');
    const { model: next2 } = horizonMouseUpdate(moveEvent(50, 5), next);
    expect(next2.hoveredPaneId).toBe('p2');
  });

  it('move to empty area clears hoveredPaneId', () => {
    const model = makeModel({
      hoveredPaneId: 'p1',
      geometry: {
        ...emptyGeometry(),
        panes: [{ id: 'p1', x: 0, y: 0, width: 10, height: 10 }],
      },
    });
    const { model: next } = horizonMouseUpdate(moveEvent(50, 50), model);
    expect(next.hoveredPaneId).toBeNull();
  });

  it('move updates cursor position', () => {
    const model = makeModel();
    const { model: next } = horizonMouseUpdate(moveEvent(15, 20), model);
    expect(next.cursorX).toBe(15);
    expect(next.cursorY).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Snap logic
// ---------------------------------------------------------------------------

describe('snap logic', () => {
  it('ratio near 0.5 snaps to 0.5', () => {
    // Split with totalSize=100, separator at x=0
    const split = hSplit('s1', 50, 100, 24);
    const model = makeModel({
      geometry: { ...emptyGeometry(), splits: [split] },
    });
    // Start drag on separator
    const { model: dragging } = horizonMouseUpdate(pressEvent(50, 10), model);
    // Move to x=49 (ratio would be 0.49 — within 2/100 = 0.02 threshold of 0.5)
    const { effects } = horizonMouseUpdate(moveEvent(49, 10), dragging);
    const ratioEffects = effects.filter((e) => e.effect === 'set-split-ratio');
    expect(ratioEffects).toHaveLength(1);
    expect((ratioEffects[0] as { effect: 'set-split-ratio'; ratio: number }).ratio).toBe(0.5);
  });

  it('ratio far from snap points stays as computed', () => {
    const split = hSplit('s1', 50, 100, 24);
    const model = makeModel({
      geometry: { ...emptyGeometry(), splits: [split] },
    });
    const { model: dragging } = horizonMouseUpdate(pressEvent(50, 10), model);
    // Move to x=42 (ratio=0.42 — not near any snap point for threshold 2/100=0.02)
    const { effects } = horizonMouseUpdate(moveEvent(42, 10), dragging);
    const ratioEffects = effects.filter((e) => e.effect === 'set-split-ratio');
    expect(ratioEffects).toHaveLength(1);
    expect((ratioEffects[0] as { effect: 'set-split-ratio'; ratio: number }).ratio).toBe(0.42);
  });
});

// ---------------------------------------------------------------------------
// Edge snap (float drag)
// ---------------------------------------------------------------------------

describe('edge snap', () => {
  it('float dragged near left edge snaps to x=0', () => {
    const floatGeo: FloatGeometry = {
      floatId: 'f1',
      titleBarX: 10,
      titleBarY: 5,
      titleBarWidth: 20,
      titleBarHeight: 1,
      contentX: 10,
      contentY: 6,
      contentWidth: 20,
      contentHeight: 10,
    };
    const model = makeModel({
      termCols: 80,
      termRows: 24,
      geometry: { ...emptyGeometry(), floats: [floatGeo] },
    });
    // Start drag on title bar at (15, 5), originalX=10
    const { model: dragging } = horizonMouseUpdate(pressEvent(15, 5), model);
    // Move so new x = 10 + (3 - 15) = -2 -> would be negative -> snaps to 0
    const { effects } = horizonMouseUpdate(moveEvent(3, 5), dragging);
    const moveEffects = effects.filter((e) => e.effect === 'move-float');
    expect(moveEffects).toHaveLength(1);
    expect((moveEffects[0] as { effect: 'move-float'; x: number }).x).toBe(0);
  });

  it('float dragged near top edge snaps to y=0', () => {
    const floatGeo: FloatGeometry = {
      floatId: 'f1',
      titleBarX: 10,
      titleBarY: 5,
      titleBarWidth: 20,
      titleBarHeight: 1,
      contentX: 10,
      contentY: 6,
      contentWidth: 20,
      contentHeight: 10,
    };
    const model = makeModel({
      termCols: 80,
      termRows: 24,
      geometry: { ...emptyGeometry(), floats: [floatGeo] },
    });
    const { model: dragging } = horizonMouseUpdate(pressEvent(15, 5), model);
    // Move so new y = 5 + (1 - 5) = 1 -> within 3 of 0 -> snaps to 0
    const { effects } = horizonMouseUpdate(moveEvent(15, 1), dragging);
    const moveEffects = effects.filter((e) => e.effect === 'move-float');
    expect(moveEffects).toHaveLength(1);
    expect((moveEffects[0] as { effect: 'move-float'; y: number }).y).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Graceful degradation (disabled mouse)
// ---------------------------------------------------------------------------

describe('graceful degradation', () => {
  it('when disabled, mouse events are no-ops', () => {
    const model = makeModel({
      enabled: false,
      geometry: {
        ...emptyGeometry(),
        panes: [{ id: 'p1', x: 0, y: 0, width: 80, height: 24 }],
      },
    });
    const { model: next, effects } = horizonMouseUpdate(pressEvent(5, 5), model);
    expect(next).toEqual(model);
    expect(effects).toHaveLength(0);
  });

  it('when disabled, scroll events are no-ops', () => {
    const model = makeModel({
      enabled: false,
      geometry: {
        ...emptyGeometry(),
        panes: [{ id: 'p1', x: 0, y: 0, width: 80, height: 24 }],
      },
    });
    const { effects } = horizonMouseUpdate(scrollUpEvent(5, 5), model);
    expect(effects).toHaveLength(0);
  });

  it('when disabled, gesture events are no-ops', () => {
    const model = makeModel({
      enabled: false,
      geometry: {
        ...emptyGeometry(),
        panes: [{ id: 'p1', x: 0, y: 0, width: 80, height: 24 }],
      },
    });
    const { effects } = horizonMouseUpdate({ type: 'mouse-gesture', gesture: { gesture: 'double-click', x: 5, y: 5 } }, model);
    expect(effects).toHaveLength(0);
  });

  it('geometry registration works even when disabled', () => {
    const model = makeModel({ enabled: false });
    const panes = [{ id: 'p1', x: 0, y: 0, width: 40, height: 24 }];
    const { model: next } = horizonMouseUpdate({ type: 'mouse-register-panes', panes }, model);
    expect(next.geometry.panes).toEqual(panes);
  });

  it('mouse-resize works even when disabled', () => {
    const model = makeModel({ enabled: false });
    const { model: next } = horizonMouseUpdate({ type: 'mouse-resize', cols: 120, rows: 40 }, model);
    expect(next.termCols).toBe(120);
    expect(next.termRows).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// No active interaction
// ---------------------------------------------------------------------------

describe('no active interaction', () => {
  it('move events with no geometry only update cursor', () => {
    const model = makeModel();
    const { model: next, effects } = horizonMouseUpdate(moveEvent(10, 15), model);
    expect(next.cursorX).toBe(10);
    expect(next.cursorY).toBe(15);
    expect(next.hoveredPaneId).toBeNull();
    // No effects except possibly none
    const meaningfulEffects = effects.filter((e) => e.effect !== 'none');
    expect(meaningfulEffects).toHaveLength(0);
  });

  it('release with no active interaction is a no-op', () => {
    const model = makeModel();
    const { model: next, effects } = horizonMouseUpdate(releaseEvent(10, 10), model);
    expect(next.active).toEqual({ kind: 'none' });
    expect(effects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Active interaction routing
// ---------------------------------------------------------------------------

describe('active interaction routing', () => {
  it('during resize, press events do not start new interactions', () => {
    const split = hSplit('s1', 40, 80, 24);
    const tab: TabGeometry = {
      tabbedId: 't1',
      tabs: [{ index: 0, x: 0, y: 0, width: 10, height: 1, label: 'Tab 0' }],
    };
    const model = makeModel({
      geometry: { ...emptyGeometry(), splits: [split], tabs: [tab] },
    });
    const { model: resizing } = horizonMouseUpdate(pressEvent(40, 10), model);
    expect(resizing.active.kind).toBe('resize-split');
    // Press on a tab while resizing should not switch interaction
    const { model: stillResizing } = horizonMouseUpdate(pressEvent(5, 0), resizing);
    expect(stillResizing.active.kind).toBe('resize-split');
  });

  it('move during tab reorder tracks sortable indices', () => {
    const tab: TabGeometry = {
      tabbedId: 't1',
      tabs: [
        { index: 0, x: 0, y: 0, width: 10, height: 1, label: 'Tab 0' },
        { index: 1, x: 10, y: 0, width: 10, height: 1, label: 'Tab 1' },
      ],
    };
    const model = makeModel({
      geometry: { ...emptyGeometry(), tabs: [tab] },
    });
    const { model: dragging } = horizonMouseUpdate(pressEvent(5, 0), model);
    expect(dragging.active.kind).toBe('reorder-tab');
    const { model: moved } = horizonMouseUpdate(moveEvent(15, 0), dragging);
    expect(moved.sortable.overIndex).toBe(1);
    expect((moved.active as Extract<typeof moved.active, { kind: 'reorder-tab' }>).overTabbedId).toBe('t1');
  });
});

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

describe('query functions', () => {
  describe('shouldEnableMouse', () => {
    it('returns a boolean', () => {
      expect(typeof shouldEnableMouse()).toBe('boolean');
    });
  });

  describe('getTabPreviewOrder', () => {
    it('returns original order when not sorting', () => {
      const model = makeModel();
      const items = ['a', 'b', 'c'];
      expect(getTabPreviewOrder(items, model)).toEqual(['a', 'b', 'c']);
    });

    it('returns reordered items when sorting', () => {
      const model = makeModel({
        sortable: { draggingIndex: 0, overIndex: 2 },
      });
      const items = ['a', 'b', 'c'];
      expect(getTabPreviewOrder(items, model)).toEqual(['b', 'c', 'a']);
    });
  });

  describe('isDraggingSeparator', () => {
    it('returns true when actively resizing that split', () => {
      const model = makeModel({
        active: { kind: 'resize-split', splitId: 's1', direction: 'horizontal' },
      });
      expect(isDraggingSeparator(model, 's1')).toBe(true);
    });

    it('returns false for a different splitId', () => {
      const model = makeModel({
        active: { kind: 'resize-split', splitId: 's1', direction: 'horizontal' },
      });
      expect(isDraggingSeparator(model, 's2')).toBe(false);
    });

    it('returns false when no interaction active', () => {
      const model = makeModel();
      expect(isDraggingSeparator(model, 's1')).toBe(false);
    });
  });

  describe('isDraggingFloat', () => {
    it('returns true when actively dragging that float', () => {
      const model = makeModel({
        active: { kind: 'drag-float', floatId: 'f1' },
      });
      expect(isDraggingFloat(model, 'f1')).toBe(true);
    });

    it('returns false for a different floatId', () => {
      const model = makeModel({
        active: { kind: 'drag-float', floatId: 'f1' },
      });
      expect(isDraggingFloat(model, 'f2')).toBe(false);
    });

    it('returns false when no interaction active', () => {
      const model = makeModel();
      expect(isDraggingFloat(model, 'f1')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Default configs
// ---------------------------------------------------------------------------

describe('default configs', () => {
  it('DEFAULT_SNAP_CONFIG has expected defaults', () => {
    expect(DEFAULT_SNAP_CONFIG.ratios).toEqual([0.25, 0.333, 0.5, 0.667, 0.75]);
    expect(DEFAULT_SNAP_CONFIG.threshold).toBe(2);
  });

  it('DEFAULT_EDGE_SNAP has expected defaults', () => {
    expect(DEFAULT_EDGE_SNAP.threshold).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Z-priority (registration order)
// ---------------------------------------------------------------------------

describe('z-priority', () => {
  it('title bar (float) takes priority over pane at same position', () => {
    const floatGeo: FloatGeometry = {
      floatId: 'f1',
      titleBarX: 0,
      titleBarY: 0,
      titleBarWidth: 30,
      titleBarHeight: 1,
      contentX: 0,
      contentY: 1,
      contentWidth: 30,
      contentHeight: 10,
    };
    const model = makeModel({
      geometry: {
        splits: [],
        tabs: [],
        floats: [floatGeo],
        panes: [{ id: 'p1', x: 0, y: 0, width: 80, height: 24 }],
      },
    });
    // Press at (5, 0) should hit the title bar, not the pane
    const { model: next } = horizonMouseUpdate(pressEvent(5, 0), model);
    expect(next.active).toEqual({ kind: 'drag-float', floatId: 'f1' });
  });

  it('tab takes priority over pane at same position', () => {
    const tabGeo: TabGeometry = {
      tabbedId: 't1',
      tabs: [{ index: 0, x: 0, y: 0, width: 10, height: 1, label: 'Tab 0' }],
    };
    const model = makeModel({
      geometry: {
        splits: [],
        tabs: [tabGeo],
        floats: [],
        panes: [{ id: 'p1', x: 0, y: 0, width: 80, height: 24 }],
      },
    });
    const { model: next } = horizonMouseUpdate(pressEvent(5, 0), model);
    expect(next.active).toEqual({ kind: 'reorder-tab', tabbedId: 't1', overTabbedId: 't1' });
  });

  it('separator takes priority over pane', () => {
    const split = hSplit('s1', 40, 80, 24);
    const model = makeModel({
      geometry: {
        splits: [split],
        tabs: [],
        floats: [],
        panes: [{ id: 'p1', x: 0, y: 0, width: 80, height: 24 }],
      },
    });
    const { model: next } = horizonMouseUpdate(pressEvent(40, 10), model);
    expect(next.active).toEqual({ kind: 'resize-split', splitId: 's1', direction: 'horizontal' });
  });
});

// ---------------------------------------------------------------------------
// Regression: float drag uses titleBarWidth instead of max(titleBarWidth, contentWidth)
// ---------------------------------------------------------------------------

describe('float drag boundary clamp (wide content regression)', () => {
  it('should clamp right boundary using content width when content is wider than title bar', () => {
    // Bug: computeFloatPosition uses floatGeo.titleBarWidth for the right boundary clamp,
    // but content can be wider than the title bar, allowing floats to escape the right edge.
    const floatGeo: FloatGeometry = {
      floatId: 'f1',
      titleBarX: 5,
      titleBarY: 2,
      titleBarWidth: 10,
      titleBarHeight: 1,
      contentX: 5,
      contentY: 3,
      contentWidth: 40,
      contentHeight: 10,
    };
    const model = makeModel({
      termCols: 60,
      termRows: 24,
      geometry: { ...emptyGeometry(), floats: [floatGeo] },
    });
    // Start drag on title bar at (10, 2), originalX=5
    const { model: dragging } = horizonMouseUpdate(pressEvent(10, 2), model);
    // Move far right: newX = 5 + (55 - 10) = 50
    // With the bug: rightEdge = 60 - 10 (titleBarWidth) = 50, so x=50 is allowed.
    // With the fix: rightEdge = 60 - 40 (max of 10, 40 = contentWidth) = 20, so x clamped to 20.
    const { effects } = horizonMouseUpdate(moveEvent(55, 2), dragging);
    const moveEffects = effects.filter((e) => e.effect === 'move-float');
    expect(moveEffects).toHaveLength(1);
    const moveEffect = moveEffects[0] as { effect: 'move-float'; x: number; y: number };
    // The float should NOT be at x=50 (titleBarWidth clamp). It should be at x=20 (contentWidth clamp).
    expect(moveEffect.x).toBeLessThanOrEqual(20);
  });
});

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe('immutability', () => {
  it('horizonMouseUpdate does not mutate the original model', () => {
    const model = makeModel({
      geometry: {
        ...emptyGeometry(),
        panes: [{ id: 'p1', x: 0, y: 0, width: 80, height: 24 }],
      },
    });
    const originalStr = JSON.stringify(model);
    horizonMouseUpdate(pressEvent(5, 5), model);
    horizonMouseUpdate(moveEvent(10, 10), model);
    horizonMouseUpdate(scrollUpEvent(5, 5), model);
    expect(JSON.stringify(model)).toBe(originalStr);
  });
});
