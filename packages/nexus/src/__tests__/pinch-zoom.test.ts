import { describe, expect, it } from 'vitest';
import { createPinchZoomState, getPinchZoomScale, isPinchZoomAnimating, pinchZoomUpdate } from '../pinch-zoom.js';

describe('pinch-zoom', () => {
  it('clamps initial scale into the configured range', () => {
    const state = createPinchZoomState({ scale: 10, minScale: 0.5, maxScale: 4 });
    expect(state.scale).toBe(4);
    expect(state.targetScale).toBe(4);
  });

  it('animates toward a larger scale', () => {
    let state = createPinchZoomState({ scale: 1 });
    state = pinchZoomUpdate({ type: 'zoom-in', amount: 0.5, centerX: 8, centerY: 4 }, state);
    expect(isPinchZoomAnimating(state)).toBe(true);
    expect(state.targetScale).toBe(1.5);
    expect(state.centerX).toBe(8);
    expect(state.centerY).toBe(4);

    state = pinchZoomUpdate({ type: 'zoom-tick', now: 0 }, state);
    state = pinchZoomUpdate({ type: 'zoom-tick', now: 160 }, state);
    expect(getPinchZoomScale(state)).toBeGreaterThan(1);
    expect(getPinchZoomScale(state)).toBeLessThanOrEqual(1.5);
  });

  it('clamps zoom-out to minScale', () => {
    let state = createPinchZoomState({ scale: 1, minScale: 0.75 });
    state = pinchZoomUpdate({ type: 'zoom-out', amount: 1 }, state);
    expect(state.targetScale).toBe(0.75);
  });

  it('resets to the configured base scale', () => {
    let state = createPinchZoomState({ scale: 1.25, minScale: 0.5, maxScale: 3 });
    state = pinchZoomUpdate({ type: 'zoom-to', scale: 2 }, state);
    state = pinchZoomUpdate({ type: 'zoom-reset' }, state);
    expect(state.targetScale).toBe(1.25);
  });
});
