/**
 * Named UI motion presets — the chrome layer's vocabulary for opening
 * surfaces, fading rows in, blinking cursors, morphing status icons, and
 * sliding spans into a timeline.
 *
 * Each preset returns an `Animation<T>` (tween- or keyframes-based) that
 * the consumer drives via `tick()` / `value()` / `done()`. The presets'
 * job is to bake in the right duration, easing, and reduce-motion
 * short-circuit so primitive authors don't have to.
 *
 * **Reduce-motion contract** — when `opts.reduceMotion === true`, every
 * preset returns an animation that immediately sits at the *end* value.
 * The first `tick()` returns the settled state; `done()` returns true on
 * the same frame. Primitives that look correct only with motion *on* are
 * not done — the end frame must always be visually correct on its own.
 *
 * The legacy single-shape presets in `animation-presets.ts` (`fadeIn`,
 * `pulse`, `shake`, `bounce`, `wobble`, `slideUp`, `breatheAnimation`)
 * remain for callers that want a specific scale/distance preset; the UI
 * presets here are the consistent vocabulary for primitive chrome.
 */

import { easing } from './easing.js';
import { keyframes } from './keyframes.js';
import { tween } from './tween.js';
import type { Animation } from './types.js';

export type UiPresetName = 'softFade' | 'snap' | 'pulse' | 'morph' | 'slideIn';

export interface UiPresetOptions {
  /** When true, the animation snaps to its end frame on the first tick. */
  reduceMotion?: boolean;
  /** Override the default duration (ms). */
  duration?: number;
  /** Optional delay before the animation begins (ms). */
  delay?: number;
  /** Fires when the animation completes. */
  onComplete?: () => void;
  /** Fires if the animation is cancelled before completion. */
  onCancel?: () => void;
}

export interface UiPresetDescriptor {
  readonly name: UiPresetName;
  /** Documented baseline duration (ms). reduceMotion forces a 1ms terminal duration. */
  readonly defaultDurationMs: number;
  /** Whether the preset loops by default (only `pulse` does). */
  readonly loops: boolean;
}

/** Vec2 returned by `slideIn` — the consumer applies x as cell offset, opacity as dim/blend. */
export type SlideInValue = { x: number; opacity: number };

const NOOP = (): void => {};

function settledTween<T extends number | { x: number; y?: number; opacity?: number }>(value: T, opts: UiPresetOptions): Animation<T> {
  // Reduce-motion shortcut: a 1ms tween from end to end. The first tick()
  // crosses the duration boundary and `done()` returns true. The output
  // value is always the settled end value.
  return tween<T>({
    from: value,
    to: value,
    duration: 1,
    easing: easing.linear,
    onComplete: opts.onComplete,
    onCancel: opts.onCancel,
  });
}

/**
 * `softFade` — opacity 0 → 1 over 200ms, ease-out cubic. Used for
 * surface open, virtualList row enter, hover affordance reveal.
 */
export function softFade(opts: UiPresetOptions = {}): Animation<number> {
  if (opts.reduceMotion) return settledTween(1, opts);
  return tween({
    from: 0,
    to: 1,
    duration: opts.duration ?? 200,
    delay: opts.delay,
    easing: easing.easeOutCubic,
    onComplete: opts.onComplete ? () => opts.onComplete!() : undefined,
    onCancel: opts.onCancel ? () => opts.onCancel!() : undefined,
  });
}

/**
 * `snap` — opacity 1 → 0 over 100ms, ease-in cubic. Used for surface
 * close, toast dismiss, ephemeral affordance hide.
 */
export function snap(opts: UiPresetOptions = {}): Animation<number> {
  if (opts.reduceMotion) return settledTween(0, opts);
  return tween({
    from: 1,
    to: 0,
    duration: opts.duration ?? 100,
    delay: opts.delay,
    easing: easing.easeInCubic,
    onComplete: opts.onComplete ? () => opts.onComplete!() : undefined,
    onCancel: opts.onCancel ? () => opts.onCancel!() : undefined,
  });
}

/**
 * `pulse` — looped sine cycle between `min` (default 0.6) and `max`
 * (default 1.0) over 1600ms. Used for the streaming-text cursor, the
 * `running` status indicator on `toolCallCard`, and the `running` span
 * in `activityTimeline`. Different from `animation-presets.ts:pulse`,
 * which is a 600ms scale keyframe — pick this one when the goal is a
 * slow opacity heartbeat for "is alive" affordances.
 */
export function pulse(opts: UiPresetOptions & { min?: number; max?: number } = {}): Animation<number> {
  const min = opts.min ?? 0.6;
  const max = opts.max ?? 1.0;
  if (opts.reduceMotion) return settledTween(max, opts);
  return keyframes<number>({
    keyframes: [
      { offset: 0, value: min, easing: easing.easeInOutSine },
      { offset: 0.5, value: max, easing: easing.easeInOutSine },
      { offset: 1, value: min, easing: easing.easeInOutSine },
    ],
    duration: opts.duration ?? 1600,
    loop: true,
    onComplete: opts.onComplete ? () => opts.onComplete!() : undefined,
    onCancel: opts.onCancel ? () => opts.onCancel!() : undefined,
  });
}

/**
 * `morph` — 240ms ease-in-out cubic 0 → 1 cross-fade. Used for status
 * morph in `toolCallCard` (pending → running → success/error) where the
 * consumer paints both the previous and next glyph during the morph
 * window, with the previous dimming as the next brightens.
 */
export function morph(opts: UiPresetOptions = {}): Animation<number> {
  if (opts.reduceMotion) return settledTween(1, opts);
  return tween({
    from: 0,
    to: 1,
    duration: opts.duration ?? 240,
    delay: opts.delay,
    easing: easing.easeInOutCubic,
    onComplete: opts.onComplete ? () => opts.onComplete!() : undefined,
    onCancel: opts.onCancel ? () => opts.onCancel!() : undefined,
  });
}

/**
 * `slideIn` — 280ms ease-out cubic, x: distance → 0 + opacity 0 → 1.
 * Used for `activityTimeline` span entry from the right edge and any
 * other "this just appeared" inline affordance. `distance` defaults to
 * 4 cells; positive distance means slides in from the right.
 */
export function slideIn(distance = 4, opts: UiPresetOptions = {}): Animation<SlideInValue> {
  if (opts.reduceMotion) return settledTween<SlideInValue>({ x: 0, opacity: 1 }, opts);
  return tween<SlideInValue>({
    from: { x: distance, opacity: 0 },
    to: { x: 0, opacity: 1 },
    duration: opts.duration ?? 280,
    delay: opts.delay,
    easing: easing.easeOutCubic,
    onComplete: opts.onComplete ? () => opts.onComplete!() : undefined,
    onCancel: opts.onCancel ? () => opts.onCancel!() : undefined,
  });
}

/** Registry — primitive authors can look up a preset by name. */
export const uiPresets = {
  softFade,
  snap,
  pulse,
  morph,
  slideIn,
} as const;

/** Introspection metadata — duration / loop info for each preset. */
export const UI_PRESET_DESCRIPTORS: Readonly<Record<UiPresetName, UiPresetDescriptor>> = Object.freeze({
  softFade: { name: 'softFade', defaultDurationMs: 200, loops: false },
  snap: { name: 'snap', defaultDurationMs: 100, loops: false },
  pulse: { name: 'pulse', defaultDurationMs: 1600, loops: true },
  morph: { name: 'morph', defaultDurationMs: 240, loops: false },
  slideIn: { name: 'slideIn', defaultDurationMs: 280, loops: false },
});

// Suppress unused-import lint when consumers only pull the registry.
void NOOP;
