import { describe, expect, it } from 'vitest';
import {
  beginTransition,
  captureElements,
  createSharedElementState,
  getInterpolatedRect,
  interpolateRectAlongCurve,
  type RectMotionCurve,
} from '../shared-element.js';

const SOURCE = { x: 0, y: 0, width: 10, height: 5 };
const TARGET = { x: 100, y: 50, width: 20, height: 10 };

describe('interpolateRectAlongCurve', () => {
  it('without a curve, behaves identically to LERP', () => {
    const result = interpolateRectAlongCurve(SOURCE, TARGET, 0.5);
    expect(result.x).toBe(50);
    expect(result.y).toBe(25);
    expect(result.width).toBe(15);
    expect(result.height).toBe(7.5);
  });

  it('hits source at t=0 and target at t=1', () => {
    const curve: RectMotionCurve = { control1: { x: 50, y: 200 }, control2: { x: 50, y: -100 } };
    const start = interpolateRectAlongCurve(SOURCE, TARGET, 0, curve);
    const end = interpolateRectAlongCurve(SOURCE, TARGET, 1, curve);
    expect(start.x).toBeCloseTo(SOURCE.x, 4);
    expect(start.y).toBeCloseTo(SOURCE.y, 4);
    expect(end.x).toBeCloseTo(TARGET.x, 4);
    expect(end.y).toBeCloseTo(TARGET.y, 4);
  });

  it('a curve with control points well above the line bows the y-coordinate upward at the midpoint', () => {
    const curve: RectMotionCurve = { control1: { x: 33, y: 200 }, control2: { x: 66, y: 200 } };
    const linearMid = interpolateRectAlongCurve(SOURCE, TARGET, 0.5);
    const curvedMid = interpolateRectAlongCurve(SOURCE, TARGET, 0.5, curve);
    // Bezier with both controls at y=200 pulls the midpoint y above the linear value (25).
    expect(curvedMid.y).toBeGreaterThan(linearMid.y);
  });

  it('width and height are not affected by the curve (always linear)', () => {
    const curve: RectMotionCurve = { control1: { x: -500, y: 500 }, control2: { x: 500, y: -500 } };
    const linear = interpolateRectAlongCurve(SOURCE, TARGET, 0.4);
    const curved = interpolateRectAlongCurve(SOURCE, TARGET, 0.4, curve);
    expect(curved.width).toBe(linear.width);
    expect(curved.height).toBe(linear.height);
  });
});

describe('getInterpolatedRect with curve', () => {
  it('threads the curve through the captured-state path', () => {
    const captured = new Map([['hero', { rect: SOURCE, content: '' }]]);
    let state = createSharedElementState();
    state = captureElements(state, captured);
    state = beginTransition(state, 0, 10);

    const curve: RectMotionCurve = { control1: { x: 50, y: 200 }, control2: { x: 50, y: 200 } };
    const linear = getInterpolatedRect(state, 'hero', TARGET, 5);
    const curved = getInterpolatedRect(state, 'hero', TARGET, 5, undefined, curve);
    expect(curved.y).toBeGreaterThan(linear.y);
  });

  it('returns target unchanged when id is not captured (curve ignored)', () => {
    const state = createSharedElementState();
    const curve: RectMotionCurve = { control1: { x: 50, y: 50 }, control2: { x: 50, y: 50 } };
    const result = getInterpolatedRect(state, 'missing', TARGET, 5, undefined, curve);
    expect(result).toEqual(TARGET);
  });
});
