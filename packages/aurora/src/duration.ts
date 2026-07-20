import type { Animatable, Animation, TimedAnimation } from './types.js';

export function animationDuration(animation: Animation<Animatable>): number | undefined {
  const duration = animation.duration?.();
  if (duration === undefined) return undefined;
  if (typeof duration !== 'number') {
    throw new TypeError('animation.duration() must return a number');
  }
  if (Number.isNaN(duration) || duration === Number.NEGATIVE_INFINITY || duration < 0) {
    throw new RangeError(`animation.duration() must be a non-negative number or Infinity, got ${duration}`);
  }
  return duration;
}

export function hasDuration<T extends Animation<Animatable>>(animation: T): animation is T & TimedAnimation {
  return typeof animation.duration === 'function' && animationDuration(animation) !== undefined;
}
