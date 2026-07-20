/**
 * Shared Element Transition — the "killer demo" compositor.
 *
 * Composes Nova's view-level transition strategies with the shared-element
 * rect interpolation system.  During a route change the background content
 * transitions using any Nova strategy (crossfade, blur, dissolve, zoom, …)
 * while shared elements simultaneously fly from their source positions to
 * their destination positions.
 *
 * The orchestrator exposes a tick-driven, immutable-state API that mirrors
 * the Elm Architecture used throughout Celestial.
 *
 * Usage:
 *   const controller = createSharedElementTransition({ strategy: 'zoom', duration: 8 });
 *   let state = controller.init();
 *   state = controller.capture(state, sourceElements);        // before route change
 *   state = controller.begin(state, tick);                     // start transition
 *   // each frame:
 *   state = controller.tick(state, currentTick);
 *   const frame = controller.renderBackground(state, oldContent, newContent);
 *   const rect  = controller.getElementRect(state, 'hero', destRect);
 *   // when done:
 *   state = controller.end(state);
 */

import { type MotionPreference, shouldReduceMotion } from './motion.js';
import {
  beginTransition,
  type CapturedElement,
  captureElements,
  createSharedElementState,
  endTransition,
  getInterpolatedRect,
  getTransitionProgress,
  isTransitioning,
  type LayoutRect,
  type SharedElementState,
} from './shared-element.js';
import { applyStrategy } from './strategies/dispatch.js';
import type { FlipAxis } from './strategies/flip.js';
import type { RippleOrigin } from './strategies/ripple.js';
import type { ZoomMode, ZoomOrigin } from './strategies/zoom.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SharedElementStrategy = 'slide' | 'crossfade' | 'wipe' | 'morph' | 'blur' | 'dissolve' | 'zoom' | 'ripple' | 'flip' | 'typewriter' | 'glitch';

export interface SharedElementTransitionConfig extends MotionPreference {
  /** Background transition strategy. Default: 'crossfade'. */
  strategy?: SharedElementStrategy;
  /** Direction for slide/wipe backgrounds. Default: 'left'. */
  direction?: 'left' | 'right' | 'up' | 'down';
  /** Duration in ticks. Default: 8. */
  duration?: number;
  /** Easing applied to both background and shared-element progress. */
  easing?: (t: number) => number;
  /** Zoom mode (for zoom strategy). */
  zoomMode?: ZoomMode;
  /** Zoom origin (for zoom strategy). */
  zoomOrigin?: ZoomOrigin;
  /** Dissolve seed (for dissolve strategy). */
  dissolveSeed?: number;
  /** Ripple origin (for ripple strategy). */
  rippleOrigin?: RippleOrigin;
  /** Flip axis (for flip strategy). */
  flipAxis?: FlipAxis;
  /** Typewriter cursor (for typewriter strategy). */
  typewriterCursor?: string;
  /** Callback when transition completes naturally. */
  onComplete?: () => void;
}

export interface SharedElementTransitionState {
  readonly sharedElements: SharedElementState;
  readonly tick: number;
  readonly active: boolean;
  readonly completed: boolean;
}

