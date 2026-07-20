import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAG_THRESHOLD_CONFIG, getDragDistance, resolveDragThresholdConfig, shouldStartDrag } from '../drag-threshold.js';

describe('drag-threshold', () => {
  it('uses the default threshold', () => {
    expect(DEFAULT_DRAG_THRESHOLD_CONFIG.dragThresholdPx).toBe(3);
    expect(resolveDragThresholdConfig()).toEqual(DEFAULT_DRAG_THRESHOLD_CONFIG);
  });

  it('computes drag distance from the larger axis delta', () => {
    expect(getDragDistance({ x: 1, y: 1 }, { x: 4, y: 3 })).toBe(3);
  });

  it('starts dragging at the inclusive threshold', () => {
    expect(shouldStartDrag({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(true);
    expect(shouldStartDrag({ x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
  });

  it('allows an exact 0-pixel threshold', () => {
    expect(shouldStartDrag({ x: 7, y: 7 }, { x: 7, y: 7 }, { dragThresholdPx: 0 })).toBe(true);
  });
});
