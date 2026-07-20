import type { EasingFn } from './types.js';
import { assertNonNegativeNumber, assertPositiveNumber, normalizeProgress } from './validation.js';

export type UiTransitionPhase = 'idle' | 'entering' | 'entered' | 'exiting' | 'exited';

export interface UiTransitionConfig {
  duration?: number;
  easing?: EasingFn;
  reduceMotion?: boolean;
  initiallyVisible?: boolean;
}

export interface UiTransitionState {
  readonly visible: boolean;
  readonly targetVisible: boolean;
  readonly phase: UiTransitionPhase;
  readonly elapsedMs: number;
  readonly durationMs: number;
  readonly progress: number;
  readonly easedProgress: number;
}

const DEFAULT_UI_TRANSITION_DURATION_MS = 160;

function resolveDuration(config?: UiTransitionConfig): number {
  return assertPositiveNumber(config?.duration ?? DEFAULT_UI_TRANSITION_DURATION_MS, 'duration');
}

function ease(progress: number, config?: UiTransitionConfig): number {
  return normalizeProgress(config?.easing ? config.easing(progress) : progress, 'eased progress');
}

function stateForTarget(visible: boolean, config?: UiTransitionConfig): UiTransitionState {
  const progress = visible ? 1 : 0;
  return {
    visible,
    targetVisible: visible,
    phase: visible ? 'entered' : 'exited',
    elapsedMs: resolveDuration(config),
    durationMs: resolveDuration(config),
    progress,
    easedProgress: ease(progress, config),
  };
}

/**
 * Create a reducer-friendly transition state. It stores only serializable
 * numbers and booleans, so consumers can tick it from Elm-style update loops.
 */
export function createUiTransitionState(config: UiTransitionConfig = {}): UiTransitionState {
  return stateForTarget(config.initiallyVisible ?? false, config);
}

/**
 * Set the desired visibility. Reduced-motion transitions complete
 * immediately, but keep the same state shape for consumers.
 */
export function setUiTransitionTarget(state: UiTransitionState, targetVisible: boolean, config: UiTransitionConfig = {}): UiTransitionState {
  const durationMs = resolveDuration(config);
  if (config.reduceMotion) {
    return stateForTarget(targetVisible, { ...config, duration: durationMs });
  }

  if (state.targetVisible === targetVisible) {
    return state;
  }

  const currentOpacity = getUiTransitionOpacity(state);
  const progress = normalizeProgress(targetVisible ? currentOpacity : 1 - currentOpacity);
  const elapsedMs = progress * durationMs;

  return {
    visible: state.visible || targetVisible,
    targetVisible,
    phase: targetVisible ? 'entering' : 'exiting',
    elapsedMs,
    durationMs,
    progress,
    easedProgress: ease(progress, config),
  };
}

/**
 * Advance a transition by elapsed milliseconds. Returns a terminal `entered`
 * or `exited` state once complete.
 */
export function tickUiTransitionState(state: UiTransitionState, deltaMs: number, config: UiTransitionConfig = {}): UiTransitionState {
  const delta = assertNonNegativeNumber(deltaMs, 'deltaMs');
  if (state.phase === 'entered' || state.phase === 'exited' || state.phase === 'idle') {
    return state;
  }
  if (config.reduceMotion) {
    return stateForTarget(state.targetVisible, { ...config, duration: state.durationMs });
  }

  const durationMs = assertPositiveNumber(state.durationMs || resolveDuration(config), 'durationMs');
  const elapsedMs = Math.min(durationMs, state.elapsedMs + delta);
  const progress = normalizeProgress(elapsedMs / durationMs);

  if (progress >= 1) {
    return stateForTarget(state.targetVisible, { ...config, duration: durationMs });
  }

  return {
    visible: true,
    targetVisible: state.targetVisible,
    phase: state.targetVisible ? 'entering' : 'exiting',
    elapsedMs,
    durationMs,
    progress,
    easedProgress: ease(progress, config),
  };
}

export function isUiTransitionComplete(state: UiTransitionState): boolean {
  return state.phase === 'entered' || state.phase === 'exited';
}

export function getUiTransitionOpacity(state: UiTransitionState): number {
  if (state.phase === 'entered') {
    return 1;
  }
  if (state.phase === 'exited') {
    return 0;
  }
  return state.targetVisible ? state.easedProgress : 1 - state.easedProgress;
}