export interface SharedElementTransitionController {
  /** Create initial idle state. */
  init(): SharedElementTransitionState;
  /** Capture source element rects before route change. */
  capture(state: SharedElementTransitionState, elements: Map<string, CapturedElement>): SharedElementTransitionState;
  /** Begin the transition at the given tick. */
  begin(state: SharedElementTransitionState, tick: number): SharedElementTransitionState;
  /** Advance to the given tick. Returns updated state (auto-completes). */
  tick(state: SharedElementTransitionState, currentTick: number): SharedElementTransitionState;
  /** Render the background content frame using the configured strategy. */
  renderBackground(state: SharedElementTransitionState, oldContent: string, newContent: string): string;
  /** Get the interpolated rect for a shared element at the current tick. */
  getElementRect(state: SharedElementTransitionState, elementId: string, targetRect: LayoutRect): LayoutRect;
  /** Get raw progress [0, 1]. */
  progress(state: SharedElementTransitionState): number;
  /** Whether a transition is in flight. */
  isActive(state: SharedElementTransitionState): boolean;
  /** Manually end the transition. */
  end(state: SharedElementTransitionState): SharedElementTransitionState;
  /** Reset to initial state, clearing all captured elements. */
  reset(): SharedElementTransitionState;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSharedElementTransition(config: SharedElementTransitionConfig = {}): SharedElementTransitionController {
  const {
    strategy = 'crossfade',
    direction = 'left',
    duration = 8,
    easing,
    zoomMode,
    zoomOrigin,
    dissolveSeed,
    rippleOrigin,
    flipAxis = 'horizontal',
    typewriterCursor = '▌',
    onComplete,
  } = config;
  const reducedMotion = shouldReduceMotion(config);

  function makeInitState(): SharedElementTransitionState {
    return {
      sharedElements: createSharedElementState(),
      tick: 0,
      active: false,
      completed: false,
    };
  }

  function init(): SharedElementTransitionState {
    return makeInitState();
  }

  function capture(state: SharedElementTransitionState, elements: Map<string, CapturedElement>): SharedElementTransitionState {
    return {
      ...state,
      sharedElements: captureElements(state.sharedElements, elements),
    };
  }

  function begin(state: SharedElementTransitionState, currentTick: number): SharedElementTransitionState {
    if (reducedMotion) {
      onComplete?.();
      return {
        ...state,
        sharedElements: endTransition(state.sharedElements),
        tick: currentTick,
        active: false,
        completed: true,
      };
    }
    return {
      ...state,
      sharedElements: beginTransition(state.sharedElements, currentTick, duration),
      tick: currentTick,
      active: true,
      completed: false,
    };
  }

  function tickFn(state: SharedElementTransitionState, currentTick: number): SharedElementTransitionState {
    if (!state.active) return { ...state, tick: currentTick };

    const rawProgress = getTransitionProgress(state.sharedElements, currentTick);

    if (rawProgress >= 1 && !state.completed) {
      onComplete?.();
      return {
        ...state,
        sharedElements: endTransition(state.sharedElements),
        tick: currentTick,
        active: false,
        completed: true,
      };
    }

    return { ...state, tick: currentTick };
  }

  function computeProgress(state: SharedElementTransitionState): number {
    const raw = getTransitionProgress(state.sharedElements, state.tick);
    return easing ? easing(raw) : raw;
  }

  function renderBackground(state: SharedElementTransitionState, oldContent: string, newContent: string): string {
    if (!state.active && state.completed) return newContent;
    if (!state.active && !state.completed) return newContent;

    const p = computeProgress(state);
    return applyStrategy(strategy, oldContent, newContent, p, {
      direction,
      zoomMode,
      zoomOrigin,
      dissolveSeed,
      rippleOrigin,
      flipAxis,
      typewriterCursor,
    });
  }

  function getElementRect(state: SharedElementTransitionState, elementId: string, targetRect: LayoutRect): LayoutRect {
    if (!state.active) return targetRect;

    return getInterpolatedRect(state.sharedElements, elementId, targetRect, state.tick, easing);
  }

  function progressFn(state: SharedElementTransitionState): number {
    return computeProgress(state);
  }

  function isActive(state: SharedElementTransitionState): boolean {
    return state.active && isTransitioning(state.sharedElements);
  }

  function end(state: SharedElementTransitionState): SharedElementTransitionState {
    return {
      ...state,
      sharedElements: endTransition(state.sharedElements),
      active: false,
      completed: true,
    };
  }

  function reset(): SharedElementTransitionState {
    return makeInitState();
  }

  return {
    init,
    capture,
    begin,
    tick: tickFn,
    renderBackground,
    getElementRect,
    progress: progressFn,
    isActive,
    end,
    reset,
  };
}
