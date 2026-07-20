import { type SpringAnimation, type SpringConfig, spring } from '@celestial/aurora';

const DEFAULT_SCALE = 1;
const DEFAULT_MIN_SCALE = 0.5;
const DEFAULT_MAX_SCALE = 3;
const DEFAULT_STEP = 0.1;
const DEFAULT_SPRING: SpringConfig<number> = {
  stiffness: 180,
  damping: 24,
  precision: 0.001,
};

export interface PinchZoomConfig {
  scale?: number;
  minScale?: number;
  maxScale?: number;
  step?: number;
  spring?: SpringConfig<number>;
}

export interface PinchZoomState {
  scale: number;
  targetScale: number;
  baseScale: number;
  centerX: number;
  centerY: number;
  minScale: number;
  maxScale: number;
  animation: SpringAnimation<number> | null;
}

export type PinchZoomMsg =
  | { type: 'zoom-in'; amount?: number; centerX?: number; centerY?: number }
  | { type: 'zoom-out'; amount?: number; centerX?: number; centerY?: number }
  | { type: 'zoom-reset'; centerX?: number; centerY?: number }
  | { type: 'zoom-to'; scale: number; centerX?: number; centerY?: number }
  | { type: 'zoom-tick'; now: number };

export function createPinchZoomState(config: PinchZoomConfig = {}): PinchZoomState {
  const minScale = config.minScale ?? DEFAULT_MIN_SCALE;
  const maxScale = Math.max(minScale, config.maxScale ?? DEFAULT_MAX_SCALE);
  const baseScale = clampScale(config.scale ?? DEFAULT_SCALE, minScale, maxScale);

  return {
    scale: baseScale,
    targetScale: baseScale,
    baseScale,
    centerX: 0,
    centerY: 0,
    minScale,
    maxScale,
    animation: null,
  };
}

export function pinchZoomUpdate(msg: PinchZoomMsg, state: PinchZoomState, config: PinchZoomConfig = {}): PinchZoomState {
  switch (msg.type) {
    case 'zoom-in':
      return startZoom(state, currentScale(state) + (msg.amount ?? config.step ?? DEFAULT_STEP), msg.centerX, msg.centerY, config);
    case 'zoom-out':
      return startZoom(state, currentScale(state) - (msg.amount ?? config.step ?? DEFAULT_STEP), msg.centerX, msg.centerY, config);
    case 'zoom-reset':
      return startZoom(state, state.baseScale, msg.centerX, msg.centerY, config);
    case 'zoom-to':
      return startZoom(state, msg.scale, msg.centerX, msg.centerY, config);
    case 'zoom-tick':
      return tickZoom(state, msg.now);
  }
}

export function getPinchZoomScale(state: PinchZoomState): number {
  return state.animation ? state.animation.value() : state.scale;
}

export function isPinchZoomAnimating(state: PinchZoomState): boolean {
  return state.animation !== null && !state.animation.done();
}

function startZoom(state: PinchZoomState, rawScale: number, centerX: number | undefined, centerY: number | undefined, config: PinchZoomConfig): PinchZoomState {
  const nextTarget = clampScale(rawScale, state.minScale, state.maxScale);
  const from = currentScale(state);

  if (Math.abs(from - nextTarget) < 0.0001) {
    state.animation?.stop();
    return {
      ...state,
      scale: nextTarget,
      targetScale: nextTarget,
      centerX: centerX ?? state.centerX,
      centerY: centerY ?? state.centerY,
      animation: null,
    };
  }

  state.animation?.stop();
  const animation = spring(nextTarget, {
    ...DEFAULT_SPRING,
    ...config.spring,
    from,
  });

  return {
    ...state,
    scale: from,
    targetScale: nextTarget,
    centerX: centerX ?? state.centerX,
    centerY: centerY ?? state.centerY,
    animation,
  };
}

function tickZoom(state: PinchZoomState, now: number): PinchZoomState {
  if (!state.animation) {
    return state;
  }

  state.animation.tick(now);
  const scale = clampScale(state.animation.value(), state.minScale, state.maxScale);

  if (state.animation.done()) {
    return {
      ...state,
      scale: state.targetScale,
      animation: null,
    };
  }

  return {
    ...state,
    scale,
  };
}

function currentScale(state: PinchZoomState): number {
  return clampScale(state.animation ? state.animation.value() : state.scale, state.minScale, state.maxScale);
}

function clampScale(scale: number, minScale: number, maxScale: number): number {
  return Math.max(minScale, Math.min(maxScale, scale));
}
