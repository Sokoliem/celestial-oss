import { describe, expect, it } from 'vitest';
import { createPointerCaptureState, getPointerCaptureOffset, isPointerCaptured, isPointerCaptureOwner, pointerCaptureUpdate } from '../pointer-capture.js';

describe('horizon pointer-capture re-export', () => {
  it('initial state has no active session', () => {
    const state = createPointerCaptureState();
    expect(isPointerCaptured(state)).toBe(false);
    expect(getPointerCaptureOffset(state)).toBeNull();
  });

  it('capture-start records owner + start position; capture-move updates offset', () => {
    let state = createPointerCaptureState();
    state = pointerCaptureUpdate({ type: 'capture-start', ownerId: 'splitter-h', x: 10, y: 5, reason: 'resize' }, state);
    expect(isPointerCaptured(state)).toBe(true);
    expect(isPointerCaptureOwner(state, 'splitter-h')).toBe(true);
    state = pointerCaptureUpdate({ type: 'capture-move', x: 14, y: 7 }, state);
    expect(getPointerCaptureOffset(state)).toEqual({ dx: 4, dy: 2 });
  });

  it('capture-release ends the session and records lastEnd.kind', () => {
    let state = createPointerCaptureState();
    state = pointerCaptureUpdate({ type: 'capture-start', ownerId: 'pane', x: 0, y: 0 }, state);
    state = pointerCaptureUpdate({ type: 'capture-release', x: 5, y: 0 }, state);
    expect(state.active).toBeNull();
    expect(state.lastEnd?.kind).toBe('released');
  });
});
