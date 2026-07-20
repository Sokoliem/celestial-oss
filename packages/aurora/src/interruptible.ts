import { clone } from './interpolate.js';
import type { Animation, MotionAnimation, PhysicalAnimatable } from './types.js';

export interface InterruptState<T extends PhysicalAnimatable = number> {
  readonly value: T;
  readonly velocity: T;
}

export interface InterruptibleAnimation<T extends PhysicalAnimatable = number> extends MotionAnimation<T> {
  handoff(factory: (state: InterruptState<T>) => Animation<T>): void;
}

function isMotionAnimation<T extends PhysicalAnimatable>(animation: Animation<T>): animation is MotionAnimation<T> {
  return typeof (animation as MotionAnimation<T>).velocity === 'function';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function zeroLike<T extends PhysicalAnimatable>(value: T): T {
  if (isNumber(value)) return 0 as T;
  if (isArray(value)) return value.map((entry) => zeroLike(entry as PhysicalAnimatable)) as T;
  if (isObject(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      result[key] = zeroLike(value[key] as PhysicalAnimatable);
    }
    return result as T;
  }
  return 0 as T;
}

function subtractValues<T extends PhysicalAnimatable>(current: T, previous: T): T {
  if (isNumber(current) && isNumber(previous)) {
    return (current - previous) as T;
  }

  if (isArray(current) && isArray(previous)) {
    return current.map((entry, index) => subtractValues(entry as PhysicalAnimatable, previous[index] as PhysicalAnimatable)) as T;
  }

  if (isObject(current) && isObject(previous)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(current)) {
      result[key] = subtractValues(current[key] as PhysicalAnimatable, previous[key] as PhysicalAnimatable);
    }
    return result as T;
  }

  return zeroLike(current);
}

function divideValue<T extends PhysicalAnimatable>(value: T, divisor: number): T {
  if (divisor === 0) {
    return zeroLike(value);
  }

  if (isNumber(value)) {
    return (value / divisor) as T;
  }

  if (isArray(value)) {
    return value.map((entry) => divideValue(entry as PhysicalAnimatable, divisor)) as T;
  }

  if (isObject(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      result[key] = divideValue(value[key] as PhysicalAnimatable, divisor);
    }
    return result as T;
  }

  return zeroLike(value);
}

export function interruptible<T extends PhysicalAnimatable = number>(animation: Animation<T>): InterruptibleAnimation<T> {
  let current = animation;
  let sampleValue = clone(current.value());
  let sampleVelocity = zeroLike(sampleValue);
  let sampleTime: number | null = null;

  function refreshSample(now?: number): void {
    if (isMotionAnimation(current)) {
      sampleValue = clone(current.value());
      sampleVelocity = clone(current.velocity());
      sampleTime = now ?? Date.now();
      return;
    }

    const time = now ?? Date.now();
    const nextValue = clone(current.value());
    if (sampleTime !== null) {
      const dtMs = time - sampleTime;
      if (dtMs > 0) {
        sampleVelocity = divideValue(subtractValues(nextValue, sampleValue), dtMs / 1000);
      }
    }
    sampleValue = nextValue;
    sampleTime = time;
  }

  function value(): T {
    return current.value();
  }

  function velocity(): T {
    if (isMotionAnimation(current)) {
      return current.velocity();
    }
    return clone(sampleVelocity);
  }

  function done(): boolean {
    return current.done();
  }

  function reset(): void {
    current.reset();
    sampleValue = clone(current.value());
    sampleVelocity = zeroLike(sampleValue);
    sampleTime = null;
  }

  function start(): void {
    current.start();
    sampleValue = clone(current.value());
    sampleVelocity = zeroLike(sampleValue);
    sampleTime = null;
  }

  function stop(): void {
    current.stop();
  }

  function tick(now?: number): void {
    current.tick(now);
    refreshSample(now);
  }

  function pause(): void {
    current.pause();
  }

  function resume(): void {
    current.resume();
  }

  function seek(progress: number): void {
    current.seek(progress);
    refreshSample();
  }

  function reverse(): void {
    current.reverse();
  }

  function speed(factor: number): void {
    current.speed(factor);
  }

  function progress(): number {
    return current.progress();
  }

  function direction(): 1 | -1 {
    return current.direction();
  }

  function playing(): boolean {
    return current.playing();
  }

  function handoff(factory: (state: InterruptState<T>) => Animation<T>): void {
    const state: InterruptState<T> = {
      value: clone(value()),
      velocity: clone(velocity()),
    };
    current.stop();
    current = factory(state);
    sampleValue = clone(current.value());
    sampleVelocity = clone(state.velocity);
    sampleTime = null;
  }

  const wrapped: InterruptibleAnimation<T> = {
    value,
    velocity,
    done,
    reset,
    start,
    stop,
    tick,
    pause,
    resume,
    seek,
    reverse,
    speed,
    progress,
    direction,
    playing,
    handoff,
  };

  return wrapped;
}
