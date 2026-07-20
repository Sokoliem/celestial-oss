/**
 * Shared element transitions for the Celestial TUI framework.
 *
 * Track elements across view transitions by shared ID, interpolating
 * position from source to destination over a configurable duration.
 */

import { clampUnit, easedProgress, finiteNumber, nonNegativeNumber } from './validation.js';

export interface LayoutRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CapturedElement {
  rect: LayoutRect;
  content: string;
}

export interface SharedElementState {
  captured: ReadonlyMap<string, CapturedElement>;
  transitioning: boolean;
  startTick: number;
  duration: number;
}

/**
 * Create an initial shared element state with no captured elements
 * and no active transition.
 */
export function createSharedElementState(): SharedElementState {
  return {
    captured: new Map<string, CapturedElement>(),
    transitioning: false,
    startTick: 0,
    duration: 0,
  };
}

/**
 * Capture source element rects/content before a route change.
 * Returns a new state with the captured elements stored.
 */
export function captureElements(state: SharedElementState, elements: Map<string, CapturedElement>): SharedElementState {
  return {
    ...state,
    captured: new Map(elements),
  };
}

/**
 * Mark the beginning of a shared element transition.
 * Returns a new state with transitioning=true, the given startTick, and duration.
 */
export function beginTransition(state: SharedElementState, tick: number, duration: number): SharedElementState {
  return {
    ...state,
    transitioning: true,
    startTick: finiteNumber(tick, 'tick'),
    duration: nonNegativeNumber(duration, 'duration'),
  };
}

/**
 * End the current transition, clearing the transitioning flag.
 * Returns a new state.
 */
export function endTransition(state: SharedElementState): SharedElementState {
  return {
    ...state,
    transitioning: false,
  };
}

/**
 * Compute the raw transition progress as a clamped 0..1 value.
 */
export function getTransitionProgress(state: SharedElementState, tick: number): number {
  const duration = nonNegativeNumber(state.duration, 'state.duration');
  if (duration === 0) return 1;
  const elapsed = finiteNumber(tick, 'tick') - finiteNumber(state.startTick, 'state.startTick');
  return clampUnit(elapsed / duration);
}

/**
 * Whether a transition is currently in progress (started but not yet ended).
 */
export function isTransitioning(state: SharedElementState): boolean {
  return state.transitioning;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Cubic Bézier control points for a shared-element rect's (x, y) motion.
 * `control1` is the curve's pull-toward direction at the start of the
 * motion (P1 in a P0-P1-P2-P3 cubic Bézier); `control2` is the pull-toward
 * direction at the end (P2). Source rect supplies P0, target supplies P3.
 *
 * Use cases: arc the rect upward over a header (control1 above the
 * midpoint), bow it outward (both controls offset perpendicular to the
 * motion direction), bounce against a corner.
 *
 * `width` and `height` are NOT affected by the curve — they always
 * interpolate linearly between source and target.
 */
export interface RectMotionCurve {
  control1: { x: number; y: number };
  control2: { x: number; y: number };
}

/**
 * Cubic Bézier evaluation: B(t) = (1-t)³·P0 + 3(1-t)²t·P1 + 3(1-t)t²·P2 + t³·P3.
 * Each scalar coordinate (x or y) is computed independently; this helper
 * keeps the math in one place.
 */
function bezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const oneMinusT = 1 - t;
  const oneMinusT2 = oneMinusT * oneMinusT;
  const oneMinusT3 = oneMinusT2 * oneMinusT;
  const t2 = t * t;
  const t3 = t2 * t;
  return oneMinusT3 * p0 + 3 * oneMinusT2 * t * p1 + 3 * oneMinusT * t2 * p2 + t3 * p3;
}

/**
 * Pure helper: interpolate a rect from source to target along a cubic Bézier
 * curve. `width` and `height` interpolate linearly; only (x, y) follow the
 * curve. When `curve` is undefined the result matches a linear LERP.
 */
export function interpolateRectAlongCurve(source: LayoutRect, target: LayoutRect, t: number, curve?: RectMotionCurve): LayoutRect {
  const progress = clampUnit(t);
  const sourceRect = validateRect(source, 'source');
  const targetRect = validateRect(target, 'target');
  const control1 = curve ? validatePoint(curve.control1, 'curve.control1') : undefined;
  const control2 = curve ? validatePoint(curve.control2, 'curve.control2') : undefined;
  const x = control1 && control2 ? bezier(sourceRect.x, control1.x, control2.x, targetRect.x, progress) : lerp(sourceRect.x, targetRect.x, progress);
  const y = control1 && control2 ? bezier(sourceRect.y, control1.y, control2.y, targetRect.y, progress) : lerp(sourceRect.y, targetRect.y, progress);
  return {
    x,
    y,
    width: lerp(sourceRect.width, targetRect.width, progress),
    height: lerp(sourceRect.height, targetRect.height, progress),
  };
}

function validatePoint(point: { x: number; y: number }, name: string): { x: number; y: number } {
  return { x: finiteNumber(point.x, `${name}.x`), y: finiteNumber(point.y, `${name}.y`) };
}

function validateRect(rect: LayoutRect, name: string): LayoutRect {
  return {
    ...validatePoint(rect, name),
    width: nonNegativeNumber(rect.width, `${name}.width`),
    height: nonNegativeNumber(rect.height, `${name}.height`),
  };
}

/**
 * Given a shared element ID and its destination rect, interpolate between
 * the captured source rect and the destination.
 *
 * Progress = clamp((tick - startTick) / duration, 0, 1), with optional
 * easing applied. Each field (x, y, width, height) is interpolated linearly
 * by default. Pass a `curve` to send the (x, y) motion along a cubic Bézier
 * arc — width/height still interpolate linearly.
 *
 * If the ID is not in the captured map, returns targetRect unchanged.
 */
export function getInterpolatedRect(
  state: SharedElementState,
  id: string,
  targetRect: LayoutRect,
  tick: number,
  easing?: (t: number) => number,
  curve?: RectMotionCurve,
): LayoutRect {
  const captured = state.captured.get(id);
  if (!captured) {
    return validateRect(targetRect, 'targetRect');
  }

  const rawProgress = getTransitionProgress(state, tick);
  const t = easedProgress(easing, rawProgress);

  return interpolateRectAlongCurve(captured.rect, targetRect, t, curve);
}
