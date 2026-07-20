import { animationDuration } from './duration.js';
import type { Animatable, Animation } from './types.js';
import {
  assertFiniteNumber,
  assertNonNegativeInteger,
  assertNonNegativeNumber,
  assertPositiveInteger,
  normalizeProgress,
  normalizeSpeed,
} from './validation.js';

export type StaggerDelayResolver = (index: number, total: number) => number;
export type StaggerOrigin = 'start' | 'center' | 'end' | readonly [number, number];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveDelay(delay: number | StaggerDelayResolver, index: number, total: number): number {
  const resolved = typeof delay === 'function' ? delay(index, total) : index * delay;
  return assertNonNegativeNumber(resolved, `delay[${index}]`);
}

function metadataDuration(animation: Animation<Animatable>, name: string): number | undefined {
  const duration = animationDuration(animation);
  if (duration === undefined) return undefined;
  if (duration !== Infinity && (!Number.isFinite(duration) || duration < 0)) {
    throw new RangeError(`${name}.duration() must be a non-negative number, got ${duration}`);
  }
  return duration;
}

function knownDurations(animations: readonly Animation<Animatable>[]): number[] | undefined {
  const durations: number[] = [];
  for (let index = 0; index < animations.length; index++) {
    const duration = metadataDuration(animations[index]!, `animations[${index}]`);
    if (duration === undefined) return undefined;
    durations.push(duration);
  }
  return durations;
}

