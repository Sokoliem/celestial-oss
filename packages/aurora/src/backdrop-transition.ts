/**
 * `createBackdropTransition` — opinionated wrapper over `ui-transition.ts`
 * for modal/drawer/overlay backdrop fades.
 *
 * Promoted in Phase 0 P0-12 (PRD §7.2.3). Q-T2 resolution: corona owns the
 * canonical duration default (`theme.motion.duration.backdrop`, 240ms);
 * `createBackdropTransition` accepts that value through options and falls
 * back to a hard 240ms when no theme value is provided.
 *
 * Consumers typically call:
 *
 * ```ts
 * import { theme } from '@celestial/corona';
 * import { createBackdropTransition } from '@celestial/aurora';
 * const state = createBackdropTransition({
 *   duration: theme.motion.duration.backdrop,
 *   reduceMotion: theme.motion.reduceMotion,
 * });
 * ```
 *
 * The bootstrap phase covers the first paint after a remount where the
 * backdrop should be visible immediately rather than fading in over the full
 * duration — useful when a HMR cycle re-creates the modal and we don't want
 * a fresh fade-in flash.
 */

import { createUiTransitionState, tickUiTransitionState, type UiTransitionConfig, type UiTransitionState } from './ui-transition.js';

/** Canonical fallback duration when no theme value is wired. Matches the
 * historical wrapper-side `WRAPPER_BACKDROP_TRANSITION_MS=240`. */
export const DEFAULT_BACKDROP_DURATION_MS = 240;

/** Canonical bootstrap window. The first ~80ms after creation, the backdrop
 * is treated as already-settled to avoid HMR remount flashes. */
export const DEFAULT_BACKDROP_BOOTSTRAP_MS = 80;

export interface CreateBackdropTransitionOptions {
  /**
   * Backdrop fade duration in ms. Defaults to {@link DEFAULT_BACKDROP_DURATION_MS}.
   * Callers wire this from `corona.theme.motion.duration.backdrop`.
   */
  readonly duration?: number;
  /**
   * Bootstrap window in ms during which `targetVisible` jumps directly to
   * the end state. Defaults to {@link DEFAULT_BACKDROP_BOOTSTRAP_MS}.
   */
  readonly bootstrapMs?: number;
  /**
   * Reduced-motion override. Defaults to `false`; callers wire this from
   * `corona.theme.motion.reduceMotion`.
   */
  readonly reduceMotion?: boolean;
  /**
   * Initial visibility. Defaults to `false` (backdrop hidden on mount).
   */
  readonly initiallyVisible?: boolean;
}

export interface BackdropTransitionState {
  readonly transition: UiTransitionState;
  /** Cumulative ms since creation; used to gate bootstrap behavior. */
  readonly ageMs: number;
  /** The resolved transition config (duration, easing, reduceMotion). */
  readonly config: Required<Pick<CreateBackdropTransitionOptions, 'duration' | 'bootstrapMs' | 'reduceMotion'>>;
}

/**
 * Construct a backdrop-transition state. Tick it forward with
 * {@link tickBackdropTransition}; mutate the target with
 * {@link setBackdropVisible}. Read the displayed opacity with
 * {@link getBackdropOpacity}.
 */
export function createBackdropTransition(options: CreateBackdropTransitionOptions = {}): BackdropTransitionState {
  const duration = options.duration ?? DEFAULT_BACKDROP_DURATION_MS;
  const bootstrapMs = options.bootstrapMs ?? DEFAULT_BACKDROP_BOOTSTRAP_MS;
  const reduceMotion = options.reduceMotion ?? false;
  const initiallyVisible = options.initiallyVisible ?? false;
  const uiConfig: UiTransitionConfig = { duration, reduceMotion, initiallyVisible };
  return {
    transition: createUiTransitionState(uiConfig),
    ageMs: 0,
    config: { duration, bootstrapMs, reduceMotion },
  };
}

/**
 * Advance the backdrop transition by `deltaMs`. Inside the bootstrap window
 * the transition is snapped to the target visibility (matches the
 * `wrapper-motion.ts` BOOTSTRAP_MS=80 behavior).
 */
export function tickBackdropTransition(state: BackdropTransitionState, deltaMs: number): BackdropTransitionState {
  const nextAge = state.ageMs + Math.max(0, deltaMs);
  const inBootstrap = nextAge <= state.config.bootstrapMs;
  const uiConfig: UiTransitionConfig = {
    duration: state.config.duration,
    reduceMotion: state.config.reduceMotion || inBootstrap,
  };
  const nextTransition = tickUiTransitionState(state.transition, deltaMs, uiConfig);
  return { ...state, transition: nextTransition, ageMs: nextAge };
}

/**
 * Set the backdrop's target visibility. Inside the bootstrap window the
 * change snaps instantly; outside it crossfades over `duration`.
 */
export function setBackdropVisible(state: BackdropTransitionState, visible: boolean): BackdropTransitionState {
  const inBootstrap = state.ageMs <= state.config.bootstrapMs;
  const uiConfig: UiTransitionConfig = {
    duration: state.config.duration,
    reduceMotion: state.config.reduceMotion || inBootstrap,
  };
  return {
    ...state,
    transition: setUiTransitionTargetSafe(state.transition, visible, uiConfig),
  };
}

/**
 * Resolve the backdrop's current opacity in [0, 1]. Maps `state.transition`'s
 * eased progress through the visible/exited contract.
 */
export function getBackdropOpacity(state: BackdropTransitionState): number {
  return getUiTransitionOpacitySafe(state.transition);
}

/**
 * Returns true once the backdrop has reached its target visibility.
 */
export function isBackdropSettled(state: BackdropTransitionState): boolean {
  return state.transition.phase === 'entered' || state.transition.phase === 'exited';
}

// ─── Re-imports kept local to avoid widening the public surface ─────────────
//
// These helpers re-import from `./ui-transition.js` instead of re-exporting
// them, so consumers reach for `createBackdropTransition` rather than the
// underlying state machine.

import { setUiTransitionTarget as setUiTransitionTargetSafe, getUiTransitionOpacity as getUiTransitionOpacitySafe } from './ui-transition.js';
