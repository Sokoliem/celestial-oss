import { describe, expect, it } from 'vitest';
import { createFocusStackState, type FocusLayer, focusStackUpdate } from '../focus-stack.js';
import { routeKeyboard } from '../layer-keyboard.js';

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

const noMod = { ctrl: false, shift: false, alt: false, meta: false };
const shiftMod = { ctrl: false, shift: true, alt: false, meta: false };

// ---------------------------------------------------------------------------
// Tab routing
// ---------------------------------------------------------------------------

describe('Tab routing', () => {
  it('produces focus-next for Tab', () => {
    const state = createFocusStackState(baseLayer());
    const result = routeKeyboard('Tab', noMod, state);

    expect(result.consumed).toBe(true);
    expect(result.layerId).toBe('base');
    expect(result.focusStackMsg).toEqual({ type: 'focus-next' });
  });

  it('produces focus-prev for Shift+Tab', () => {
    const state = createFocusStackState(baseLayer());
    const result = routeKeyboard('Tab', shiftMod, state);

    expect(result.consumed).toBe(true);
    expect(result.focusStackMsg).toEqual({ type: 'focus-prev' });
  });

  it('does not consume Tab when tabCycles is false', () => {
    const state = createFocusStackState(baseLayer());
    const result = routeKeyboard('Tab', noMod, state, { tabCycles: false });

    expect(result.consumed).toBe(false);
    expect(result.focusStackMsg).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Escape routing
// ---------------------------------------------------------------------------

describe('Escape routing', () => {
  it('produces focus-escape for Escape', () => {
    const state = createFocusStackState(baseLayer());
    const result = routeKeyboard('Escape', noMod, state);

    expect(result.consumed).toBe(true);
    expect(result.focusStackMsg).toEqual({ type: 'focus-escape' });
  });

  it('does not consume Escape when escapeCloses is false', () => {
    const state = createFocusStackState(baseLayer());
    const result = routeKeyboard('Escape', noMod, state, { escapeCloses: false });

    expect(result.consumed).toBe(false);
    expect(result.focusStackMsg).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Other keys
// ---------------------------------------------------------------------------

describe('other keys', () => {
  it('routes to active layer but does not consume', () => {
    const state = createFocusStackState(baseLayer());
    const result = routeKeyboard('Enter', noMod, state);

    expect(result.consumed).toBe(false);
    expect(result.layerId).toBe('base');
    expect(result.elementId).toBe('btn-1');
    expect(result.focusStackMsg).toBeUndefined();
  });

  it('routes to modal layer when modal is on top', () => {
    let state = createFocusStackState(baseLayer());
    state = focusStackUpdate({ type: 'focus-push-layer', layer: modalLayer() }, state).state;

    const result = routeKeyboard('Enter', noMod, state);
    expect(result.layerId).toBe('modal-1');
    expect(result.elementId).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('empty state', () => {
  it('returns not consumed when no layers exist', () => {
    const emptyState = { layers: [], previousFocusIds: [] };
    const result = routeKeyboard('Tab', noMod, emptyState);

    expect(result.consumed).toBe(false);
    expect(result.layerId).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Integration with focus stack
// ---------------------------------------------------------------------------

describe('integration', () => {
  it('Tab result can be dispatched to focus stack', () => {
    const state = createFocusStackState(baseLayer());
    const route = routeKeyboard('Tab', noMod, state);

    expect(route.focusStackMsg).toBeDefined();
    const result = focusStackUpdate(route.focusStackMsg!, state);
    expect(result.state.layers[0]!.activeFocusId).toBe('btn-2');
  });

  it('Escape result pops non-trapped overlay', () => {
    let state = createFocusStackState(baseLayer());
    state = focusStackUpdate(
      {
        type: 'focus-push-layer',
        layer: { id: 'overlay', kind: 'overlay', trap: false, focusableIds: ['a', 'b'] },
      },
      state,
    ).state;

    const route = routeKeyboard('Escape', noMod, state);
    expect(route.focusStackMsg).toBeDefined();

    const result = focusStackUpdate(route.focusStackMsg!, state);
    expect(result.state.layers).toHaveLength(1);
  });
});
