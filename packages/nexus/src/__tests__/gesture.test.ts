import { describe, expect, it } from 'vitest';
import { checkLongPress, createGestureState, DEFAULT_GESTURE_CONFIG, type GestureConfig, processMouseEvent, resolveConfig } from '../gesture.js';

// Minimal MouseEventData type matching nebula's interface
interface MouseEventData {
  type: 'press' | 'release' | 'move' | 'scroll-up' | 'scroll-down';
  button: 0 | 1 | 2 | 'none';
  x: number;
  y: number;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

function makeEvent(overrides: Partial<MouseEventData> & Pick<MouseEventData, 'type'>): MouseEventData {
  return {
    button: 0,
    x: 0,
    y: 0,
    ctrl: false,
    alt: false,
    shift: false,
    ...overrides,
  };
}

describe('createGestureState', () => {
  it('returns initial state with zeroed values', () => {
    const state = createGestureState();
    expect(state.lastPressTime).toBe(0);
    expect(state.lastPressX).toBe(0);
    expect(state.lastPressY).toBe(0);
    expect(state.clickCount).toBe(0);
    expect(state.pressStartTime).toBeNull();
    expect(state.pressStartX).toBe(0);
    expect(state.pressStartY).toBe(0);
    expect(state.hasMoved).toBe(false);
  });
});

describe('resolveConfig', () => {
  it('returns default config when called with no arguments', () => {
    const config = resolveConfig();
    expect(config).toEqual(DEFAULT_GESTURE_CONFIG);
  });

  it('merges partial config with defaults', () => {
    const config = resolveConfig({ doubleClickMs: 200 });
    expect(config.doubleClickMs).toBe(200);
    expect(config.longPressMs).toBe(DEFAULT_GESTURE_CONFIG.longPressMs);
    expect(config.swipeMinDistance).toBe(DEFAULT_GESTURE_CONFIG.swipeMinDistance);
    expect(config.swipeMaxDurationMs).toBe(DEFAULT_GESTURE_CONFIG.swipeMaxDurationMs);
  });

  it('respects all custom config values', () => {
    const custom: GestureConfig = {
      doubleClickMs: 100,
      longPressMs: 1000,
      swipeMinDistance: 5,
      swipeMaxDurationMs: 500,
    };
    const config = resolveConfig(custom);
    expect(config).toEqual(custom);
  });
});

describe('Double-click detection', () => {
  it('emits double-click for two presses at same position within threshold', () => {
    const config = resolveConfig();
    let state = createGestureState();

    // First press
    const first = processMouseEvent(state, makeEvent({ type: 'press', x: 5, y: 5 }), config, 1000);
    state = first.state;
    expect(first.gestures).toHaveLength(0);

    // Second press within threshold at same position
    const second = processMouseEvent(
      state,
      makeEvent({ type: 'press', x: 5, y: 5 }),
      config,
      1200, // 200ms later, within 300ms default
    );
    expect(second.gestures).toHaveLength(1);
    expect(second.gestures[0]).toEqual({
      gesture: 'double-click',
      x: 5,
      y: 5,
    });
  });

  it('emits double-click at the exact configured boundary', () => {
    const config = resolveConfig({ doubleClickMs: 300 });
    let state = createGestureState();

    state = processMouseEvent(state, makeEvent({ type: 'press', x: 5, y: 5 }), config, 1000).state;
    const second = processMouseEvent(state, makeEvent({ type: 'press', x: 5, y: 5 }), config, 1300);

    expect(second.gestures).toEqual([{ gesture: 'double-click', x: 5, y: 5 }]);
  });

  it('does NOT emit double-click when two presses are too far apart in time', () => {
    const config = resolveConfig();
    let state = createGestureState();

    const first = processMouseEvent(state, makeEvent({ type: 'press', x: 5, y: 5 }), config, 1000);
    state = first.state;

    const second = processMouseEvent(
      state,
      makeEvent({ type: 'press', x: 5, y: 5 }),
      config,
      1500, // 500ms later, exceeds 300ms default
    );
    expect(second.gestures).toHaveLength(0);
  });

  it('does NOT emit double-click when two presses are at different positions', () => {
    const config = resolveConfig();
    let state = createGestureState();

    const first = processMouseEvent(state, makeEvent({ type: 'press', x: 5, y: 5 }), config, 1000);
    state = first.state;

    const second = processMouseEvent(state, makeEvent({ type: 'press', x: 10, y: 10 }), config, 1200);
    expect(second.gestures).toHaveLength(0);
  });

  it('emits triple-click for three presses at the same position within threshold', () => {
    const config = resolveConfig({ doubleClickMs: 300 });
    let state = createGestureState();

    state = processMouseEvent(state, makeEvent({ type: 'press', x: 4, y: 6 }), config, 1000).state;
    state = processMouseEvent(state, makeEvent({ type: 'press', x: 4, y: 6 }), config, 1300).state;
    const third = processMouseEvent(state, makeEvent({ type: 'press', x: 4, y: 6 }), config, 1600);

    expect(third.gestures).toEqual([{ gesture: 'triple-click', x: 4, y: 6, selection: 'line' }]);
  });
});

describe('Swipe detection', () => {
  it('emits swipe right for press at (0,5) then release at (5,5) within time limit', () => {
    const config = resolveConfig();
    let state = createGestureState();

    const press = processMouseEvent(state, makeEvent({ type: 'press', x: 0, y: 5 }), config, 1000);
    state = press.state;

    const release = processMouseEvent(
      state,
      makeEvent({ type: 'release', x: 5, y: 5 }),
      config,
      1100, // 100ms, within 300ms limit
    );
    expect(release.gestures).toHaveLength(1);
    const gesture = release.gestures[0]!;
    expect(gesture.gesture).toBe('swipe');
    if (gesture.gesture === 'swipe') {
      expect(gesture.direction).toBe('right');
      expect(gesture.distance).toBe(5);
      expect(gesture.velocity).toBeCloseTo(5 / 100, 5);
    }
  });

  it('emits swipe left for press at (5,5) then release at (0,5)', () => {
    const config = resolveConfig();
    let state = createGestureState();

    const press = processMouseEvent(state, makeEvent({ type: 'press', x: 5, y: 5 }), config, 1000);
    state = press.state;

    const release = processMouseEvent(state, makeEvent({ type: 'release', x: 0, y: 5 }), config, 1100);
    expect(release.gestures).toHaveLength(1);
    const gesture = release.gestures[0]!;
    expect(gesture.gesture).toBe('swipe');
    if (gesture.gesture === 'swipe') {
      expect(gesture.direction).toBe('left');
      expect(gesture.distance).toBe(5);
    }
  });

  it('emits swipe up for press at (5,5) then release at (5,0)', () => {
    const config = resolveConfig();
    let state = createGestureState();

    const press = processMouseEvent(state, makeEvent({ type: 'press', x: 5, y: 5 }), config, 1000);
    state = press.state;

    const release = processMouseEvent(state, makeEvent({ type: 'release', x: 5, y: 0 }), config, 1100);
    expect(release.gestures).toHaveLength(1);
    const gesture = release.gestures[0]!;
    expect(gesture.gesture).toBe('swipe');
    if (gesture.gesture === 'swipe') {
      expect(gesture.direction).toBe('up');
      expect(gesture.distance).toBe(5);
    }
  });

  it('emits swipe down for press at (5,0) then release at (5,5)', () => {
    const config = resolveConfig();
    let state = createGestureState();

    const press = processMouseEvent(state, makeEvent({ type: 'press', x: 5, y: 0 }), config, 1000);
    state = press.state;

    const release = processMouseEvent(state, makeEvent({ type: 'release', x: 5, y: 5 }), config, 1100);
    expect(release.gestures).toHaveLength(1);
    const gesture = release.gestures[0]!;
    expect(gesture.gesture).toBe('swipe');
    if (gesture.gesture === 'swipe') {
      expect(gesture.direction).toBe('down');
      expect(gesture.distance).toBe(5);
    }
  });

  it('does NOT emit swipe when too slow (exceeds maxDuration)', () => {
    const config = resolveConfig();
    let state = createGestureState();

    const press = processMouseEvent(state, makeEvent({ type: 'press', x: 0, y: 5 }), config, 1000);
    state = press.state;

    const release = processMouseEvent(
      state,
      makeEvent({ type: 'release', x: 5, y: 5 }),
      config,
      1500, // 500ms, exceeds 300ms limit
    );
    expect(release.gestures).toHaveLength(0);
  });

  it('does NOT emit swipe when distance is too short', () => {
    const config = resolveConfig();
    let state = createGestureState();

    const press = processMouseEvent(state, makeEvent({ type: 'press', x: 5, y: 5 }), config, 1000);
    state = press.state;

    const release = processMouseEvent(
      state,
      makeEvent({ type: 'release', x: 6, y: 5 }),
      config,
      1100, // within time, but only 1 cell distance (< 3 min)
    );
    expect(release.gestures).toHaveLength(0);
  });
});

describe('Long-press detection', () => {
  it('checkLongPress emits gesture after timeout with no move', () => {
    const config = resolveConfig();
    let state = createGestureState();

    const press = processMouseEvent(state, makeEvent({ type: 'press', x: 3, y: 7 }), config, 1000);
    state = press.state;

    // Check after timeout (500ms default)
    const result = checkLongPress(state, config, 1600);
    expect(result).not.toBeNull();
    expect(result!.gesture).toBe('long-press');
    if (result && result.gesture === 'long-press') {
      expect(result.x).toBe(3);
      expect(result.y).toBe(7);
      expect(result.durationMs).toBe(600);
    }
  });

  it('checkLongPress returns null before timeout', () => {
    const config = resolveConfig();
    let state = createGestureState();

    const press = processMouseEvent(state, makeEvent({ type: 'press', x: 3, y: 7 }), config, 1000);
    state = press.state;

    // Check before timeout
    const result = checkLongPress(state, config, 1300); // only 300ms
    expect(result).toBeNull();
  });

  it('checkLongPress returns null after move', () => {
    const config = resolveConfig();
    let state = createGestureState();

    const press = processMouseEvent(state, makeEvent({ type: 'press', x: 3, y: 7 }), config, 1000);
    state = press.state;

    // Move event
    const move = processMouseEvent(state, makeEvent({ type: 'move', x: 4, y: 7 }), config, 1100);
    state = move.state;

    // Check after timeout — but we moved
    const result = checkLongPress(state, config, 1600);
    expect(result).toBeNull();
  });
});

describe('Regular click (no gesture)', () => {
  it('press + release at same position produces no gesture', () => {
    const config = resolveConfig();
    let state = createGestureState();

    const press = processMouseEvent(state, makeEvent({ type: 'press', x: 5, y: 5 }), config, 1000);
    state = press.state;
    expect(press.gestures).toHaveLength(0);

    const release = processMouseEvent(state, makeEvent({ type: 'release', x: 5, y: 5 }), config, 1050);
    expect(release.gestures).toHaveLength(0);
  });
});

describe('Custom config values', () => {
  it('uses custom doubleClickMs threshold', () => {
    const config = resolveConfig({ doubleClickMs: 100 });
    let state = createGestureState();

    const first = processMouseEvent(state, makeEvent({ type: 'press', x: 5, y: 5 }), config, 1000);
    state = first.state;

    // 150ms later — within default 300ms but beyond custom 100ms
    const second = processMouseEvent(state, makeEvent({ type: 'press', x: 5, y: 5 }), config, 1150);
    expect(second.gestures).toHaveLength(0);
  });

  it('uses custom swipeMinDistance', () => {
    const config = resolveConfig({ swipeMinDistance: 10 });
    let state = createGestureState();

    const press = processMouseEvent(state, makeEvent({ type: 'press', x: 0, y: 0 }), config, 1000);
    state = press.state;

    // 5 cells — would be enough with default 3, but not with custom 10
    const release = processMouseEvent(state, makeEvent({ type: 'release', x: 5, y: 0 }), config, 1100);
    expect(release.gestures).toHaveLength(0);
  });

  it('uses custom swipeMaxDurationMs', () => {
    const config = resolveConfig({ swipeMaxDurationMs: 100 });
    let state = createGestureState();

    const press = processMouseEvent(state, makeEvent({ type: 'press', x: 0, y: 0 }), config, 1000);
    state = press.state;

    // 200ms — within default 300ms but beyond custom 100ms
    const release = processMouseEvent(state, makeEvent({ type: 'release', x: 5, y: 0 }), config, 1200);
    expect(release.gestures).toHaveLength(0);
  });

  it('uses custom longPressMs', () => {
    const config = resolveConfig({ longPressMs: 1000 });
    let state = createGestureState();

    const press = processMouseEvent(state, makeEvent({ type: 'press', x: 3, y: 7 }), config, 1000);
    state = press.state;

    // 600ms — would trigger with default 500ms but not custom 1000ms
    const result = checkLongPress(state, config, 1600);
    expect(result).toBeNull();

    // 1100ms — beyond custom 1000ms
    const result2 = checkLongPress(state, config, 2100);
    expect(result2).not.toBeNull();
    expect(result2!.gesture).toBe('long-press');
  });
});

describe('Move events', () => {
  it('sets hasMoved flag on move event during a press', () => {
    const config = resolveConfig();
    let state = createGestureState();

    const press = processMouseEvent(state, makeEvent({ type: 'press', x: 5, y: 5 }), config, 1000);
    state = press.state;
    expect(state.hasMoved).toBe(false);

    const move = processMouseEvent(state, makeEvent({ type: 'move', x: 6, y: 5 }), config, 1050);
    state = move.state;
    expect(state.hasMoved).toBe(true);
  });
});

describe('Scroll events', () => {
  it('ctrl+scroll-up emits a zoom-in gesture centered on the pointer', () => {
    const config = resolveConfig();
    const state = createGestureState();

    const result = processMouseEvent(state, makeEvent({ type: 'scroll-up', x: 5, y: 5, button: 'none', ctrl: true }), config, 1000);
    expect(result.gestures).toEqual([{ gesture: 'zoom', delta: 1, center: { x: 5, y: 5 } }]);
  });

  it('ctrl+scroll-down emits a zoom-out gesture centered on the pointer', () => {
    const config = resolveConfig();
    const state = createGestureState();

    const result = processMouseEvent(state, makeEvent({ type: 'scroll-down', x: 7, y: 3, button: 'none', ctrl: true }), config, 1000);
    expect(result.gestures).toEqual([{ gesture: 'zoom', delta: -1, center: { x: 7, y: 3 } }]);
  });

  it('scroll-up event produces no gesture and does not crash', () => {
    const config = resolveConfig();
    const state = createGestureState();

    const result = processMouseEvent(state, makeEvent({ type: 'scroll-up', x: 5, y: 5, button: 'none' }), config, 1000);
    expect(result.gestures).toHaveLength(0);
  });

  it('scroll-down event produces no gesture and does not crash', () => {
    const config = resolveConfig();
    const state = createGestureState();

    const result = processMouseEvent(state, makeEvent({ type: 'scroll-down', x: 5, y: 5, button: 'none' }), config, 1000);
    expect(result.gestures).toHaveLength(0);
  });
});
