import { clone } from './interpolate.js';
import type { MotionAnimation, PhysicalAnimatable, SpringConfig } from './types.js';
import {
  assertCompatiblePhysicalShape,
  assertFinitePhysicalValue,
  assertNonNegativeNumber,
  assertPositiveNumber,
  normalizeProgress,
  normalizeSpeed,
  resolveTimestamp,
} from './validation.js';

export interface SpringAnimation<T extends PhysicalAnimatable = number> extends MotionAnimation<T> {
  setTarget(target: T): void;
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

type VelocityMap = PhysicalAnimatable;

function createZeroVelocity(template: PhysicalAnimatable): VelocityMap {
  if (isNumber(template)) return 0;
  if (isArray(template)) return template.map(() => 0);
  if (isObject(template)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(template)) {
      result[key] = createZeroVelocity(template[key] as PhysicalAnimatable);
    }
    return result;
  }
  return 0;
}

function createDefaultFrom(template: PhysicalAnimatable): PhysicalAnimatable {
  if (isNumber(template)) return 0;
  if (isArray(template)) return template.map(() => 0);
  if (isObject(template)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(template)) {
      result[key] = createDefaultFrom(template[key] as PhysicalAnimatable);
    }
    return result;
  }
  return template;
}

function springTickSingle(
  position: number,
  velocity: number,
  target: number,
  stiffness: number,
  damping: number,
  mass: number,
  dtSeconds: number,
): { position: number; velocity: number } {
  const displacement = position - target;
  const springForce = -stiffness * displacement;
  const dampingForce = -damping * velocity;
  const acceleration = (springForce + dampingForce) / mass;

  const nextVelocity = velocity + acceleration * dtSeconds;
  const nextPosition = position + nextVelocity * dtSeconds;

  return { position: nextPosition, velocity: nextVelocity };
}

function applyPhysics(
  position: PhysicalAnimatable,
  velocity: VelocityMap,
  target: PhysicalAnimatable,
  stiffness: number,
  damping: number,
  mass: number,
  dtSeconds: number,
): { position: PhysicalAnimatable; velocity: VelocityMap } {
  if (isNumber(position) && isNumber(velocity) && isNumber(target)) {
    return springTickSingle(position, velocity, target, stiffness, damping, mass, dtSeconds);
  }

  if (isArray(position) && isArray(velocity) && isArray(target)) {
    const nextPosition: unknown[] = [];
    const nextVelocity: unknown[] = [];

    for (let index = 0; index < position.length; index++) {
      const result = applyPhysics(
        position[index] as PhysicalAnimatable,
        velocity[index] as VelocityMap,
        target[index] as PhysicalAnimatable,
        stiffness,
        damping,
        mass,
        dtSeconds,
      );
      nextPosition[index] = result.position;
      nextVelocity[index] = result.velocity;
    }

    return { position: nextPosition as PhysicalAnimatable, velocity: nextVelocity as VelocityMap };
  }

  if (isObject(position) && isObject(velocity) && isObject(target)) {
    const nextPosition: Record<string, unknown> = {};
    const nextVelocity: Record<string, unknown> = {};

    for (const key of Object.keys(target)) {
      const result = applyPhysics(
        (position[key] ?? createDefaultFrom(target[key] as PhysicalAnimatable)) as PhysicalAnimatable,
        (velocity[key] ?? createZeroVelocity(target[key] as PhysicalAnimatable)) as VelocityMap,
        target[key] as PhysicalAnimatable,
        stiffness,
        damping,
        mass,
        dtSeconds,
      );
      nextPosition[key] = result.position;
      nextVelocity[key] = result.velocity;
    }

    return { position: nextPosition as PhysicalAnimatable, velocity: nextVelocity as VelocityMap };
  }

  return { position, velocity };
}

function isSettled(position: PhysicalAnimatable, target: PhysicalAnimatable, velocity: VelocityMap, posPrecision: number, velPrecision: number): boolean {
  if (isNumber(position) && isNumber(target) && isNumber(velocity)) {
    return Math.abs(position - target) < posPrecision && Math.abs(velocity) < velPrecision;
  }

  if (isArray(position) && isArray(target) && isArray(velocity)) {
    return position.every((entry, index) =>
      isSettled(entry as PhysicalAnimatable, target[index] as PhysicalAnimatable, velocity[index] as VelocityMap, posPrecision, velPrecision),
    );
  }

  if (isObject(position) && isObject(target) && isObject(velocity)) {
    return Object.keys(target).every((key) =>
      isSettled(
        (position[key] ?? createDefaultFrom(target[key] as PhysicalAnimatable)) as PhysicalAnimatable,
        target[key] as PhysicalAnimatable,
        (velocity[key] ?? createZeroVelocity(target[key] as PhysicalAnimatable)) as VelocityMap,
        posPrecision,
        velPrecision,
      ),
    );
  }

  return true;
}

