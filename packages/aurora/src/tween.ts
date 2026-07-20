import { clone, interpolateValue, interpolateWithType } from './interpolate.js';
import type { Animatable, Animation, EasingFn, TweenConfig } from './types.js';
import {
  assertFiniteNumber,
  assertNoNonFiniteNumbers,
  assertNonNegativeNumber,
  assertPositiveNumber,
  normalizeProgress,
  normalizeSpeed,
  resolveTimestamp,
} from './validation.js';

export function tween<T extends Animatable = number>(config: TweenConfig<T>): Animation<T> {
  const { from, to, duration, delay = 0, onStart, onUpdate, onComplete, onCancel } = config;
  const durationMs = assertPositiveNumber(duration, 'duration');
  const delayMs = assertNonNegativeNumber(delay, 'delay');
  assertNoNonFiniteNumbers(from, 'from');
  assertNoNonFiniteNumbers(to, 'to');

  const easingFn: EasingFn = config.easing ?? ((t: number) => t);
  const interpolateType = typeof config.interpolate === 'string' ? config.interpolate : undefined;
  const interpolate =
    typeof config.interpolate === 'function'
      ? config.interpolate
      : interpolateType
        ? (f: T, t: T, p: number) => interpolateWithType(f, t, p, interpolateType)
        : interpolateValue;

  let startTime: number | null = null;
  let pausedTime: number | null = null;
  let lastTickTime: number | null = null;
  let currentValue = clone(from);
  let lastProgress = 0;
  let isDone = false;
  let isStopped = false;
  let isPaused = false;
  let playbackDirection: 1 | -1 = 1;
  let playbackSpeed = 1;
  let onStartFired = false;
  let onCompleteFired = false;
  let usesExternalClock = false;
  const effectiveDuration = durationMs;

  function calculateProgress(time: number): number {
    if (startTime === null) {
      return 0;
    }

    const elapsed = (time - startTime) * playbackSpeed;
    const adjustedDelay = playbackDirection === 1 ? delayMs : 0;
    const animElapsed = playbackDirection === 1 ? elapsed - adjustedDelay : effectiveDuration - elapsed;

    return Math.max(0, Math.min(1, animElapsed / durationMs));
  }

  function calculateElapsed(time: number): number {
    if (startTime === null) {
      return 0;
    }

    return (time - startTime) * playbackSpeed;
  }

  function tick(now?: number): void {
    if (isStopped || isPaused || isDone) return;

    if (now !== undefined) {
      usesExternalClock = true;
    }

    const time = resolveTimestamp(now, lastTickTime);

    if (pausedTime !== null && startTime !== null) {
      startTime += time - pausedTime;
      pausedTime = null;
    }

    lastTickTime = time;

    if (startTime === null) {
      startTime = time;
      if (!onStartFired && onStart) {
        onStartFired = true;
        onStart(animation);
      }
    }

    const elapsed = (time - startTime) * playbackSpeed;
    const adjustedDelay = playbackDirection === 1 ? delayMs : 0;

    if ((playbackDirection === 1 && elapsed < adjustedDelay) || (playbackDirection === -1 && elapsed < 0)) {
      currentValue = playbackDirection === 1 ? clone(from) : clone(to);
      lastProgress = playbackDirection === 1 ? 0 : 1;
      isDone = false;
      return;
    }

    const animElapsed = playbackDirection === 1 ? elapsed - adjustedDelay : effectiveDuration - elapsed;

    if (playbackDirection === 1 && animElapsed >= durationMs) {
      currentValue = playbackDirection === 1 ? clone(to) : clone(from);
      lastProgress = 1;
      isDone = true;
      if (!onCompleteFired && onComplete) {
        onCompleteFired = true;
        onComplete(animation);
      }
      return;
    }

    if (animElapsed <= 0 && playbackDirection === -1) {
      currentValue = clone(from);
      lastProgress = 0;
      isDone = true;
      if (!onCompleteFired && onComplete) {
        onCompleteFired = true;
        onComplete(animation);
      }
      return;
    }

    const rawProgress = animElapsed / durationMs;
    const progress = Math.max(0, Math.min(1, rawProgress));
    const easedProgress = assertFiniteNumber(easingFn(progress), 'easing result');
    lastProgress = progress;

    currentValue = interpolate(clone(from), clone(to), easedProgress);
    assertNoNonFiniteNumbers(currentValue, 'interpolated value');
    isDone = false;

    if (onUpdate) {
      onUpdate(currentValue, progress, animation);
    }
  }

  function value(): T {
    return currentValue;
  }

  function done(): boolean {
    return isDone;
  }

  function reset(): void {
    startTime = null;
    pausedTime = null;
    lastTickTime = null;
    currentValue = clone(from);
    lastProgress = 0;
    isDone = false;
    isStopped = false;
    isPaused = false;
    playbackDirection = 1;
    playbackSpeed = 1;
    onStartFired = false;
    onCompleteFired = false;
  }

  function start(): void {
    startTime = null;
    pausedTime = null;
    lastTickTime = null;
    currentValue = playbackDirection === 1 ? clone(from) : clone(to);
    lastProgress = playbackDirection === 1 ? 0 : 1;
    isDone = false;
    isStopped = false;
    isPaused = false;
    playbackSpeed = 1;
    onStartFired = false;
    onCompleteFired = false;
    usesExternalClock = false;
  }

  function stop(): void {
    if (!isDone && !isStopped && onCancel) {
      onCancel(animation);
    }
    isStopped = true;
  }

  function pause(): void {
    if (!isPaused && !isStopped && startTime !== null) {
      isPaused = true;
      pausedTime = usesExternalClock ? (lastTickTime ?? Date.now()) : Date.now();
    }
  }

  function resume(): void {
    if (isPaused && pausedTime !== null && startTime !== null) {
      if (!usesExternalClock) {
        const pauseDuration = Date.now() - pausedTime;
        startTime += pauseDuration;
        if (lastTickTime !== null) {
          lastTickTime += pauseDuration;
        }
        pausedTime = null;
      }
      isPaused = false;
    }
  }

  function seek(p: number): void {
    const clampedProgress = normalizeProgress(p);
    const targetElapsed = clampedProgress * durationMs;
    const time = lastTickTime ?? Date.now();

    if (startTime === null) {
      startTime = time;
      if (!onStartFired && onStart) {
        onStartFired = true;
        onStart(animation);
      }
    }

    const adjustedDelay = playbackDirection === 1 ? delayMs : 0;
    startTime = time - (targetElapsed + adjustedDelay) / playbackSpeed;
    lastTickTime = time;
    lastProgress = clampedProgress;

    const easedProgress = assertFiniteNumber(easingFn(clampedProgress), 'easing result');
    currentValue = interpolate(clone(from), clone(to), easedProgress);
    assertNoNonFiniteNumbers(currentValue, 'interpolated value');
    isDone = playbackDirection === 1 ? clampedProgress >= 1 : clampedProgress <= 0;
    onCompleteFired = isDone;
  }

  function reverse(): void {
    const nextDirection = playbackDirection === 1 ? -1 : 1;

    if (startTime !== null && !isPaused && !isStopped && !isDone) {
      const time = lastTickTime ?? Date.now();
      const progress = calculateProgress(time);

      playbackDirection = nextDirection;
      startTime = time - (nextDirection === 1 ? progress * durationMs + delayMs : effectiveDuration - progress * durationMs) / playbackSpeed;
      lastTickTime = time;
      lastProgress = progress;
    } else {
      playbackDirection = nextDirection;
    }

    onStartFired = false;
    onCompleteFired = false;
    isDone = false;
  }

  function speed(factor: number): void {
    const nextSpeed = normalizeSpeed(factor);

    if (startTime !== null && !isPaused && !isStopped && !isDone) {
      const time = lastTickTime ?? Date.now();
      const elapsed = calculateElapsed(time);
      const progress = calculateProgress(time);

      playbackSpeed = nextSpeed;
      startTime = time - elapsed / playbackSpeed;
      lastTickTime = time;
      lastProgress = progress;
      return;
    }

    playbackSpeed = nextSpeed;
  }

  function getProgress(): number {
    if (startTime === null) return lastProgress;
    if (isPaused || isStopped || isDone) {
      return lastProgress;
    }

    const time = lastTickTime ?? startTime;
    return calculateProgress(time);
  }

  function getDirection(): 1 | -1 {
    return playbackDirection;
  }

  function isPlaying(): boolean {
    return !isStopped && !isPaused && !isDone;
  }

  function getDuration(): number {
    return delayMs + durationMs;
  }

  const animation: Animation<T> = {
    value,
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
    duration: getDuration,
  };

  return animation;
}
