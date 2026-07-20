import { easing } from './easing.js';
import { clone, interpolateValue } from './interpolate.js';
import type { Animatable, Animation, EasingFn, Keyframe, KeyframesConfig } from './types.js';
import { assertNoNonFiniteNumbers, assertPositiveNumber, normalizeProgress, normalizeSpeed } from './validation.js';

export function keyframes<T extends Animatable = number>(config: KeyframesConfig<T>): Animation<T> {
  const { keyframes: kf, duration, loop = false, onStart, onUpdate, onComplete, onCancel } = config;
  const durationMs = assertPositiveNumber(duration, 'duration');

  const sortedKeyframes = [...kf].sort((a, b) => a.offset - b.offset);

  if (sortedKeyframes.length === 0) {
    throw new Error('Keyframes must have at least one keyframe');
  }

  for (let index = 0; index < sortedKeyframes.length; index++) {
    const keyframe = sortedKeyframes[index]!;
    if (typeof keyframe.offset !== 'number' || !Number.isFinite(keyframe.offset) || keyframe.offset < 0 || keyframe.offset > 1) {
      throw new RangeError(`Keyframe offset at index ${index} must be in [0, 1], got ${keyframe.offset}`);
    }
    assertNoNonFiniteNumbers(keyframe.value, `keyframes[${index}].value`);
  }

  if (sortedKeyframes[0]!.offset !== 0) {
    throw new Error('First keyframe must have offset 0');
  }

  if (sortedKeyframes[sortedKeyframes.length - 1]!.offset !== 1) {
    throw new Error('Last keyframe must have offset 1');
  }

  let startTime: number | null = null;
  let pausedTime: number | null = null;
  let lastTickTime: number | null = null;
  let currentValue = clone(sortedKeyframes[0]!.value);
  let lastProgress = 0;
  let isDone = false;
  let isStopped = false;
  let isPaused = false;
  let playbackDirection: 1 | -1 = 1;
  let playbackSpeed = 1;
  let onStartFired = false;
  let onCompleteFired = false;
  let usesExternalClock = false;
  let _iteration = 0;

  function getSegment(progress: number): { from: Keyframe<T>; to: Keyframe<T>; localProgress: number } {
    const clampedProgress = Math.max(0, Math.min(1, progress));

    for (let i = 0; i < sortedKeyframes.length - 1; i++) {
      const from = sortedKeyframes[i]!;
      const to = sortedKeyframes[i + 1]!;

      if (clampedProgress >= from.offset && clampedProgress <= to.offset) {
        const range = to.offset - from.offset;
        const localProgress = range > 0 ? (clampedProgress - from.offset) / range : 0;
        return { from, to, localProgress };
      }
    }

    const last = sortedKeyframes[sortedKeyframes.length - 1]!;
    return { from: last, to: last, localProgress: 0 };
  }

  function tick(now?: number): void {
    if (isStopped || isPaused || (isDone && !loop)) return;

    if (now !== undefined) {
      usesExternalClock = true;
    }

    const time = now ?? Date.now();

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
    let rawProgress = elapsed / durationMs;

    if (playbackDirection === -1) {
      rawProgress = 1 - rawProgress;
    }

    if (playbackDirection === 1 && rawProgress >= 1) {
      if (loop) {
        _iteration++;
        startTime = time;
        rawProgress = playbackDirection === 1 ? 0 : 1;
        onStartFired = false;
      } else {
        currentValue = clone(playbackDirection === 1 ? sortedKeyframes[sortedKeyframes.length - 1]!.value : sortedKeyframes[0]!.value);
        lastProgress = playbackDirection === 1 ? 1 : 0;
        isDone = true;
        if (!onCompleteFired && onComplete) {
          onCompleteFired = true;
          onComplete(animation);
        }
        return;
      }
    }

    if (rawProgress <= 0 && playbackDirection === -1) {
      if (loop) {
        _iteration++;
        startTime = time;
        rawProgress = 1;
        onStartFired = false;
      } else {
        currentValue = clone(sortedKeyframes[0]!.value);
        lastProgress = 0;
        isDone = true;
        if (!onCompleteFired && onComplete) {
          onCompleteFired = true;
          onComplete(animation);
        }
        return;
      }
    }

    const segment = getSegment(rawProgress);
    const { from, to, localProgress } = segment;

    const easingFn: EasingFn = to.easing ?? easing.linear;
    const easedProgress = easingFn(localProgress);
    const clampedProgress = Math.max(0, Math.min(1, rawProgress));

    currentValue = interpolateValue(clone(from.value), clone(to.value), easedProgress);
    lastProgress = clampedProgress;
    isDone = false;

    if (onUpdate) {
      onUpdate(currentValue, clampedProgress, animation);
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
    currentValue = clone(sortedKeyframes[0]!.value);
    lastProgress = 0;
    isDone = false;
    isStopped = false;
    isPaused = false;
    playbackDirection = 1;
    playbackSpeed = 1;
    onStartFired = false;
    onCompleteFired = false;
    usesExternalClock = false;
    _iteration = 0;
  }

  function start(): void {
    startTime = null;
    pausedTime = null;
    lastTickTime = null;
    currentValue = clone(playbackDirection === 1 ? sortedKeyframes[0]!.value : sortedKeyframes[sortedKeyframes.length - 1]!.value);
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
    const time = lastTickTime ?? Date.now();

    if (startTime === null) {
      startTime = time;
      if (!onStartFired && onStart) {
        onStartFired = true;
        onStart(animation);
      }
    }

    startTime = time - (clampedProgress * durationMs) / playbackSpeed;
    lastTickTime = time;

    const segment = getSegment(clampedProgress);
    const { from, to, localProgress } = segment;
    const easingFn: EasingFn = to.easing ?? easing.linear;
    const easedProgress = easingFn(localProgress);

    currentValue = interpolateValue(clone(from.value), clone(to.value), easedProgress);
    lastProgress = clampedProgress;
    isDone = playbackDirection === 1 ? clampedProgress >= 1 : clampedProgress <= 0;
    onCompleteFired = isDone;
  }

  function reverse(): void {
    playbackDirection = playbackDirection === 1 ? -1 : 1;
    onStartFired = false;
    onCompleteFired = false;
    isDone = false;
  }

  function speed(factor: number): void {
    playbackSpeed = normalizeSpeed(factor);
  }

  function getProgress(): number {
    if (startTime === null) return lastProgress;
    if (isPaused || isStopped || isDone) {
      return lastProgress;
    }
    return lastProgress;
  }

  function getDirection(): 1 | -1 {
    return playbackDirection;
  }

  function isPlaying(): boolean {
    return !isStopped && !isPaused && !isDone;
  }

  function getDuration(): number {
    return durationMs;
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