function snapToTarget(position: PhysicalAnimatable, target: PhysicalAnimatable): PhysicalAnimatable {
  if (isNumber(position) && isNumber(target)) {
    return target;
  }

  if (isArray(position) && isArray(target)) {
    return position.map((_, index) => snapToTarget(position[index] as PhysicalAnimatable, target[index] as PhysicalAnimatable));
  }

  if (isObject(position) && isObject(target)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(target)) {
      result[key] = snapToTarget((position[key] ?? target[key]) as PhysicalAnimatable, target[key] as PhysicalAnimatable);
    }
    return result;
  }

  return position;
}

function zeroOutVelocity(velocity: VelocityMap): VelocityMap {
  if (isNumber(velocity)) return 0;
  if (isArray(velocity)) return velocity.map((entry) => zeroOutVelocity(entry as VelocityMap));
  if (isObject(velocity)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(velocity)) {
      result[key] = zeroOutVelocity(velocity[key] as VelocityMap);
    }
    return result;
  }
  return 0;
}

function hasNonFiniteValue(value: PhysicalAnimatable): boolean {
  if (isNumber(value)) {
    return !Number.isFinite(value);
  }

  if (isArray(value)) {
    return value.some((entry) => hasNonFiniteValue(entry as PhysicalAnimatable));
  }

  if (isObject(value)) {
    return Object.values(value).some((entry) => hasNonFiniteValue(entry as PhysicalAnimatable));
  }

  return false;
}

interface SimulatedSpringState {
  readonly position: PhysicalAnimatable;
  readonly velocity: VelocityMap;
  readonly done: boolean;
}

function simulateSpringState(
  elapsedMs: number,
  target: PhysicalAnimatable,
  from: PhysicalAnimatable,
  initialVelocity: VelocityMap,
  stiffness: number,
  damping: number,
  mass: number,
  precision: number,
  velocityPrecision: number,
  fixedDtMs: number,
): SimulatedSpringState {
  let position = clone(from);
  let velocity = clone(initialVelocity) as VelocityMap;
  const clampedElapsed = Math.max(0, elapsedMs);
  let simulated = 0;

  while (simulated + fixedDtMs <= clampedElapsed) {
    const result = applyPhysics(position, velocity, target, stiffness, damping, mass, fixedDtMs / 1000);
    position = result.position;
    velocity = result.velocity;
    simulated += fixedDtMs;

    if (isSettled(position, target, velocity, precision, velocityPrecision)) {
      return {
        position: snapToTarget(position, target),
        velocity: zeroOutVelocity(velocity),
        done: true,
      };
    }
  }

  const remainder = clampedElapsed - simulated;
  if (remainder > 0) {
    const result = applyPhysics(position, velocity, target, stiffness, damping, mass, remainder / 1000);
    position = result.position;
    velocity = result.velocity;
  }

  const done = isSettled(position, target, velocity, precision, velocityPrecision);
  return {
    position: done ? snapToTarget(position, target) : position,
    velocity: done ? zeroOutVelocity(velocity) : velocity,
    done,
  };
}

function measureSettledDuration(
  target: PhysicalAnimatable,
  from: PhysicalAnimatable,
  initialVelocity: VelocityMap,
  stiffness: number,
  damping: number,
  mass: number,
  precision: number,
  velocityPrecision: number,
  fixedDtMs: number,
): number {
  for (let elapsed = 0; elapsed <= 10_000; elapsed += fixedDtMs) {
    const simulated = simulateSpringState(elapsed, target, from, initialVelocity, stiffness, damping, mass, precision, velocityPrecision, fixedDtMs);
    if (simulated.done) {
      return elapsed;
    }
  }

  return 10_000;
}

