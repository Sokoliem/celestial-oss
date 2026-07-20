import { easing } from './easing.js';
import { keyframes } from './keyframes.js';
import { tween } from './tween.js';
import type { KeyframesConfig, TweenConfig } from './types.js';

type NumberTweenOptions = Partial<Omit<TweenConfig<number>, 'from' | 'to'>>;
type SlideUpValue = { y: number; opacity: number };
type SlideUpOptions = Partial<Omit<TweenConfig<SlideUpValue>, 'from' | 'to'>>;
type NumericKeyframeOptions = Partial<Omit<KeyframesConfig<number>, 'keyframes'>>;

export function fadeIn(options: NumberTweenOptions = {}) {
  return tween({
    from: 0,
    to: 1,
    duration: 200,
    easing: easing.easeOutCubic,
    ...options,
  });
}

export function slideUp(distance = 1, options: SlideUpOptions = {}) {
  return tween({
    from: { y: distance, opacity: 0 },
    to: { y: 0, opacity: 1 },
    duration: 240,
    easing: easing.easeOutCubic,
    ...options,
  });
}

export function pulse(scale = 1.08, options: NumericKeyframeOptions = {}) {
  return keyframes({
    keyframes: [
      { offset: 0, value: 1 },
      { offset: 0.5, value: scale, easing: easing.easeInOutSine },
      { offset: 1, value: 1, easing: easing.easeInOutSine },
    ],
    duration: 600,
    ...options,
  });
}

export function bounce(height = 1, options: NumericKeyframeOptions = {}) {
  return keyframes({
    keyframes: [
      { offset: 0, value: 0 },
      { offset: 0.35, value: -height, easing: easing.easeOutCubic },
      { offset: 0.6, value: 0, easing: easing.bounce },
      { offset: 0.8, value: -(height * 0.35), easing: easing.easeOutCubic },
      { offset: 1, value: 0, easing: easing.bounce },
    ],
    duration: 700,
    ...options,
  });
}

export function shake(distance = 1, options: NumericKeyframeOptions = {}) {
  return keyframes({
    keyframes: [
      { offset: 0, value: 0 },
      { offset: 0.15, value: -distance },
      { offset: 0.3, value: distance },
      { offset: 0.5, value: -(distance * 0.75) },
      { offset: 0.7, value: distance * 0.75 },
      { offset: 0.85, value: -(distance * 0.35) },
      { offset: 1, value: 0 },
    ],
    duration: 420,
    ...options,
  });
}

export function wobble(angle = 3, options: NumericKeyframeOptions = {}) {
  return keyframes({
    keyframes: [
      { offset: 0, value: 0 },
      { offset: 0.15, value: -angle },
      { offset: 0.3, value: angle * 0.8 },
      { offset: 0.45, value: -angle * 0.5 },
      { offset: 0.6, value: angle * 0.3 },
      { offset: 0.75, value: -angle * 0.15 },
      { offset: 1, value: 0, easing: easing.easeOutCubic },
    ],
    duration: 500,
    ...options,
  });
}

export function breatheAnimation(options: NumberTweenOptions = {}) {
  return tween({
    from: 0,
    to: 1,
    duration: 2000,
    easing: easing.easeInOutSine,
    ...options,
  });
}
