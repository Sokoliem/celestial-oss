import type { DecayConfig, MotionAnimation } from './types.js';
import { assertFiniteNumber, assertPositiveNumber, normalizeClamp, normalizeProgress, normalizeSpeed, resolveTimestamp } from './validation.js';

export interface DecayAnimation extends MotionAnimation<number> {}

interface DecayState {
  readonly position: number;
  readonly velocity: number;
  readonly done: boolean;
}

function simulateDecayState(
  from: number,
  initialVelocity: number,
  elapsedMs: number,
  deceleration: number,
  restDelta: number,
  clamp?: readonly [number, number],
): DecayState {
  const fixedDtMs = 16;
  const clampedElapsed = Math.max(0, elapsedMs);
  let position = from;
  let velocity = initialVelocity;
  let simulated = 0;

  while (simulated + fixedDtMs <= clampedElapsed) {
    position += velocity * (fixedDtMs / 1000);
    velocity *= deceleration;
    simulated += fixedDtMs;

    if (clamp) {
      const [min, max] = clamp;
      if (position < min || position > max) {
        return {
          position: Math.max(min, Math.min(max, position)),
          velocity: 0,
          done: true,
        };
      }
    }

    if (Math.abs(velocity) < restDelta) {
      return { position, velocity: 0, done: true };
    }
  }

  const remainder = clampedElapsed - simulated;
  if (remainder > 0) {
    position += velocity * (remainder / 1000);
    velocity *= Math.pow(deceleration, remainder / fixedDtMs);
  }

  if (clamp) {
    const [min, max] = clamp;
    if (position < min || position > max) {
      return {
        position: Math.max(min, Math.min(max, position)),
        velocity: 0,
        done: true,
      };
    }
  }

  if (Math.abs(velocity) < restDelta) {
    return { position, velocity: 0, done: true };
  }

  return { position, velocity, done: false };
}

function measureDecayDuration(from: number, velocity: number, deceleration: number, restDelta: number, clamp?: readonly [number, number]): number {
  for (let elapsed = 0; elapsed <= 10_000; elapsed += 16) {
    const simulated = simulateDecayState(from, velocity, elapsed, deceleration, restDelta, clamp);
    if (simulated.done) {
      return elapsed;
    }
  }

  return 10_000;
}

export function decay(from: number, config: DecayConfig): DecayAnimation {
  const initialFrom = assertFiniteNumber(from, 'from');
  const initialVelocity = assertFiniteNumber(config.velocity, 'velocity');
  const deceleration = assertPositiveNumber(config.deceleration ?? 0.95, 'deceleration');
  if (deceleration >= 1) {
    throw new RangeError(`deceleration must be < 1, got ${deceleration}`);
  }
  const restDelta = assertPositiveNumber(config.restDelta ?? 0.1, 'restDelta');
  const clamp = normalizeClamp(config.clamp);
  const { onStart, onUpdate, onComplete, onCancel } = config;
  const totalDuration = measureDecayDuration(initialFrom, initialVelocity, deceleration, restDelta, clamp);

  let position = initialFrom;
  let velocity = initialVelocity;
  let elapsedMs = 0;
  let isDone = false;
  let isStopped = false;
  let isPaused = false;
  let lastTime: number | null = null;
  let pausedTime: number | null = null;
  let playbackSpeed = 1;
  let playbackDirection: 1 | -1 = 1;
  let onStartFired = false;
  let onCompleteFired = false;
  let usesExternalClock = false;
  let lastProgress = 0;

  function applyState(simulatedElapsedMs: number): void {
    const simulated = simulateDecayState(initialFrom, initialVelocity * playbackDirection, simulatedElapsedMs, deceleration, restDelta, clamp);
    position = simulated.position;
    velocity = simulated.velocity;
    elapsedMs = simulatedElapsedMs;
    isDone = simulated.done;
    lastProgress = totalDuration === 0 ? 1 : Math.max(0, Math.min(1, simulatedElapsedMs / totalDuration));
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

    const delta = Math.max(0, (time - lastTime) * playbackSpeed);
    lastTime = time;
    applyState(Math.min(totalDuration, elapsedMs + delta));

    if (isDone) {
      if (!onCompleteFired && onComplete) {
        onCompleteFired = true;
        onComplete(animation);
      }
      return;
    }

    if (onUpdate) {
      onUpdate(position, lastProgress, animation);
    }
  }

  function value(): number {
    return position;
  }

  function currentVelocity(): number {
    return velocity;
  }

  function done(): boolean {
    return isDone;
  }

  function reset(): void {
    position = initialFrom;
    velocity = initialVelocity;
    elapsedMs = 0;
    isDone = false;
    isStopped = false;
    isPaused = false;
    lastTime = null;
    pausedTime = null;
    playbackSpeed = 1;
    playbackDirection = 1;
    onStartFired = false;
    onCompleteFired = false;
    usesExternalClock = false;
    lastProgress = 0;
  }

  function start(): void {
    position = playbackDirection === 1 ? initialFrom : simulateDecayState(initialFrom, initialVelocity, totalDuration, deceleration, restDelta, clamp).position;
    velocity = playbackDirection === 1 ? initialVelocity : 0;
    elapsedMs = 0;
    isDone = false;
    isStopped = false;
    isPaused = false;
    lastTime = null;
    pausedTime = null;
    playbackSpeed = 1;
    onStartFired = false;
    onCompleteFired = false;
    usesExternalClock = false;
    lastProgress = 0;
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
    const clampedProgress = normalizeProgress(progress);
    isStopped = false;
    isPaused = false;
    lastTime = Date.now();
    applyState(totalDuration * clampedProgress);
    onStartFired = clampedProgress > 0;
    onCompleteFired = clampedProgress >= 1;
  }

  function reverse(): void {
    playbackDirection = playbackDirection === 1 ? -1 : 1;
    velocity *= -1;
  }

  function speed(factor: number): void {
    playbackSpeed = normalizeSpeed(factor);
  }

  function progress(): number {
    return lastProgress;
  }

  function direction(): 1 | -1 {
    return playbackDirection;
  }

  function playing(): boolean {
    return !isStopped && !isPaused && !isDone;
  }

  const animation: DecayAnimation = {
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
    progress,
    direction,
    playing,
    duration: () => totalDuration,
  };

  return animation;
}
