import { describe, expect, it } from 'vitest';
import { createInertialDragState, getInertialDragOffset, inertialDragUpdate, isInertialDragAnimating } from '../inertial-drag.js';

describe('inertial-drag', () => {
  it('tracks offset and velocity while dragging', () => {
    let state = createInertialDragState<string>();
    state = inertialDragUpdate({ type: 'drag-start', sourceId: 'card-1', data: 'payload', x: 1, y: 1, timestamp: 0 }, state, []);
    state = inertialDragUpdate({ type: 'drag-move', x: 11, y: 6, timestamp: 100 }, state, []);

    expect(getInertialDragOffset(state)).toEqual({ x: 10, y: 5 });
    expect(state.velocityX).toBe(100);
    expect(state.velocityY).toBe(50);
  });

  it('flings and snaps to the nearest snap point when momentum finishes', () => {
    let state = createInertialDragState<string>();
    state = inertialDragUpdate({ type: 'drag-start', sourceId: 'card-1', data: 'payload', x: 0, y: 0, timestamp: 0 }, state, []);
    state = inertialDragUpdate({ type: 'drag-move', x: 32, y: 0, timestamp: 100 }, state, []);
    state = inertialDragUpdate({ type: 'drag-fling', velocityX: 90, velocityY: 0 }, state, [], {
      snapPointsX: [{ offset: 0 }, { offset: 50 }, { offset: 100 }],
      clampX: [0, 100],
      clampY: [0, 20],
    });

    expect(isInertialDragAnimating(state)).toBe(true);

    state = inertialDragUpdate({ type: 'drag-tick', now: 0 }, state, [], {
      snapPointsX: [{ offset: 0 }, { offset: 50 }, { offset: 100 }],
      clampX: [0, 100],
      clampY: [0, 20],
    });
    state = inertialDragUpdate({ type: 'drag-tick', now: 2000 }, state, [], {
      snapPointsX: [{ offset: 0 }, { offset: 50 }, { offset: 100 }],
      clampX: [0, 100],
      clampY: [0, 20],
    });

    expect(isInertialDragAnimating(state)).toBe(false);
    expect(getInertialDragOffset(state).x).toBe(50);
  });
});
