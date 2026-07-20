import { describe, expect, it } from 'vitest';
import { createFocusStackState, type FocusLayer, focusStackUpdate, getActiveFocusId, getActiveLayer, getLayerById, isLayerTrapped } from '../focus-stack.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseLayer(overrides: Partial<FocusLayer> = {}): FocusLayer {
  return {
    id: 'base',
    kind: 'base',
    trap: false,
    focusableIds: ['btn-1', 'btn-2', 'btn-3'],
    ...overrides,
  };
}

function modalLayer(overrides: Partial<FocusLayer> = {}): FocusLayer {
  return {
    id: 'modal-1',
    kind: 'modal',
    trap: true,
    focusableIds: ['ok', 'cancel'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createFocusStackState
// ---------------------------------------------------------------------------

describe('createFocusStackState', () => {
  it('creates state with one base layer', () => {
    const state = createFocusStackState(baseLayer());
    expect(state.layers).toHaveLength(1);
    expect(state.layers[0]!.id).toBe('base');
    expect(state.previousFocusIds).toEqual([]);
  });

  it('auto-selects first focusable if activeFocusId is not set', () => {
    const state = createFocusStackState(baseLayer());
    expect(state.layers[0]!.activeFocusId).toBe('btn-1');
  });

  it('respects explicit activeFocusId', () => {
    const state = createFocusStackState(baseLayer({ activeFocusId: 'btn-3' }));
    expect(state.layers[0]!.activeFocusId).toBe('btn-3');
  });

  it('handles empty focusableIds', () => {
    const state = createFocusStackState(baseLayer({ focusableIds: [] }));
    expect(state.layers[0]!.activeFocusId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// focus-push-layer
// ---------------------------------------------------------------------------

describe('focus-push-layer', () => {
  it('pushes a new layer on top', () => {
    const state = createFocusStackState(baseLayer());
    const result = focusStackUpdate({ type: 'focus-push-layer', layer: modalLayer() }, state);

    expect(result.state.layers).toHaveLength(2);
    expect(getActiveLayer(result.state)!.id).toBe('modal-1');
  });

  it('saves previous focus for restoration', () => {
    const state = createFocusStackState(baseLayer());
    const result = focusStackUpdate({ type: 'focus-push-layer', layer: modalLayer() }, state);

    expect(result.state.previousFocusIds).toHaveLength(1);
    expect(result.state.previousFocusIds[0]).toBe('btn-1');
  });

  it('auto-selects first focusable in new layer', () => {
    const state = createFocusStackState(baseLayer());
    const result = focusStackUpdate({ type: 'focus-push-layer', layer: modalLayer() }, state);

    expect(getActiveFocusId(result.state)).toBe('ok');
  });

  it('emits layer-deactivated and layer-activated events', () => {
    const state = createFocusStackState(baseLayer());
    const result = focusStackUpdate({ type: 'focus-push-layer', layer: modalLayer() }, state);

    const deactivated = result.events.find((e) => e.type === 'layer-deactivated');
    const activated = result.events.find((e) => e.type === 'layer-activated');
    expect(deactivated).toBeDefined();
    expect(deactivated!.type === 'layer-deactivated' && deactivated!.layerId).toBe('base');
    expect(activated).toBeDefined();
    expect(activated!.type === 'layer-activated' && activated!.layerId).toBe('modal-1');
  });

  it('emits focus-left and focus-entered events', () => {
    const state = createFocusStackState(baseLayer());
    const result = focusStackUpdate({ type: 'focus-push-layer', layer: modalLayer() }, state);

    const left = result.events.find((e) => e.type === 'focus-left');
    const entered = result.events.find((e) => e.type === 'focus-entered');
    expect(left).toBeDefined();
    expect(left!.type === 'focus-left' && left!.elementId).toBe('btn-1');
    expect(entered).toBeDefined();
    expect(entered!.type === 'focus-entered' && entered!.elementId).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// focus-pop-layer
// ---------------------------------------------------------------------------

describe('focus-pop-layer', () => {
  it('pops the top layer', () => {
    let state = createFocusStackState(baseLayer());
    state = focusStackUpdate({ type: 'focus-push-layer', layer: modalLayer() }, state).state;

    const result = focusStackUpdate({ type: 'focus-pop-layer' }, state);
    expect(result.state.layers).toHaveLength(1);
    expect(getActiveLayer(result.state)!.id).toBe('base');
  });

  it('restores previous focus on pop', () => {
    let state = createFocusStackState(baseLayer({ activeFocusId: 'btn-2' }));
    state = focusStackUpdate({ type: 'focus-push-layer', layer: modalLayer() }, state).state;

    const result = focusStackUpdate({ type: 'focus-pop-layer' }, state);
    expect(getActiveFocusId(result.state)).toBe('btn-2');
  });

  it('does not pop the last layer', () => {
    const state = createFocusStackState(baseLayer());
    const result = focusStackUpdate({ type: 'focus-pop-layer' }, state);
    expect(result.state.layers).toHaveLength(1);
    expect(result.events).toHaveLength(0);
  });

  it('pops a specific layer by ID', () => {
    let state = createFocusStackState(baseLayer());
    state = focusStackUpdate({ type: 'focus-push-layer', layer: modalLayer({ id: 'overlay-1', kind: 'overlay' }) }, state).state;
    state = focusStackUpdate({ type: 'focus-push-layer', layer: modalLayer({ id: 'menu-1', kind: 'menu' }) }, state).state;

    // Pop overlay-1 (middle layer)
    const result = focusStackUpdate({ type: 'focus-pop-layer', layerId: 'overlay-1' }, state);
    expect(result.state.layers).toHaveLength(2);
    expect(result.state.layers[0]!.id).toBe('base');
    expect(result.state.layers[1]!.id).toBe('menu-1');
  });

  it('does not pop the base layer by ID', () => {
    let state = createFocusStackState(baseLayer());
    state = focusStackUpdate({ type: 'focus-push-layer', layer: modalLayer() }, state).state;

    const result = focusStackUpdate({ type: 'focus-pop-layer', layerId: 'base' }, state);
    expect(result.state.layers).toHaveLength(2);
    expect(result.events).toHaveLength(0);
  });

  it('handles pop of nonexistent layer ID gracefully', () => {
    const state = createFocusStackState(baseLayer());
    const result = focusStackUpdate({ type: 'focus-pop-layer', layerId: 'nope' }, state);
    expect(result.state).toBe(state);
    expect(result.events).toHaveLength(0);
  });

  it('does not restore focus when restoreFocusOnPop is false', () => {
    let state = createFocusStackState(baseLayer({ activeFocusId: 'btn-2' }));
    state = focusStackUpdate(
      {
        type: 'focus-push-layer',
        layer: modalLayer({ restoreFocusOnPop: false }),
      },
      state,
    ).state;

    const result = focusStackUpdate({ type: 'focus-pop-layer' }, state);
    // Should keep whatever the base layer's current activeFocusId is
    // (not restored since restoreFocusOnPop is false)
    expect(getActiveLayer(result.state)!.id).toBe('base');
  });

  it('emits layer events on pop', () => {
    let state = createFocusStackState(baseLayer());
    state = focusStackUpdate({ type: 'focus-push-layer', layer: modalLayer() }, state).state;

    const result = focusStackUpdate({ type: 'focus-pop-layer' }, state);
    const deactivated = result.events.find((e) => e.type === 'layer-deactivated');
    const activated = result.events.find((e) => e.type === 'layer-activated');
    expect(deactivated).toBeDefined();
    expect(deactivated!.type === 'layer-deactivated' && deactivated!.layerId).toBe('modal-1');
    expect(activated).toBeDefined();
    expect(activated!.type === 'layer-activated' && activated!.layerId).toBe('base');
  });
});

// ---------------------------------------------------------------------------
// focus-set
// ---------------------------------------------------------------------------

describe('focus-set', () => {
  it('sets focus to a specific element in a layer', () => {
    const state = createFocusStackState(baseLayer());
    const result = focusStackUpdate({ type: 'focus-set', layerId: 'base', elementId: 'btn-3' }, state);
    expect(getActiveFocusId(result.state)).toBe('btn-3');
  });

  it('ignores focus-set for nonexistent element', () => {
    const state = createFocusStackState(baseLayer());
    const result = focusStackUpdate({ type: 'focus-set', layerId: 'base', elementId: 'nope' }, state);
    expect(getActiveFocusId(result.state)).toBe('btn-1');
    expect(result.events).toHaveLength(0);
  });

  it('ignores focus-set for nonexistent layer', () => {
    const state = createFocusStackState(baseLayer());
    const result = focusStackUpdate({ type: 'focus-set', layerId: 'nope', elementId: 'btn-1' }, state);
    expect(result.state).toBe(state);
    expect(result.events).toHaveLength(0);
  });

  it('emits focus-left and focus-entered events', () => {
    const state = createFocusStackState(baseLayer());
    const result = focusStackUpdate({ type: 'focus-set', layerId: 'base', elementId: 'btn-2' }, state);

    expect(result.events).toHaveLength(2);
    const left = result.events.find((e) => e.type === 'focus-left');
    const entered = result.events.find((e) => e.type === 'focus-entered');
    expect(left!.type === 'focus-left' && left!.elementId).toBe('btn-1');
    expect(entered!.type === 'focus-entered' && entered!.elementId).toBe('btn-2');
  });
});

// ---------------------------------------------------------------------------
// focus-next / focus-prev
// ---------------------------------------------------------------------------

describe('focus-next', () => {
  it('moves focus forward', () => {
    const state = createFocusStackState(baseLayer());
    const result = focusStackUpdate({ type: 'focus-next' }, state);
    expect(getActiveFocusId(result.state)).toBe('btn-2');
  });

  it('wraps around at the end', () => {
    const state = createFocusStackState(baseLayer({ activeFocusId: 'btn-3' }));
    const result = focusStackUpdate({ type: 'focus-next' }, state);
    expect(getActiveFocusId(result.state)).toBe('btn-1');
  });

  it('handles single focusable element', () => {
    const state = createFocusStackState(baseLayer({ focusableIds: ['only'] }));
    const result = focusStackUpdate({ type: 'focus-next' }, state);
    // Wraps back to the same — no change
    expect(getActiveFocusId(result.state)).toBe('only');
  });

  it('handles empty focusableIds', () => {
    const state = createFocusStackState(baseLayer({ focusableIds: [] }));
    const result = focusStackUpdate({ type: 'focus-next' }, state);
    expect(result.events).toHaveLength(0);
  });
});

describe('focus-prev', () => {
  it('moves focus backward', () => {
    const state = createFocusStackState(baseLayer({ activeFocusId: 'btn-2' }));
    const result = focusStackUpdate({ type: 'focus-prev' }, state);
    expect(getActiveFocusId(result.state)).toBe('btn-1');
  });

  it('wraps around at the beginning', () => {
    const state = createFocusStackState(baseLayer());
    const result = focusStackUpdate({ type: 'focus-prev' }, state);
    expect(getActiveFocusId(result.state)).toBe('btn-3');
  });
});

// ---------------------------------------------------------------------------
// focus-escape
// ---------------------------------------------------------------------------

describe('focus-escape', () => {
  it('pops non-trapped layers', () => {
    let state = createFocusStackState(baseLayer());
    state = focusStackUpdate(
      {
        type: 'focus-push-layer',
        layer: { id: 'overlay-1', kind: 'overlay', trap: false, focusableIds: ['a', 'b'] },
      },
      state,
    ).state;

    const result = focusStackUpdate({ type: 'focus-escape' }, state);
    expect(result.state.layers).toHaveLength(1);
    expect(getActiveLayer(result.state)!.id).toBe('base');
  });

  it('emits focus-trapped for trapped layers', () => {
    let state = createFocusStackState(baseLayer());
    state = focusStackUpdate({ type: 'focus-push-layer', layer: modalLayer() }, state).state;

    const result = focusStackUpdate({ type: 'focus-escape' }, state);
    // Should NOT pop
    expect(result.state.layers).toHaveLength(2);
    const trapped = result.events.find((e) => e.type === 'focus-trapped');
    expect(trapped).toBeDefined();
    expect(trapped!.type === 'focus-trapped' && trapped!.attemptedAction).toBe('escape');
  });

  it('does not pop the base layer on escape', () => {
    const state = createFocusStackState(baseLayer());
    const result = focusStackUpdate({ type: 'focus-escape' }, state);
    expect(result.state.layers).toHaveLength(1);
    expect(result.events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// focus-sync-layer
// ---------------------------------------------------------------------------

describe('focus-sync-layer', () => {
  it('updates focusable list for a layer', () => {
    const state = createFocusStackState(baseLayer());
    const result = focusStackUpdate(
      {
        type: 'focus-sync-layer',
        layerId: 'base',
        focusableIds: ['x', 'y', 'z'],
      },
      state,
    );

    expect(getActiveLayer(result.state)!.focusableIds).toEqual(['x', 'y', 'z']);
  });

  it('resets activeFocusId if removed from list', () => {
    const state = createFocusStackState(baseLayer({ activeFocusId: 'btn-2' }));
    const result = focusStackUpdate(
      {
        type: 'focus-sync-layer',
        layerId: 'base',
        focusableIds: ['btn-1', 'btn-3'],
      },
      state,
    );

    expect(getActiveFocusId(result.state)).toBe('btn-1');
  });

  it('preserves activeFocusId if still in list', () => {
    const state = createFocusStackState(baseLayer({ activeFocusId: 'btn-2' }));
    const result = focusStackUpdate(
      {
        type: 'focus-sync-layer',
        layerId: 'base',
        focusableIds: ['btn-2', 'btn-4'],
      },
      state,
    );

    expect(getActiveFocusId(result.state)).toBe('btn-2');
  });

  it('ignores sync for nonexistent layer', () => {
    const state = createFocusStackState(baseLayer());
    const result = focusStackUpdate(
      {
        type: 'focus-sync-layer',
        layerId: 'nope',
        focusableIds: ['a'],
      },
      state,
    );
    expect(result.state).toBe(state);
    expect(result.events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

describe('query functions', () => {
  it('getActiveLayer returns the topmost layer', () => {
    let state = createFocusStackState(baseLayer());
    expect(getActiveLayer(state)!.id).toBe('base');

    state = focusStackUpdate({ type: 'focus-push-layer', layer: modalLayer() }, state).state;
    expect(getActiveLayer(state)!.id).toBe('modal-1');
  });

  it('getActiveFocusId returns the focused element in the top layer', () => {
    const state = createFocusStackState(baseLayer());
    expect(getActiveFocusId(state)).toBe('btn-1');
  });

  it('isLayerTrapped returns trap status of top layer', () => {
    let state = createFocusStackState(baseLayer());
    expect(isLayerTrapped(state)).toBe(false);

    state = focusStackUpdate({ type: 'focus-push-layer', layer: modalLayer() }, state).state;
    expect(isLayerTrapped(state)).toBe(true);
  });

  it('getLayerById finds layers in the stack', () => {
    let state = createFocusStackState(baseLayer());
    state = focusStackUpdate({ type: 'focus-push-layer', layer: modalLayer() }, state).state;

    expect(getLayerById(state, 'base')!.id).toBe('base');
    expect(getLayerById(state, 'modal-1')!.id).toBe('modal-1');
    expect(getLayerById(state, 'nope')).toBeUndefined();
  });
});
