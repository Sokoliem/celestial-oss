import { describe, expect, it } from 'vitest';
import {
  createPointerCaptureState,
  getPointerCaptureLocalOffset,
  getPointerCaptureOffset,
  isPointerCaptured,
  isPointerCaptureOwner,
  pointerCaptureUpdate,
} from '../pointer-capture.js';

describe('pointer capture', () => {
  it('starts, moves, and releases a capture with offset and owner metadata', () => {
    let state = createPointerCaptureState<{ pane: string }>();

    state = pointerCaptureUpdate(
      {
        type: 'capture-start',
        id: 'cap-1',
        ownerId: 'sidebar-scrollbar',
        reason: 'scrollbar',
        regionId: 'region:scrollbar',
        layerId: 'sidebar',
        x: 10,
        y: 5,
        localX: 0,
        localY: 2,
        timestamp: 100,
        data: { pane: 'activity' },
      },
      state,
    );

    expect(isPointerCaptured(state)).toBe(true);
    expect(isPointerCaptureOwner(state, 'sidebar-scrollbar')).toBe(true);
    expect(state.active?.data).toEqual({ pane: 'activity' });

    state = pointerCaptureUpdate({ type: 'capture-move', x: 14, y: 9, localX: 4, localY: 6, timestamp: 120 }, state);

    expect(getPointerCaptureOffset(state)).toEqual({ dx: 4, dy: 4 });
    expect(getPointerCaptureLocalOffset(state)).toEqual({ dx: 4, dy: 4 });

    state = pointerCaptureUpdate({ type: 'capture-release', x: 15, y: 10, targetId: 'region:track', timestamp: 140 }, state);

    expect(state.active).toBeNull();
    expect(state.lastEnd).toMatchObject({
      kind: 'released',
      ownerId: 'sidebar-scrollbar',
      currentX: 15,
      currentY: 10,
      targetId: 'region:track',
    });
  });

  it('ignores moves and releases from another pointer id', () => {
    let state = createPointerCaptureState();
    state = pointerCaptureUpdate({ type: 'capture-start', ownerId: 'drag', pointerId: 'mouse:1', x: 1, y: 1 }, state);

    const moved = pointerCaptureUpdate({ type: 'capture-move', pointerId: 'mouse:2', x: 9, y: 9 }, state);
    expect(moved).toBe(state);

    const released = pointerCaptureUpdate({ type: 'capture-release', pointerId: 'mouse:2' }, state);
    expect(released).toBe(state);
  });

  it('records canceled and lost capture endings', () => {
    let state = createPointerCaptureState();
    state = pointerCaptureUpdate({ type: 'capture-start', ownerId: 'resize', reason: 'resize', x: 0, y: 0 }, state);
    state = pointerCaptureUpdate({ type: 'capture-cancel', detail: 'escape' }, state);

    expect(state.lastEnd?.kind).toBe('canceled');
    expect(state.lastEnd?.detail).toBe('escape');

    state = pointerCaptureUpdate({ type: 'capture-start', ownerId: 'drag', reason: 'drag', x: 0, y: 0 }, state);
    state = pointerCaptureUpdate({ type: 'capture-lost', detail: 'blur' }, state);

    expect(state.lastEnd?.kind).toBe('lost');
    expect(state.lastEnd?.detail).toBe('blur');
  });
});
