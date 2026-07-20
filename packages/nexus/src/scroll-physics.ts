/**
 * Scroll physics engine for 2D scroll with momentum, axis locking, overscroll, and snap.
 *
 * Wraps nebula's scroll-driver utilities. All functions are pure —
 * no timers, no mutation, no side effects.
 */

import {
  applyScrollDelta,
  createMomentumState,
  type MomentumState,
  scrollTo as nebulaScrollTo,
  type SnapPoint,
  snapToNearest,
  tickMomentum,
} from '@celestial/nebula';

// ─── Public types ────────────────────────────────────────────────────────────

export type AxisLock = 'none' | 'horizontal' | 'vertical' | 'auto';

export interface OverscrollConfig {
  /** 0..1 — how much displacement beyond boundary (0 = none, 1 = full) */
  elasticity: number;
  /** Hard cap in cells */
  maxOverscroll: number;
  /** Milliseconds for bounce-back interpolation */
  bounceBackMs: number;
}

export interface ScrollPhysicsConfig {
  maxX: number;
  maxY: number;
  friction?: number;
  snapPointsX?: SnapPoint[];
  snapPointsY?: SnapPoint[];
  axisLock?: AxisLock;
  overscroll?: OverscrollConfig;
}

export interface ScrollPhysicsState {
  x: MomentumState;
  y: MomentumState;
  axisLock: AxisLock;
  resolvedAxis: 'horizontal' | 'vertical' | null;
  overscrollX: number;
  overscrollY: number;
  isBouncing: boolean;
}