function computeSettledProgress(
  position: PhysicalAnimatable,
  target: PhysicalAnimatable,
  velocity: VelocityMap,
  from: PhysicalAnimatable,
  done: boolean,
): number {
  if (isNumber(position) && isNumber(target) && isNumber(velocity) && isNumber(from)) {
    const displacement = Math.abs(position - target);
    const speed = Math.abs(velocity);
    const maxDisplacement = Math.abs(from - target) || 1;
    return done ? 1 : Math.max(0, Math.min(1, 1 - (displacement + speed) / (maxDisplacement * 2)));
  }

  return done ? 1 : 0.5;
}

export function spring<T extends PhysicalAnimatable = number>(target: T, config: SpringConfig<T>): SpringAnimation<T> {
  const normalizedTarget = assertFinitePhysicalValue(target, 'target') as T;
  const stiffness = assertNonNegativeNumber(config.stiffness, 'stiffness');
  const damping = assertNonNegativeNumber(config.damping, 'damping');
  const mass = assertPositiveNumber(config.mass ?? 1, 'mass');
  const precision = assertPositiveNumber(config.precision ?? 0.01, 'precision');
  const velocityPrecision = assertPositiveNumber(config.velocityPrecision ?? precision, 'velocityPrecision');
  const { onStart, onUpdate, onComplete, onCancel } = config;

  const fixedDtMs = 16;
  const fixedDt = fixedDtMs / 1000;
  const stabilityLimit = (2 * mass) / (fixedDt * fixedDt);
  if (stiffness > stabilityLimit) {
    throw new RangeError(
      `Spring stiffness ${stiffness} exceeds stability limit ${Math.floor(stabilityLimit)} for fixedDt=${fixedDtMs}ms and mass=${mass}. Reduce stiffness or increase mass.`,
    );
  }

  const initialTarget = clone(normalizedTarget);
  const initialFrom = config.from !== undefined ? (assertFinitePhysicalValue(config.from, 'from') as T) : (createDefaultFrom(normalizedTarget) as T);
  assertCompatiblePhysicalShape(initialTarget, initialFrom, 'from');
  const initialVelocity =
    config.initialVelocity !== undefined
      ? (assertFinitePhysicalValue(config.initialVelocity, 'initialVelocity') as VelocityMap)
      : (createZeroVelocity(normalizedTarget) as VelocityMap);
  assertCompatiblePhysicalShape(initialTarget, initialVelocity, 'initialVelocity');

  let currentTarget = clone(normalizedTarget);
  let position = clone(initialFrom);
  let velocity = clone(initialVelocity) as VelocityMap;
  let isDone = false;
  let isStopped = false;
  let isPaused = false;
  let pausedTime: number | null = null;
  let lastTime: number | null = null;
  let accumulator = 0;
  let playbackSpeed = 1;
  let playbackDirection: 1 | -1 = 1;
  let onStartFired = false;
  let onCompleteFired = false;
  let usesExternalClock = false;
  let lastProgress = 0;

  function updateProgress(): void {
    lastProgress = computeSettledProgress(position, currentTarget, velocity, initialFrom, isDone);
  }

  function applySimulatedState(elapsedMs: number): void {
    const simulated = simulateSpringState(
      elapsedMs,
      currentTarget,
      initialFrom,
      initialVelocity,
      stiffness,
      damping,
      mass,
      precision,
      velocityPrecision,
      fixedDtMs,
    );
    position = simulated.position as T;
    velocity = simulated.velocity;
    isDone = simulated.done;
    updateProgress();
  }

  function tick(now?: number): void {
    if (isStopped || isPaused || isDone) return;

    if (now !== undefined) {
      usesExternalClock = true;
    }

    const time = resolveTimestamp(now, lastTime);

    if (pausedTime !== null && lastTime !== null) {
      lastTime += time - pausedTime;
      pausedTime = null;
    }

    if (!onStartFired && onStart) {
      onStartFired = true;
      onStart(animation);
    }

    if (lastTime === null) {
      lastTime = time;
      return;
    }

    const elapsed = (time - lastTime) * playbackSpeed;
    lastTime = time;
    accumulator += elapsed;

    while (accumulator >= fixedDtMs) {
      const result = applyPhysics(position, velocity, currentTarget, stiffness, damping, mass, fixedDt);
      position = result.position as T;
      velocity = result.velocity;
      accumulator -= fixedDtMs;

      if (hasNonFiniteValue(position) || hasNonFiniteValue(velocity)) {
        throw new RangeError('Spring simulation diverged to a non-finite value.');
      }

      if (isSettled(position, currentTarget, velocity, precision, velocityPrecision)) {
        position = snapToTarget(position, currentTarget) as T;
        velocity = zeroOutVelocity(velocity);
        isDone = true;
        break;
      }
    }

    updateProgress();

    if (isDone) {
      if (!onCompleteFired && onComplete) {
        onCompleteFired = true;
        onComplete(animation);
      }
      return;
    }

    if (onUpdate) {
      onUpdate(position as T, lastProgress, animation);
    }
  }

  function value(): T {
    return position as T;
  }

  function currentVelocity(): T {
    return clone(velocity as T);
  }

  function done(): boolean {
    return isDone;
  }

  function reset(): void {
    currentTarget = clone(initialTarget);
    position = clone(initialFrom);
    velocity = clone(initialVelocity) as VelocityMap;
    isDone = false;
    isStopped = false;
    isPaused = false;
    pausedTime = null;
    lastTime = null;
    accumulator = 0;
    playbackDirection = 1;
    playbackSpeed = 1;
    onStartFired = false;
    onCompleteFired = false;
    usesExternalClock = false;
    lastProgress = 0;
  }

  function start(): void {
    isStopped = false;
    isPaused = false;
    isDone = false;
    pausedTime = null;
    lastTime = null;
    accumulator = 0;
    playbackSpeed = 1;
    onStartFired = false;
    onCompleteFired = false;
    usesExternalClock = false;
    updateProgress();
  }

  function stop(): void {
    if (!isDone && !isStopped && onCancel) {
      onCancel(animation);
    }
    isStopped = true;
  }

  function pause(): void {
    if (!isPaused && !isStopped) {
      isPaused = true;
      pausedTime = usesExternalClock ? (lastTime ?? Date.now()) : Date.now();
    }
  }

  function resume(): void {
    if (isPaused && pausedTime !== null) {
      if (!usesExternalClock && lastTime !== null) {
        const pauseDuration = Date.now() - pausedTime;
        lastTime += pauseDuration;
        pausedTime = null;
      } else if (lastTime === null) {
        pausedTime = null;
      }
      isPaused = false;
    }
  }

  function seek(progress: number): void {
    const clamped = normalizeProgress(progress);
    const settleDuration = measureSettledDuration(
      currentTarget,
      initialFrom,
      initialVelocity,
      stiffness,
      damping,
      mass,
      precision,
      velocityPrecision,
      fixedDtMs,
    );
    const targetElapsed = settleDuration * clamped;

    isStopped = false;
    isPaused = false;
    accumulator = 0;
    pausedTime = null;
    lastTime = lastTime ?? Date.now();
    onCompleteFired = clamped >= 1;
    onStartFired = clamped > 0;

    if (clamped === 0) {
      position = clone(initialFrom);
      velocity = clone(initialVelocity) as VelocityMap;
      isDone = false;
      lastProgress = 0;
      return;
    }

    applySimulatedState(targetElapsed);
    lastProgress = clamped;
  }

  function reverse(): void {
    playbackDirection = playbackDirection === 1 ? -1 : 1;
  }

  function speed(factor: number): void {
    playbackSpeed = normalizeSpeed(factor);
  }

  function getProgress(): number {
    return lastProgress;
  }

  function getDirection(): 1 | -1 {
    return playbackDirection;
  }

  function isPlaying(): boolean {
    return !isStopped && !isPaused && !isDone;
  }

  function setTarget(newTarget: T): void {
    const normalizedNewTarget = assertFinitePhysicalValue(newTarget, 'target') as T;
    assertCompatiblePhysicalShape(initialTarget, normalizedNewTarget, 'target');
    currentTarget = clone(normalizedNewTarget);
    isDone = false;
    isStopped = false;
    onStartFired = false;
    onCompleteFired = false;
    updateProgress();
  }

  const animation: SpringAnimation<T> = {
    value,
    velocity: currentVelocity,
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
    progress: getProgress,
    direction: getDirection,
    playing: isPlaying,
    setTarget,
    duration: () => measureSettledDuration(currentTarget, initialFrom, initialVelocity, stiffness, damping, mass, precision, velocityPrecision, fixedDtMs),
  };

  return animation;
}
