import type { Animatable, Animation, TimedAnimation } from './types.js';

export function animationDuration(animation: Animation<Animatable>): number | undefined {
  const duration = animation.duration?.();
  if (duration === undefined || Number.isNaN(duration)) return undefined;
  if (typeof duration !== 'number') {
    throw new TypeError('animation.duration() must return a number');
  }
  if (duration < 0) {
    throw new RangeError(`animation.duration() must be >= 0, got ${duration}`);
  }
  return duration;
}

export function hasDuration<T extends Animation<Animatable>>(animation: T): animation is T & TimedAnimation {
  return typeof animation.duration === 'function' && animationDuration(animation) !== undefined;
}