export type ScrollPhysicsMsg =
  | { type: 'scroll-delta'; dx: number; dy: number; timestamp: number }
  | { type: 'scroll-tick' }
  | { type: 'scroll-fling'; vx: number; vy: number }
  | { type: 'scroll-snap' }
  | { type: 'scroll-to'; x: number; y: number }
  | { type: 'scroll-reset' };

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_FRICTION = 0.92;
const BOUNCE_DECAY = 0.75;
const OVERSCROLL_EPSILON = 0.5;

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createScrollPhysicsState(config: ScrollPhysicsConfig): ScrollPhysicsState {
  return {
    x: createMomentumState(0),
    y: createMomentumState(0),
    axisLock: config.axisLock ?? 'none',
    resolvedAxis: null,
    overscrollX: 0,
    overscrollY: 0,
    isBouncing: false,
  };
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

export function scrollPhysicsUpdate(msg: ScrollPhysicsMsg, state: ScrollPhysicsState, config: ScrollPhysicsConfig): ScrollPhysicsState {
  switch (msg.type) {
    case 'scroll-delta':
      return handleScrollDelta(msg, state, config);
    case 'scroll-tick':
      return handleScrollTick(state, config);
    case 'scroll-fling':
      return handleScrollFling(msg, state);
    case 'scroll-snap':
      return handleScrollSnap(state, config);
    case 'scroll-to':
      return handleScrollTo(msg, state, config);
    case 'scroll-reset':
      return createScrollPhysicsState(config);
  }
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export function isScrollAnimating(state: ScrollPhysicsState): boolean {
  return state.x.isAnimating || state.y.isAnimating || state.isBouncing;
}

export function getScrollPosition(state: ScrollPhysicsState): { x: number; y: number } {
  return {
    x: state.x.offset + state.overscrollX,
    y: state.y.offset + state.overscrollY,
  };
}

// ─── Internal handlers ───────────────────────────────────────────────────────

function handleScrollDelta(msg: { dx: number; dy: number; timestamp: number }, state: ScrollPhysicsState, config: ScrollPhysicsConfig): ScrollPhysicsState {
  let { dx, dy } = msg;
  let resolvedAxis = state.resolvedAxis;

  // Axis lock resolution
  const lock = state.axisLock;
  if (lock === 'auto' && resolvedAxis === null) {
    resolvedAxis = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
  }

  const effectiveLock = lock === 'auto' ? resolvedAxis : lock;
  if (effectiveLock === 'horizontal') {
    dy = 0;
  } else if (effectiveLock === 'vertical') {
    dx = 0;
  }

  // Compute the raw target offset before clamping (for overscroll)
  const rawTargetX = state.x.offset + dx;
  const rawTargetY = state.y.offset + dy;

  // Delegate to nebula for clamped momentum
  const newX = applyScrollDelta(state.x, dx, msg.timestamp, config.maxX);
  const newY = applyScrollDelta(state.y, dy, msg.timestamp, config.maxY);

  // Compute overscroll
  let overscrollX = state.overscrollX;
  let overscrollY = state.overscrollY;

  if (config.overscroll) {
    overscrollX = computeOverscroll(rawTargetX, config.maxX, config.overscroll);
    overscrollY = computeOverscroll(rawTargetY, config.maxY, config.overscroll);
  }

  return {
    ...state,
    x: newX,
    y: newY,
    resolvedAxis,
    overscrollX,
    overscrollY,
  };
}

function handleScrollTick(state: ScrollPhysicsState, config: ScrollPhysicsConfig): ScrollPhysicsState {
  const friction = config.friction ?? DEFAULT_FRICTION;

  const newX = tickMomentum(state.x, config.maxX, friction);
  const newY = tickMomentum(state.y, config.maxY, friction);

  // Bounce back overscroll toward zero
  let overscrollX = state.overscrollX;
  let overscrollY = state.overscrollY;
  let isBouncing = state.isBouncing;

  if (state.overscrollX !== 0 || state.overscrollY !== 0) {
    isBouncing = true;
    overscrollX = decayOverscroll(state.overscrollX);
    overscrollY = decayOverscroll(state.overscrollY);

    if (overscrollX === 0 && overscrollY === 0) {
      isBouncing = false;
    }
  }

  return {
    ...state,
    x: newX,
    y: newY,
    overscrollX,
    overscrollY,
    isBouncing,
  };
}

function handleScrollFling(msg: { vx: number; vy: number }, state: ScrollPhysicsState): ScrollPhysicsState {
  return {
    ...state,
    x: {
      ...state.x,
      velocity: msg.vx,
      isAnimating: Math.abs(msg.vx) > 0,
      lastTimestamp: 0, // Reset so next applyScrollDelta uses default dt
    },
    y: {
      ...state.y,
      velocity: msg.vy,
      isAnimating: Math.abs(msg.vy) > 0,
      lastTimestamp: 0, // Reset so next applyScrollDelta uses default dt
    },
  };
}

function handleScrollSnap(state: ScrollPhysicsState, config: ScrollPhysicsConfig): ScrollPhysicsState {
  const snappedX = config.snapPointsX ? snapToNearest(state.x.offset, config.snapPointsX) : state.x.offset;
  const snappedY = config.snapPointsY ? snapToNearest(state.y.offset, config.snapPointsY) : state.y.offset;

  return {
    ...state,
    x: {
      ...state.x,
      offset: snappedX,
      velocity: 0,
      isAnimating: false,
    },
    y: {
      ...state.y,
      offset: snappedY,
      velocity: 0,
      isAnimating: false,
    },
  };
}

function handleScrollTo(msg: { x: number; y: number }, state: ScrollPhysicsState, config: ScrollPhysicsConfig): ScrollPhysicsState {
  return {
    ...state,
    x: {
      ...state.x,
      offset: nebulaScrollTo(msg.x, config.maxX),
      velocity: 0,
      isAnimating: false,
    },
    y: {
      ...state.y,
      offset: nebulaScrollTo(msg.y, config.maxY),
      velocity: 0,
      isAnimating: false,
    },
    overscrollX: 0,
    overscrollY: 0,
    isBouncing: false,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeOverscroll(rawTarget: number, maxOffset: number, overscroll: OverscrollConfig): number {
  let excess = 0;
  if (rawTarget < 0) {
    excess = rawTarget; // negative
  } else if (rawTarget > maxOffset) {
    excess = rawTarget - maxOffset; // positive
  }

  if (excess === 0) return 0;

  const elastic = excess * overscroll.elasticity;
  // Cap magnitude at maxOverscroll, preserving sign
  if (Math.abs(elastic) > overscroll.maxOverscroll) {
    return Math.sign(elastic) * overscroll.maxOverscroll;
  }
  return elastic;
}

function decayOverscroll(value: number): number {
  const next = value * BOUNCE_DECAY;
  if (Math.abs(next) < OVERSCROLL_EPSILON) return 0;
  return next;
}
