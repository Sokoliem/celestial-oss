/**
 * Looping transition controller.
 *
 * Where `createTransition` runs once and ends, `createLoopingTransition`
 * runs forever between two contents in one of three modes:
 *
 *   - `'forward'`  — old → new → old → new → … (instantaneous reset at the
 *                    cycle boundary; useful for "pulse" effects).
 *   - `'pingpong'` — old → new → old → new → … with a smooth reverse pass
 *                    (each cycle is two-phase: forward then backward).
 *   - `'reverse'`  — new → old → new → old → … (mirrored forward).
 *
 * Useful for ambient indicators (loading shimmer, status pulse, attention
 * draw on focused elements). Pure state machine — no internal timers, no
 * subscriptions; the caller drives ticks.
 */

import { type MotionPreference, shouldReduceMotion } from './motion.js';
import { applyStrategy, type StrategyKey } from './strategies/dispatch.js';
import type { FlipAxis } from './strategies/flip.js';
import type { GlitchOpts } from './strategies/glitch.js';
import type { RippleOrigin } from './strategies/ripple.js';
import type { ZoomMode, ZoomOrigin } from './strategies/zoom.js';

export type LoopingTransitionStrategy = Exclude<StrategyKey, 'none'>;

export type LoopingMode = 'forward' | 'reverse' | 'pingpong';

export interface LoopingTransitionConfig extends MotionPreference {
  /** Visual strategy. Default `'crossfade'`. */
  strategy?: LoopingTransitionStrategy;
  /** Cycle duration in ticks (one full loop, including reverse half for pingpong). Default `60`. */
  duration?: number;
  /** Loop direction. Default `'pingpong'`. */
  mode?: LoopingMode;
  /** Easing applied to the per-half progress. Default linear. */
  easing?: (t: number) => number;
  /** Optional pause at each endpoint, in ticks. Default `0`. */
  pauseTicks?: number;
  // Strategy-specific options (forwarded to the dispatcher).
  direction?: 'left' | 'right' | 'up' | 'down';
  zoomMode?: ZoomMode;
  zoomOrigin?: ZoomOrigin;
  dissolveSeed?: number;
  rippleOrigin?: RippleOrigin;
  flipAxis?: FlipAxis;
  typewriterCursor?: string;
  glitchOpts?: GlitchOpts;
}

export interface LoopingTransitionController {
  /** Begin the loop at `startTick`. */
  start(startTick: number): void;
  /** Stop the loop. The next render returns the current frame frozen. */
  stop(tick?: number): void;
  /** Whether the loop is currently running. */
  readonly running: boolean;
  /** Produce the current frame for the given tick. Returns oldContent before start. */
  render(oldContent: string, newContent: string, tick: number): string;
  /** Raw progress in [0, 1] within the current half-cycle. Useful for diagnostics. */
  progress(tick: number): number;
}

/**
 * Compute the per-half progress for a given tick.
 *
 * The loop has two halves (forward + reverse for pingpong; each half is a
 * full crossfade for forward/reverse). Each half spans `halfDuration` ticks.
 * Endpoints can pause for `pauseTicks` before transitioning.
 */
function computeHalfProgress(elapsed: number, halfDuration: number, pauseTicks: number, mode: LoopingMode): { progress: number; halfIndex: 0 | 1 } {
  const halfPlusPause = halfDuration + pauseTicks;
  const cycleLength = halfPlusPause * 2;
  const inCycle = ((elapsed % cycleLength) + cycleLength) % cycleLength;

  let halfIndex: 0 | 1;
  let withinHalf: number;
  if (inCycle < halfPlusPause) {
    halfIndex = 0;
    withinHalf = inCycle;
  } else {
    halfIndex = 1;
    withinHalf = inCycle - halfPlusPause;
  }

  // Pause at the start of each half: the visible progress stays at 0 for
  // pauseTicks, then animates over halfDuration.
  let p: number;
  if (withinHalf < pauseTicks) {
    p = 0;
  } else {
    p = halfDuration <= 0 ? 1 : Math.min(1, (withinHalf - pauseTicks) / halfDuration);
  }

  // For 'forward': both halves go 0→1 (snap reset between).
  // For 'reverse': both halves go 1→0.
  // For 'pingpong': half 0 goes 0→1, half 1 goes 1→0.
  if (mode === 'forward') return { progress: p, halfIndex };
  if (mode === 'reverse') return { progress: 1 - p, halfIndex };
  // pingpong
  return { progress: halfIndex === 0 ? p : 1 - p, halfIndex };
}

export function createLoopingTransition(config: LoopingTransitionConfig = {}): LoopingTransitionController {
  const strategy = config.strategy ?? 'crossfade';
  const duration = config.duration ?? 60;
  const mode = config.mode ?? 'pingpong';
  const easing = config.easing;
  const pauseTicks = Math.max(0, config.pauseTicks ?? 0);
  // Forward/reverse spend the whole duration on one direction; pingpong splits.
  const halfDuration = mode === 'pingpong' ? Math.max(0, Math.floor(duration / 2 - pauseTicks)) : Math.max(0, duration - pauseTicks);
  const reducedMotion = shouldReduceMotion(config);

  let started = false;
  let startTick = 0;
  let stopped = false;
  let lastProgress = 0;
  let stoppedProgress = 0;

  function rawProgressAt(tick: number): number {
    if (!started) return 0;
    if (stopped) return stoppedProgress;
    const elapsed = tick - startTick;
    const { progress } = computeHalfProgress(elapsed, halfDuration, pauseTicks, mode);
    lastProgress = progress;
    return progress;
  }

  return {
    start(s: number): void {
      started = true;
      stopped = false;
      startTick = s;
      lastProgress = 0;
      stoppedProgress = 0;
    },

    stop(tick?: number): void {
      stoppedProgress = tick === undefined ? lastProgress : rawProgressAt(tick);
      stopped = true;
    },

    get running(): boolean {
      return started && !stopped && !reducedMotion;
    },

    progress(tick: number): number {
      if (reducedMotion) return 1;
      return rawProgressAt(tick);
    },

    render(oldContent: string, newContent: string, tick: number): string {
      if (!started) return oldContent;
      if (reducedMotion) return newContent;
      const raw = rawProgressAt(tick);
      const eased = easing ? easing(raw) : raw;
      return applyStrategy(strategy, oldContent, newContent, eased, {
        direction: config.direction,
        zoomMode: config.zoomMode,
        zoomOrigin: config.zoomOrigin,
        dissolveSeed: config.dissolveSeed,
        rippleOrigin: config.rippleOrigin,
        flipAxis: config.flipAxis,
        typewriterCursor: config.typewriterCursor,
        glitchOpts: config.glitchOpts,
        clampProgress: true,
      });
    },
  };
}
