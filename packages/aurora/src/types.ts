import type { Animatable, Interpolator, PhysicalAnimatable } from './interpolate.js';

export type { Animatable, Interpolator, PhysicalAnimatable };

export type EasingFn = (t: number) => number;

export interface Animation<T extends Animatable = number> {
  value(): T;
  done(): boolean;
  reset(): void;
  start(): void;
  stop(): void;
  tick(now?: number): void;
  pause(): void;
  resume(): void;
  seek(progress: number): void;
  reverse(): void;
  speed(factor: number): void;
  progress(): number;
  direction(): 1 | -1;
  playing(): boolean;
  duration?(): number;
}

export type TimedAnimation<T extends Animatable = number> = Animation<T> & {
  duration(): number;
};

export interface MotionAnimation<T extends PhysicalAnimatable = number> extends Animation<T> {
  velocity(): T;
}

export interface AnimationCallbacks<T extends Animatable = number> {
  onStart?: (animation: Animation<T>) => void;
  onUpdate?: (value: T, progress: number, animation: Animation<T>) => void;
  onComplete?: (animation: Animation<T>) => void;
  onCancel?: (animation: Animation<T>) => void;
}

export interface TweenConfig<T extends Animatable = number> extends AnimationCallbacks<T> {
  readonly from: T;
  readonly to: T;
  readonly duration: number;
  readonly easing?: EasingFn;
  readonly delay?: number;
  readonly interpolate?: Interpolator<T> | string;
}

export interface SpringConfig<T extends PhysicalAnimatable = number> extends AnimationCallbacks<T> {
  readonly stiffness: number;
  readonly damping: number;
  readonly mass?: number;
  readonly precision?: number;
  readonly velocityPrecision?: number;
  readonly from?: T;
  readonly initialVelocity?: T;
}

export interface DecayConfig extends AnimationCallbacks<number> {
  readonly velocity: number;
  readonly deceleration?: number;
  readonly restDelta?: number;
  readonly clamp?: readonly [number, number];
}

export interface Keyframe<T extends Animatable = number> {
  offset: number;
  value: T;
  easing?: EasingFn;
}

export interface KeyframesConfig<T extends Animatable = number> extends AnimationCallbacks<T> {
  keyframes: Keyframe<T>[];
  duration: number;
  loop?: boolean;
}

export interface PathConfig extends AnimationCallbacks<{ x: number; y: number }> {
  duration: number;
  easing?: EasingFn;
  loop?: boolean;
}

export interface SpringPreset {
  stiffness: number;
  damping: number;
  mass?: number;
  precision?: number;
}