function knownFiniteDurations(animations: readonly Animation<Animatable>[]): number[] | undefined {
  const durations = knownDurations(animations);
  if (!durations || durations.some((duration) => !Number.isFinite(duration))) return undefined;
  return durations;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function validateLoopCount(count: number | undefined): number {
  return count === undefined ? Infinity : assertNonNegativeInteger(count, 'count');
}

export function sequence<T extends Animatable = number>(...animations: Animation<T>[]): Animation<T> {
  let currentIndex = 0;
  let isStopped = false;
  let started = false;
  let isPaused = false;
  let pausedTime: number | null = null;
  let playbackDirection: 1 | -1 = 1;
  let lastProgress = 0;

  function getDuration(): number {
    const durations = knownDurations(animations);
    return durations ? sum(durations) : animations.length;
  }

  function getSeekPosition(progress: number): { index: number; localProgress: number } {
    const clampedProgress = normalizeProgress(progress);
    const durations = knownFiniteDurations(animations);
    const totalDuration = durations ? sum(durations) : 0;

    if (durations && totalDuration > 0) {
      if (clampedProgress >= 1) {
        return { index: animations.length - 1, localProgress: 1 };
      }

      const targetTime = clampedProgress * totalDuration;
      let elapsed = 0;
      for (let index = 0; index < durations.length; index++) {
        const duration = durations[index]!;
        const end = elapsed + duration;
        if (targetTime <= end || index === durations.length - 1) {
          return {
            index,
            localProgress: duration === 0 ? 1 : clamp((targetTime - elapsed) / duration, 0, 1),
          };
        }
        elapsed = end;
      }
    }

    const scaled = clampedProgress * animations.length;
    const index = clampedProgress >= 1 ? animations.length - 1 : Math.floor(scaled);
    return {
      index,
      localProgress: clampedProgress >= 1 ? 1 : scaled - index,
    };
  }

  function tick(now?: number): void {
    if (isStopped || isPaused || animations.length === 0) return;

    const time = now ?? Date.now();
    if (!started) {
      started = true;
      animations[0]?.start();
    }

    const current = animations[currentIndex];
    if (!current) return;

    current.tick(time);
    lastProgress = getProgress();

    if (current.done() && currentIndex < animations.length - 1) {
      currentIndex++;
      const next = animations[currentIndex];
      if (next) {
        next.start();
        next.tick(time);
      }
    }
  }

  function value(): T {
    if (animations.length === 0) return 0 as T;
    return animations[currentIndex]?.value() ?? (0 as T);
  }

  function done(): boolean {
    if (animations.length === 0) return true;
    return currentIndex === animations.length - 1 && (animations[currentIndex]?.done() ?? true);
  }

  function reset(): void {
    currentIndex = 0;
    isStopped = false;
    started = false;
    isPaused = false;
    pausedTime = null;
    playbackDirection = 1;
    lastProgress = 0;
    for (const animation of animations) {
      animation.reset();
    }
  }

  function start(): void {
    reset();
  }

  function stop(): void {
    isStopped = true;
    for (const animation of animations) {
      animation.stop();
    }
  }

  function pause(): void {
    if (!isPaused && !isStopped) {
      isPaused = true;
      pausedTime = Date.now();
      animations[currentIndex]?.pause();
    }
  }

  function resume(): void {
    if (isPaused && pausedTime !== null) {
      isPaused = false;
      pausedTime = null;
      animations[currentIndex]?.resume();
    }
  }

  function seek(progress: number): void {
    if (animations.length === 0) return;

    const clampedProgress = normalizeProgress(progress);
    const { index: nextIndex, localProgress } = getSeekPosition(clampedProgress);

    for (let index = 0; index < animations.length; index++) {
      const animation = animations[index]!;
      animation.reset();

      if (index < nextIndex) {
        animation.seek(1);
      } else if (index === nextIndex && clampedProgress > 0) {
        animation.seek(localProgress);
      }
    }

    currentIndex = nextIndex;
    started = clampedProgress > 0;
    lastProgress = clampedProgress;
  }

  function reverse(): void {
    playbackDirection = playbackDirection === 1 ? -1 : 1;
    for (const animation of animations) {
      animation.reverse();
    }
  }

  function speed(factor: number): void {
    const nextSpeed = normalizeSpeed(factor);
    for (const animation of animations) {
      animation.speed(nextSpeed);
    }
  }

  function getProgress(): number {
    if (animations.length === 0) return 1;
    const durations = knownFiniteDurations(animations);
    const totalDuration = durations ? sum(durations) : 0;

    if (durations && totalDuration > 0) {
      const completedDuration = sum(durations.slice(0, currentIndex));
      const currentDuration = durations[currentIndex] ?? 0;
      return clamp((completedDuration + (animations[currentIndex]?.progress() ?? 0) * currentDuration) / totalDuration, 0, 1);
    }

    const completedCount = currentIndex;
    const currentProgress = animations[currentIndex]?.progress() ?? 0;
    return (completedCount + currentProgress) / animations.length;
  }

  function getDirection(): 1 | -1 {
    return playbackDirection;
  }

  function isPlaying(): boolean {
    return !isStopped && !isPaused && !done();
  }

  return {
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
    progress: () => lastProgress || getProgress(),
    direction: getDirection,
    playing: isPlaying,
    duration: getDuration,
  };
}

export function parallel<T extends Animatable = number>(...animations: Animation<T>[]): Animation<T> {
  let isStopped = false;
  let started = false;
  let isPaused = false;
  let pausedTime: number | null = null;
  let playbackDirection: 1 | -1 = 1;
  let lastProgress = 0;

  function getDuration(): number {
    const durations = knownDurations(animations);
    return durations ? Math.max(0, ...durations) : animations.length === 0 ? 0 : 1;
  }

  function tick(now?: number): void {
    if (isStopped || isPaused || animations.length === 0) return;

    const time = now ?? Date.now();
    if (!started) {
      started = true;
      for (const animation of animations) {
        animation.start();
      }
    }

    for (const animation of animations) {
      animation.tick(time);
    }

    lastProgress = getProgress();
  }

  function value(): T {
    if (animations.length === 0) return 0 as T;
    return animations[animations.length - 1]?.value() ?? (0 as T);
  }

  function done(): boolean {
    return animations.length === 0 || animations.every((animation) => animation.done());
  }

  function reset(): void {
    isStopped = false;
    started = false;
    isPaused = false;
    pausedTime = null;
    playbackDirection = 1;
    lastProgress = 0;
    for (const animation of animations) {
      animation.reset();
    }
  }

  function start(): void {
    reset();
  }

  function stop(): void {
    isStopped = true;
    for (const animation of animations) {
      animation.stop();
    }
  }

  function pause(): void {
    if (!isPaused && !isStopped) {
      isPaused = true;
      pausedTime = Date.now();
      for (const animation of animations) {
        animation.pause();
      }
    }
  }

  function resume(): void {
    if (isPaused && pausedTime !== null) {
      isPaused = false;
      pausedTime = null;
      for (const animation of animations) {
        animation.resume();
      }
    }
  }

  function seek(progress: number): void {
    const clampedProgress = normalizeProgress(progress);
    const durations = knownFiniteDurations(animations);
    const totalDuration = durations ? Math.max(0, ...durations) : 0;
    const targetTime = clampedProgress * totalDuration;

    for (let index = 0; index < animations.length; index++) {
      const animation = animations[index]!;
      const duration = durations?.[index];
      animation.reset();
      if (clampedProgress > 0) {
        animation.seek(duration === undefined || totalDuration === 0 ? clampedProgress : duration === 0 ? 1 : clamp(targetTime / duration, 0, 1));
      }
    }
    started = clampedProgress > 0;
    lastProgress = clampedProgress;
  }

  function reverse(): void {
    playbackDirection = playbackDirection === 1 ? -1 : 1;
    for (const animation of animations) {
      animation.reverse();
    }
  }

  function speed(factor: number): void {
    const nextSpeed = normalizeSpeed(factor);
    for (const animation of animations) {
      animation.speed(nextSpeed);
    }
  }

  function getProgress(): number {
    if (animations.length === 0) return 1;
    const durations = knownFiniteDurations(animations);
    const totalDuration = durations ? Math.max(0, ...durations) : 0;

    if (durations && totalDuration > 0) {
      return clamp(animations.reduce((elapsed, animation, index) => Math.max(elapsed, animation.progress() * durations[index]!), 0) / totalDuration, 0, 1);
    }

    return animations.reduce((sum, animation) => sum + animation.progress(), 0) / animations.length;
  }

  function getDirection(): 1 | -1 {
    return playbackDirection;
  }

  function isPlaying(): boolean {
    return !isStopped && !isPaused && !done();
  }

  return {
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
    progress: () => lastProgress || getProgress(),
    direction: getDirection,
    playing: isPlaying,
    duration: getDuration,
  };
}

export function stagger<T extends Animatable = number>(animations: Animation<T>[], delay: number | StaggerDelayResolver): Animation<T> {
  if (typeof delay !== 'function') {
    assertNonNegativeNumber(delay, 'delay');
  }

  let isStopped = false;
  let startTime: number | null = null;
  const started: boolean[] = animations.map(() => false);
  let isPaused = false;
  let pausedTime: number | null = null;
  let playbackDirection: 1 | -1 = 1;
  let lastProgress = 0;

  function getDelays(): number[] {
    return animations.map((_, index) => resolveDelay(delay, index, animations.length));
  }

  function getDuration(): number {
    const delays = getDelays();
    const durations = knownDurations(animations);
    if (!durations) {
      return Math.max(0, ...delays) + (animations.length === 0 ? 0 : 1);
    }

    return animations.reduce((max, _, index) => Math.max(max, delays[index]! + durations[index]!), 0);
  }

  function tick(now?: number): void {
    if (isStopped || isPaused || animations.length === 0) return;

    const time = now ?? Date.now();
    if (startTime === null) {
      startTime = time;
    }

    const elapsed = time - startTime;
    for (let index = 0; index < animations.length; index++) {
      const animDelay = resolveDelay(delay, index, animations.length);
      const animation = animations[index]!;
      if (elapsed >= animDelay) {
        if (!started[index]) {
          started[index] = true;
          animation.start();
        }
        animation.tick(time);
      }
    }

    lastProgress = getProgress();
  }

  function value(): T {
    if (animations.length === 0) return 0 as T;
    return animations[animations.length - 1]?.value() ?? (0 as T);
  }

  function done(): boolean {
    return animations.length === 0 || animations.every((animation) => animation.done());
  }

  function reset(): void {
    isStopped = false;
    startTime = null;
    isPaused = false;
    pausedTime = null;
    playbackDirection = 1;
    lastProgress = 0;
    for (let index = 0; index < animations.length; index++) {
      started[index] = false;
      animations[index]!.reset();
    }
  }

  function start(): void {
    reset();
  }

  function stop(): void {
    isStopped = true;
    for (const animation of animations) {
      animation.stop();
    }
  }

  function pause(): void {
    if (!isPaused && !isStopped) {
      isPaused = true;
      pausedTime = Date.now();
      for (const animation of animations) {
        if (animation.playing()) {
          animation.pause();
        }
      }
    }
  }

  function resume(): void {
    if (isPaused && pausedTime !== null && startTime !== null) {
      const pauseDuration = Date.now() - pausedTime;
      startTime += pauseDuration;
      isPaused = false;
      pausedTime = null;
      for (const animation of animations) {
        animation.resume();
      }
    }
  }

  function seek(progress: number): void {
    if (animations.length === 0) return;

    const clampedProgress = normalizeProgress(progress);
    const delays = getDelays();
    const durations = knownFiniteDurations(animations);
    const endTime = getDuration();
    const targetTime = clampedProgress * endTime;

    for (let index = 0; index < animations.length; index++) {
      const animation = animations[index]!;
      const delayAtIndex = delays[index]!;
      animation.reset();

      const duration = durations?.[index];
      const localProgress =
        duration === undefined
          ? delayAtIndex >= endTime
            ? clampedProgress >= 1
              ? 1
              : 0
            : clamp((targetTime - delayAtIndex) / Math.max(1, endTime - delayAtIndex), 0, 1)
          : duration === 0
            ? targetTime >= delayAtIndex
              ? 1
              : 0
            : clamp((targetTime - delayAtIndex) / duration, 0, 1);
      if (localProgress > 0) {
        animation.seek(localProgress);
      }
      started[index] = localProgress > 0;
    }

    lastProgress = clampedProgress;
    startTime = null;
  }

  function reverse(): void {
    playbackDirection = playbackDirection === 1 ? -1 : 1;
    for (const animation of animations) {
      animation.reverse();
    }
  }

  function speed(factor: number): void {
    const nextSpeed = normalizeSpeed(factor);
    for (const animation of animations) {
      animation.speed(nextSpeed);
    }
  }

  function getProgress(): number {
    if (animations.length === 0) return 1;
    const delays = getDelays();
    const durations = knownFiniteDurations(animations);
    const totalDuration = durations ? getDuration() : 0;

    if (durations && totalDuration > 0) {
      const elapsed = animations.reduce((max, animation, index) => {
        const progress = animation.progress();
        if (!started[index] && progress <= 0) return max;
        return Math.max(max, delays[index]! + progress * durations[index]!);
      }, 0);
      return clamp(elapsed / totalDuration, 0, 1);
    }

    return animations.reduce((sum, animation) => sum + animation.progress(), 0) / animations.length;
  }

  function getDirection(): 1 | -1 {
    return playbackDirection;
  }

  function isPlaying(): boolean {
    return !isStopped && !isPaused && !done();
  }

  return {
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
    progress: () => lastProgress || getProgress(),
    direction: getDirection,
    playing: isPlaying,
    duration: getDuration,
  };
}

export function loop<T extends Animatable = number>(animation: Animation<T>, count?: number): Animation<T> {
  let iteration = 0;
  let isStopped = false;
  const maxIterations = validateLoopCount(count);
  let isPaused = false;
  let playbackDirection: 1 | -1 = 1;

  function getDuration(): number {
    const childDuration = metadataDuration(animation, 'animation') ?? 1;
    return maxIterations === Infinity ? Infinity : childDuration * maxIterations;
  }

  function tick(now?: number): void {
    if (isStopped || isPaused || maxIterations === 0) return;

    const time = now ?? Date.now();
    animation.tick(time);

    if (animation.done() && iteration < maxIterations - 1) {
      iteration++;
      animation.reset();
      animation.start();
    }
  }

  function value(): T {
    return animation.value();
  }

  function done(): boolean {
    if (maxIterations === 0) return true;
    return iteration >= maxIterations - 1 && animation.done();
  }

  function reset(): void {
    iteration = 0;
    isStopped = false;
    isPaused = false;
    playbackDirection = 1;
    animation.reset();
  }

  function start(): void {
    reset();
    animation.start();
  }

  function stop(): void {
    isStopped = true;
    animation.stop();
  }

  function pause(): void {
    if (!isPaused && !isStopped) {
      isPaused = true;
      animation.pause();
    }
  }

  function resume(): void {
    if (isPaused) {
      isPaused = false;
      animation.resume();
    }
  }

  function seek(progress: number): void {
    const clampedProgress = normalizeProgress(progress);
    if (maxIterations === 0) return;

    if (maxIterations === Infinity) {
      animation.seek(clampedProgress);
      return;
    }

    const scaled = clampedProgress * maxIterations;
    const passIndex = clampedProgress >= 1 ? maxIterations - 1 : Math.floor(scaled);
    const localProgress = clampedProgress >= 1 ? 1 : scaled - passIndex;

    animation.reset();
    animation.seek(localProgress);
    iteration = passIndex;
  }

  function reverse(): void {
    playbackDirection = playbackDirection === 1 ? -1 : 1;
    animation.reverse();
  }

  function speed(factor: number): void {
    animation.speed(normalizeSpeed(factor));
  }

  function getProgress(): number {
    const animProgress = animation.progress();
    if (maxIterations === Infinity) return animProgress;
    return (iteration + animProgress) / maxIterations;
  }

  function getDirection(): 1 | -1 {
    return playbackDirection;
  }

  function isPlaying(): boolean {
    return !isStopped && !isPaused && !done();
  }

  return {
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
}

export function repeat<T extends Animatable = number>(animation: Animation<T>, count?: number): Animation<T> {
  return loop(animation, count);
}

export function yoyo<T extends Animatable = number>(animation: Animation<T>, count?: number): Animation<T> {
  let iteration = 0;
  let isStopped = false;
  const maxIterations = validateLoopCount(count);
  let isPaused = false;
  let playbackDirection: 1 | -1 = 1;

  function getDuration(): number {
    const childDuration = metadataDuration(animation, 'animation') ?? 1;
    return maxIterations === Infinity ? Infinity : childDuration * maxIterations;
  }

  function tick(now?: number): void {
    if (isStopped || isPaused || maxIterations === 0) return;

    const time = now ?? Date.now();
    animation.tick(time);

    if (animation.done() && iteration < maxIterations - 1) {
      iteration++;
      playbackDirection = playbackDirection === 1 ? -1 : 1;
      animation.reverse();
      animation.start();
      animation.tick(time);
    }
  }

  function value(): T {
    return animation.value();
  }

  function done(): boolean {
    if (maxIterations === 0) return true;
    return iteration >= maxIterations - 1 && animation.done();
  }

  function reset(): void {
    iteration = 0;
    isStopped = false;
    isPaused = false;
    playbackDirection = 1;
    animation.reset();
  }

  function start(): void {
    reset();
    animation.start();
  }

  function stop(): void {
    isStopped = true;
    animation.stop();
  }

  function pause(): void {
    if (!isPaused && !isStopped) {
      isPaused = true;
      animation.pause();
    }
  }

  function resume(): void {
    if (isPaused) {
      isPaused = false;
      animation.resume();
    }
  }

  function seek(progress: number): void {
    const clampedProgress = normalizeProgress(progress);
    if (maxIterations === 0) return;

    const scaled = clampedProgress * (maxIterations === Infinity ? 1 : maxIterations);
    const passIndex = maxIterations === Infinity ? Math.floor(scaled) : Math.min(maxIterations - 1, Math.floor(scaled));
    const localProgress = maxIterations === Infinity ? scaled - passIndex : passIndex === maxIterations - 1 && clampedProgress === 1 ? 1 : scaled - passIndex;

    animation.reset();
    playbackDirection = passIndex % 2 === 0 ? 1 : -1;
    if (playbackDirection === -1) {
      animation.reverse();
    }
    animation.start();
    animation.seek(playbackDirection === 1 ? localProgress : 1 - localProgress);
    iteration = passIndex;
  }

  function reverse(): void {
    playbackDirection = playbackDirection === 1 ? -1 : 1;
    animation.reverse();
  }

  function speed(factor: number): void {
    animation.speed(normalizeSpeed(factor));
  }

  function getProgress(): number {
    const localProgress = playbackDirection === 1 ? animation.progress() : 1 - animation.progress();
    if (maxIterations === Infinity) return localProgress;
    return (iteration + localProgress) / maxIterations;
  }

  function getDirection(): 1 | -1 {
    return playbackDirection;
  }

  function isPlaying(): boolean {
    return !isStopped && !isPaused && !done();
  }

  return {
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
}

export function delay<T extends Animatable = number>(animation: Animation<T>, ms: number): Animation<T> {
  const delayMs = assertNonNegativeNumber(ms, 'ms');
  let startTime: number | null = null;
  let isStopped = false;
  let delayComplete = false;
  let isPaused = false;
  let pausedTime: number | null = null;
  let playbackDirection: 1 | -1 = 1;
  let lastProgress = 0;

  function getDuration(): number {
    const childDuration = metadataDuration(animation, 'animation');
    return delayMs + (childDuration ?? 1);
  }

  function progressFromChild(): number {
    const childDuration = metadataDuration(animation, 'animation');
    const totalDuration = getDuration();
    if (totalDuration === 0) return 1;
    if (childDuration === undefined || !Number.isFinite(childDuration)) return animation.progress();
    return clamp((delayMs + animation.progress() * childDuration) / totalDuration, 0, 1);
  }

  function tick(now?: number): void {
    if (isStopped || isPaused) return;

    const time = now ?? Date.now();
    if (startTime === null) {
      startTime = time;
    }

    const elapsed = time - startTime;
    if (elapsed < delayMs) {
      lastProgress = getDuration() === 0 ? 1 : clamp(elapsed / getDuration(), 0, 1);
      return;
    }

    if (!delayComplete) {
      delayComplete = true;
      animation.start();
    }

    animation.tick(time);
    lastProgress = progressFromChild();
  }

  function value(): T {
    return animation.value();
  }

  function done(): boolean {
    return delayComplete && animation.done();
  }

  function reset(): void {
    startTime = null;
    isStopped = false;
    delayComplete = false;
    isPaused = false;
    pausedTime = null;
    playbackDirection = 1;
    lastProgress = 0;
    animation.reset();
  }

  function start(): void {
    reset();
  }

  function stop(): void {
    isStopped = true;
    animation.stop();
  }

  function pause(): void {
    if (!isPaused && !isStopped) {
      isPaused = true;
      pausedTime = Date.now();
      if (delayComplete) {
        animation.pause();
      }
    }
  }

  function resume(): void {
    if (isPaused && pausedTime !== null && startTime !== null) {
      const pauseDuration = Date.now() - pausedTime;
      startTime += pauseDuration;
      isPaused = false;
      pausedTime = null;
      if (delayComplete) {
        animation.resume();
      }
    }
  }

  function seek(progress: number): void {
    const clampedProgress = normalizeProgress(progress);
    const childDuration = metadataDuration(animation, 'animation');
    const totalDuration = getDuration();
    const targetTime = clampedProgress * totalDuration;

    animation.reset();
    delayComplete = false;
    startTime = null;

    if (targetTime >= delayMs || clampedProgress >= 1) {
      if (!delayComplete) {
        delayComplete = true;
        animation.start();
      }
      const localProgress =
        childDuration === undefined || !Number.isFinite(childDuration)
          ? clampedProgress
          : childDuration === 0
            ? 1
            : clamp((targetTime - delayMs) / childDuration, 0, 1);
      animation.seek(localProgress);
    }
    lastProgress = clampedProgress;
  }

  function reverse(): void {
    playbackDirection = playbackDirection === 1 ? -1 : 1;
    animation.reverse();
  }

  function speed(factor: number): void {
    animation.speed(normalizeSpeed(factor));
  }

  function getProgress(): number {
    if (startTime === null || isPaused || isStopped) return lastProgress;
    const elapsed = Date.now() - startTime;
    if (elapsed < delayMs) return getDuration() === 0 ? 1 : clamp(elapsed / getDuration(), 0, 1);
    return progressFromChild();
  }

  function getDirection(): 1 | -1 {
    return playbackDirection;
  }

  function isPlaying(): boolean {
    return !isStopped && !isPaused && !done();
  }

  return {
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
}

export function staggerGrid(rows: number, cols: number, options: { from?: StaggerOrigin; delay: number }): StaggerDelayResolver {
  const rowCount = assertPositiveInteger(rows, 'rows');
  const colCount = assertPositiveInteger(cols, 'cols');
  const delayMs = assertNonNegativeNumber(options.delay, 'delay');
  const origin: readonly [number, number] =
    options.from === 'center'
      ? [Math.floor((rowCount - 1) / 2), Math.floor((colCount - 1) / 2)]
      : options.from === 'end'
        ? [rowCount - 1, colCount - 1]
        : options.from === undefined || options.from === 'start'
          ? [0, 0]
          : [assertFiniteNumber(options.from[0], 'from[0]'), assertFiniteNumber(options.from[1], 'from[1]')];

  return (index: number): number => {
    assertNonNegativeInteger(index, 'index');
    const row = Math.floor(index / colCount);
    const col = index % colCount;
    return (Math.abs(row - origin[0]) + Math.abs(col - origin[1])) * delayMs;
  };
}
