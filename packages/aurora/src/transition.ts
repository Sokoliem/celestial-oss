import { tween } from './tween.js';
import type { Animation, EasingFn } from './types.js';
import { assertFiniteNumber, assertPositiveNumber } from './validation.js';

export interface Transition {
  /** Get the current smoothed value */
  value(): number;
  /** Set a new target value (starts or restarts the tween) */
  update(newTarget: number): void;
  /** Advance the animation */
  tick(now?: number): void;
}

export function transition(getCurrentValue: () => number, duration: number, easingFn?: EasingFn): Transition {
  if (typeof getCurrentValue !== 'function') {
    throw new TypeError('getCurrentValue must be a function');
  }

  const durationMs = assertPositiveNumber(duration, 'duration');
  let currentTween: Animation | null = null;

  function value(): number {
    if (currentTween !== null) {
      return currentTween.value();
    }
    return assertFiniteNumber(getCurrentValue(), 'current value');
  }

  function update(newTarget: number): void {
    const from = currentTween !== null ? currentTween.value() : assertFiniteNumber(getCurrentValue(), 'current value');
    currentTween = tween({
      from,
      to: assertFiniteNumber(newTarget, 'newTarget'),
      duration: durationMs,
      easing: easingFn,
    });
  }

  function tick(now?: number): void {
    if (currentTween !== null) {
      currentTween.tick(now);
      // A3: Don't null the completed tween here. Keep it alive so value()
      // returns its stable endpoint. Only a new update() call nulls it
      // (by replacing it with a new tween).
    }
  }

  return { value, update, tick };
}
