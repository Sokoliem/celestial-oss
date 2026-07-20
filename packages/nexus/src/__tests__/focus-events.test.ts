import { describe, expect, it } from 'vitest';
import { deriveFocusEvents } from '../focus-events.js';
import type { FocusStackState } from '../focus-stack.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(layers: { id: string; activeFocusId?: string }[]): FocusStackState {
  return {
    layers: layers.map((l) => ({
      id: l.id,
      kind: 'base' as const,
      trap: false,
      focusableIds: [],
      activeFocusId: l.activeFocusId,
    })),
    previousFocusIds: [],
  };
}

// ---------------------------------------------------------------------------
// deriveFocusEvents
// ---------------------------------------------------------------------------

describe('deriveFocusEvents', () => {
  it('returns empty array when nothing changed', () => {
    const state = makeState([{ id: 'base', activeFocusId: 'btn-1' }]);
    expect(deriveFocusEvents(state, state)).toEqual([]);
  });

  it('emits focus-left and focus-entered on focus change within same layer', () => {
    const prev = makeState([{ id: 'base', activeFocusId: 'btn-1' }]);
    const next = makeState([{ id: 'base', activeFocusId: 'btn-2' }]);

    const events = deriveFocusEvents(prev, next);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: 'focus-left',
      layerId: 'base',
      elementId: 'btn-1',
      nextElementId: 'btn-2',
    });
    expect(events[1]).toEqual({
      type: 'focus-entered',
      layerId: 'base',
      elementId: 'btn-2',
      previousElementId: 'btn-1',
    });
  });

  it('emits layer events when active layer changes (push)', () => {
    const prev = makeState([{ id: 'base', activeFocusId: 'btn-1' }]);
    const next: FocusStackState = {
      layers: [
        { id: 'base', kind: 'base', trap: false, focusableIds: [], activeFocusId: 'btn-1' },
        { id: 'modal', kind: 'modal', trap: true, focusableIds: [], activeFocusId: 'ok' },
      ],
      previousFocusIds: ['btn-1'],
    };

    const events = deriveFocusEvents(prev, next);
    expect(events).toHaveLength(4);

    expect(events[0]).toEqual({
      type: 'focus-left',
      layerId: 'base',
      elementId: 'btn-1',
      nextElementId: 'ok',
    });
    expect(events[1]).toEqual({
      type: 'layer-deactivated',
      layerId: 'base',
      nextLayerId: 'modal',
    });
    expect(events[2]).toEqual({
      type: 'layer-activated',
      layerId: 'modal',
      previousLayerId: 'base',
    });
    expect(events[3]).toEqual({
      type: 'focus-entered',
      layerId: 'modal',
      elementId: 'ok',
      previousElementId: 'btn-1',
    });
  });

  it('emits layer events when active layer changes (pop)', () => {
    const prev: FocusStackState = {
      layers: [
        { id: 'base', kind: 'base', trap: false, focusableIds: [], activeFocusId: 'btn-1' },
        { id: 'modal', kind: 'modal', trap: true, focusableIds: [], activeFocusId: 'ok' },
      ],
      previousFocusIds: ['btn-1'],
    };
    const next = makeState([{ id: 'base', activeFocusId: 'btn-1' }]);

    const events = deriveFocusEvents(prev, next);
    expect(events).toHaveLength(4);

    expect(events[0]!.type).toBe('focus-left');
    expect(events[1]!.type).toBe('layer-deactivated');
    expect(events[2]!.type).toBe('layer-activated');
    expect(events[3]!.type).toBe('focus-entered');
  });

  it('handles empty layer stacks', () => {
    const empty: FocusStackState = { layers: [], previousFocusIds: [] };
    const withLayer = makeState([{ id: 'base', activeFocusId: 'btn-1' }]);

    // From empty to having a layer
    const events1 = deriveFocusEvents(empty, withLayer);
    const activated = events1.find((e) => e.type === 'layer-activated');
    expect(activated).toBeDefined();

    // From having a layer to empty
    const events2 = deriveFocusEvents(withLayer, empty);
    const deactivated = events2.find((e) => e.type === 'layer-deactivated');
    expect(deactivated).toBeDefined();
  });

  it('handles layer without activeFocusId', () => {
    const prev = makeState([{ id: 'base' }]);
    const next = makeState([{ id: 'base', activeFocusId: 'btn-1' }]);

    const events = deriveFocusEvents(prev, next);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('focus-entered');
  });

  it('handles focus leaving without new focus', () => {
    const prev = makeState([{ id: 'base', activeFocusId: 'btn-1' }]);
    const next = makeState([{ id: 'base' }]);

    const events = deriveFocusEvents(prev, next);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('focus-left');
  });
});
