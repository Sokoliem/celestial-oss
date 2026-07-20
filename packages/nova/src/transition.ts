/**
 * Main transition API.
 *
 * Manages a state cache keyed by an explicit `id` (or the `key` if no id is
 * provided). When the key changes, a transition begins from the previously-
 * cached content to the new content. The `tick` option drives animation
 * progress; after `duration` ticks the transition completes and returns the
 * new content directly.
 */

import { type MotionPreference, shouldReduceMotion } from './motion.js';
import { applyStrategy } from './strategies/dispatch.js';
import type { FlipAxis } from './strategies/flip.js';
import type { GlitchOpts } from './strategies/glitch.js';
import type { RippleOrigin } from './strategies/ripple.js';
import type { ZoomMode, ZoomOrigin } from './strategies/zoom.js';

export interface TransitionOpts extends MotionPreference {
  /** When this changes, a transition starts. */
  key: string | number;
  /** Unique slot identifier for concurrent transitions.
   *  When provided, this is used as the state map lookup key instead of `key`.
   *  This prevents collisions when two independent slots use the same key values. */
  id?: string;
  /** Transition strategy. Default: 'crossfade'. */
  type?: 'slide' | 'crossfade' | 'wipe' | 'morph' | 'blur' | 'dissolve' | 'zoom' | 'ripple' | 'flip' | 'typewriter' | 'glitch';
  /** Direction for slide/wipe. Default: 'left'. */
  direction?: 'left' | 'right' | 'up' | 'down';
  /** Duration of the transition in ticks. Default: 6. */
  duration?: number;
  /** Current animation tick (monotonically increasing). */
  tick: number;
  /** Easing function applied to progress. Default: linear. */
  easing?: (t: number) => number;
  /** Zoom mode: 'in' (expand from origin) or 'out' (collapse to origin). Default: 'in'. */
  zoomMode?: ZoomMode;
  /** Zoom origin point. Default: center (0.5, 0.5). */
  zoomOrigin?: ZoomOrigin;
  /** Seed for dissolve determinism. Default: 42. */
  dissolveSeed?: number;
  /** Ripple origin. Default: center. */
  rippleOrigin?: RippleOrigin;
  /** Flip axis. Default: 'horizontal'. */
  flipAxis?: FlipAxis;
  /** Typewriter cursor. Default: '▌'. */
  typewriterCursor?: string;
  /** Glitch options (intensity, scanlineCycle, seed). */
  glitchOpts?: GlitchOpts;
}

interface TransitionState {
  previousContent: string;
  previousKey: string | number;
  startTick: number;
  active: boolean;
  lastTick: number;
}

// Idle entries not accessed within this many ticks are pruned from stateMap
// to prevent unbounded memory growth for slots that are never seen again
// (e.g. components that are unmounted after a single render).
const PRUNE_IDLE_AFTER_TICKS = 120;

const stateMap = new Map<string, TransitionState>();

/**
 * Clear all transition state. Useful for testing.
 */
export function resetTransitionState(): void {
  stateMap.clear();
}

/**
 * Returns the current frame for a transition.
 *
 * On the first call for a given slot, the content is returned as-is and
 * the key is stored. On subsequent calls where the key has changed, a
 * transition begins from the old content to the new content. The strategy
 * function is called with progress in [0, 1] each tick until the transition
 * completes.
 *
 * Use the `id` option to namespace independent transition slots that may
 * share key values.
 */
export function transition(content: string, opts: TransitionOpts): string {
  const {
    key,
    id,
    type = 'crossfade',
    direction = 'left',
    duration = 6,
    tick,
    easing,
    zoomMode,
    zoomOrigin,
    dissolveSeed,
    rippleOrigin,
    flipAxis,
    typewriterCursor,
    glitchOpts,
  } = opts;

  const strategyOptions = { direction, zoomMode, zoomOrigin, dissolveSeed, rippleOrigin, flipAxis, typewriterCursor, glitchOpts };

  // Use `id` as the state map key when provided, falling back to `key`.
  // This eliminates ambiguity when multiple slots share the same key values.
  const mapKey = id ?? String(key);

  if (shouldReduceMotion(opts)) {
    stateMap.delete(mapKey);
    return content;
  }

  // Prune stale idle entries to prevent unbounded memory growth when slots
  // are rendered once and then discarded (e.g. unmounted components).
  for (const [k, v] of stateMap) {
    if (!v.active && tick - v.lastTick > PRUNE_IDLE_AFTER_TICKS) {
      stateMap.delete(k);
    }
  }

  let state = stateMap.get(mapKey);

  if (!state) {
    // When using `id`, there is no ambiguity -- if no state exists under
    // this mapKey we simply haven't seen this slot before.
    //
    // When NOT using `id` (backwards-compat path), a key change means the
    // old entry lives under the old key. Try to find it by scanning for an
    // idle entry whose previousKey differs from the current key.
    if (id == null) {
      for (const [oldMapKey, oldState] of stateMap) {
        if (oldMapKey !== mapKey) {
          if (oldState.active) {
            // Mid-transition key change: capture current interpolated frame
            // as the new starting point and restart the transition.
            const progress = Math.min((tick - oldState.startTick) / duration, 1);
            const easedProgress = easing ? easing(progress) : progress;
            const captured = applyStrategy(type, oldState.previousContent, content, easedProgress, strategyOptions);
            state = {
              previousContent: captured,
              previousKey: key,
              startTick: tick,
              active: true,
              lastTick: tick,
            };
          } else {
            // Found a previous state that was idle. Transfer it.
            state = {
              previousContent: oldState.previousContent,
              previousKey: oldState.previousKey,
              startTick: tick,
              active: true,
              lastTick: tick,
            };
          }
          stateMap.delete(oldMapKey);
          stateMap.set(mapKey, state);
          break;
        }
      }
    }

    if (!state) {
      // Truly first call: no previous state at all. Store and return.
      stateMap.set(mapKey, {
        previousContent: content,
        previousKey: key,
        startTick: tick,
        active: false,
        lastTick: tick,
      });
      return content;
    }
  }

  // State exists for this slot.

  state.lastTick = tick;

  if (state.previousKey === key && !state.active) {
    // No key change and no active transition: just update content.
    state.previousContent = content;
    return content;
  }

  if (state.previousKey !== key && !state.active) {
    // Key changed! Start a new transition.
    state.startTick = tick;
    state.active = true;
    // previousContent and previousKey remain as the old values.
  }

  if (state.active) {
    // Issue 2 fix: check if key changed AGAIN mid-transition.
    if (state.previousKey !== key) {
      // Capture the current interpolated frame as the new starting point.
      const progress = Math.min((tick - state.startTick) / duration, 1);
      const easedProgress = easing ? easing(progress) : progress;
      state.previousContent = applyStrategy(type, state.previousContent, content, easedProgress, strategyOptions);
      state.previousKey = key;
      state.startTick = tick;
      // Continue with the new transition from the captured frame.
    }

    const elapsed = tick - state.startTick;
    const rawProgress = Math.min(1, elapsed / duration);
    const progress = easing ? easing(rawProgress) : rawProgress;

    if (rawProgress >= 1) {
      // Transition complete — delete entry from stateMap to prevent memory leak.
      // Completed transitions with active:false would otherwise accumulate forever.
      stateMap.delete(mapKey);
      return content;
    }

    // Produce the transition frame.
    return applyStrategy(type, state.previousContent, content, progress, strategyOptions);
  }

  // Fallback: no active transition, key matches.
  state.previousContent = content;
  return content;
}
