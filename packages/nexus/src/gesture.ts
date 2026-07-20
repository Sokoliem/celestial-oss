/**
 * Gesture recognition from raw mouse events.
 *
 * Pure functions that transform a stream of MouseEventData into
 * higher-level GestureEvents (double-click, triple-click, swipe, long-press, zoom).
 */

// Re-declare the subset of MouseEventData we need so nexus has no
// runtime dependency on nebula. The shapes are structurally compatible.
export interface MouseEventData {
  type: 'press' | 'release' | 'move' | 'scroll-up' | 'scroll-down';
  button: 0 | 1 | 2 | 'none';
  x: number;
  y: number;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GestureConfig {
  doubleClickMs?: number;
  longPressMs?: number;
  swipeMinDistance?: number;
  swipeMaxDurationMs?: number;
}

export type GestureEvent =
  | { gesture: 'double-click'; x: number; y: number }
  | { gesture: 'triple-click'; x: number; y: number; selection: 'line' }
  | { gesture: 'long-press'; x: number; y: number; durationMs: number }
  | { gesture: 'swipe'; direction: 'up' | 'down' | 'left' | 'right'; distance: number; velocity: number }
  | { gesture: 'zoom'; delta: number; center: { x: number; y: number } };

export interface GestureState {
  lastPressTime: number;
  lastPressX: number;
  lastPressY: number;
  clickCount: number;
  pressStartTime: number | null;
  pressStartX: number;
  pressStartY: number;
  hasMoved: boolean;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_GESTURE_CONFIG: Required<GestureConfig> = {
  doubleClickMs: 300,
  longPressMs: 500,
  swipeMinDistance: 3,
  swipeMaxDurationMs: 300,
};

// ---------------------------------------------------------------------------
// Factory / helpers
// ---------------------------------------------------------------------------

export function createGestureState(): GestureState {
  return {
    lastPressTime: 0,
    lastPressX: 0,
    lastPressY: 0,
    clickCount: 0,
    pressStartTime: null,
    pressStartX: 0,
    pressStartY: 0,
    hasMoved: false,
  };
}

export function resolveConfig(config?: GestureConfig): Required<GestureConfig> {
  return { ...DEFAULT_GESTURE_CONFIG, ...config };
}

function isRepeatedPrimaryPress(state: GestureState, event: MouseEventData, ts: number, config: Required<GestureConfig>): boolean {
  return (
    event.button === 0 &&
    state.lastPressTime > 0 &&
    ts - state.lastPressTime <= config.doubleClickMs &&
    event.x === state.lastPressX &&
    event.y === state.lastPressY
  );
}

// ---------------------------------------------------------------------------
// Core processing
// ---------------------------------------------------------------------------

export function processMouseEvent(
  state: GestureState,
  event: MouseEventData,
  config: Required<GestureConfig>,
  now?: number,
): { state: GestureState; gestures: GestureEvent[] } {
  const ts = now ?? Date.now();
  const gestures: GestureEvent[] = [];

  switch (event.type) {
    case 'press': {
      const clickCount = event.button === 0 ? (isRepeatedPrimaryPress(state, event, ts, config) ? state.clickCount + 1 : 1) : 0;

      if (clickCount === 2) {
        gestures.push({ gesture: 'double-click', x: event.x, y: event.y });
      } else if (clickCount >= 3) {
        gestures.push({ gesture: 'triple-click', x: event.x, y: event.y, selection: 'line' });
      }

      return {
        state: {
          ...state,
          lastPressTime: event.button === 0 ? ts : 0,
          lastPressX: event.x,
          lastPressY: event.y,
          clickCount: clickCount >= 3 ? 0 : clickCount,
          pressStartTime: ts,
          pressStartX: event.x,
          pressStartY: event.y,
          hasMoved: false,
        },
        gestures,
      };
    }

    case 'release': {
      if (state.pressStartTime !== null) {
        const dx = event.x - state.pressStartX;
        const dy = event.y - state.pressStartY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const distance = Math.max(absDx, absDy);
        const duration = ts - state.pressStartTime;

        if (distance >= config.swipeMinDistance && duration <= config.swipeMaxDurationMs) {
          let direction: 'up' | 'down' | 'left' | 'right';
          if (absDx >= absDy) {
            direction = dx > 0 ? 'right' : 'left';
          } else {
            direction = dy > 0 ? 'down' : 'up';
          }
          const velocity = distance / duration;
          gestures.push({ gesture: 'swipe', direction, distance, velocity });
        }
      }

      return {
        state: {
          ...state,
          pressStartTime: null,
        },
        gestures,
      };
    }

    case 'move': {
      return {
        state: {
          ...state,
          hasMoved: true,
        },
        gestures,
      };
    }

    default: {
      if ((event.type === 'scroll-up' || event.type === 'scroll-down') && event.ctrl) {
        gestures.push({
          gesture: 'zoom',
          delta: event.type === 'scroll-up' ? 1 : -1,
          center: { x: event.x, y: event.y },
        });
      }
      return { state, gestures };
    }
  }
}

// ---------------------------------------------------------------------------
// Long-press helper (called externally on a timer)
// ---------------------------------------------------------------------------

export function checkLongPress(state: GestureState, config: Required<GestureConfig>, now?: number): GestureEvent | null {
  const ts = now ?? Date.now();

  if (state.pressStartTime === null) return null;
  if (state.hasMoved) return null;

  const elapsed = ts - state.pressStartTime;
  if (elapsed <= config.longPressMs) return null;

  return {
    gesture: 'long-press',
    x: state.pressStartX,
    y: state.pressStartY,
    durationMs: elapsed,
  };
}
