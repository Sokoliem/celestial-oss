import { easing } from './easing.js';
import type { Animation, PathConfig } from './types.js';
import {
  assertFiniteNumber,
  assertNonNegativeNumber,
  assertPoint,
  assertPositiveNumber,
  normalizeProgress,
  normalizeSpeed,
  resolveTimestamp,
} from './validation.js';

type Point = { x: number; y: number };

interface PathAnimationState {
  startTime: number | null;
  pausedTime: number | null;
  lastTickTime: number | null;
  currentValue: Point;
  lastProgress: number;
  isDone: boolean;
  isStopped: boolean;
  isPaused: boolean;
  playbackDirection: 1 | -1;
  playbackSpeed: number;
  onStartFired: boolean;
  onCompleteFired: boolean;
}

function createBasePathAnimation(config: PathConfig, getPointAtProgress: (progress: number) => Point, startPoint: Point): Animation<Point> {
  const { duration, easing: easingFn = easing.linear, loop = false, onStart, onUpdate, onComplete, onCancel } = config;
  const durationMs = assertPositiveNumber(duration, 'duration');

  const state: PathAnimationState = {
    startTime: null,
    pausedTime: null,
    lastTickTime: null,
    currentValue: { ...startPoint },
    lastProgress: 0,
    isDone: false,
    isStopped: false,
    isPaused: false,
    playbackDirection: 1,
    playbackSpeed: 1,
    onStartFired: false,
    onCompleteFired: false,
  };
  let usesExternalClock = false;

  function tick(now?: number): void {
    if (state.isStopped || state.isPaused || (state.isDone && !loop)) return;

    if (now !== undefined) {
      usesExternalClock = true;
    }

    const time = resolveTimestamp(now, state.lastTickTime);

    if (state.pausedTime !== null && state.startTime !== null) {
      state.startTime += time - state.pausedTime;
      state.pausedTime = null;
    }

    state.lastTickTime = time;

    if (state.startTime === null) {
      state.startTime = time;
      if (!state.onStartFired && onStart) {
        state.onStartFired = true;
        onStart(animation);
      }
    }

    const elapsed = (time - state.startTime) * state.playbackSpeed;
    let rawProgress = elapsed / durationMs;

    if (state.playbackDirection === -1) {
      rawProgress = 1 - rawProgress;
    }

    if (rawProgress >= 1) {
      if (loop) {
        state.startTime = time;
        rawProgress = state.playbackDirection === 1 ? 0 : 1;
        state.onStartFired = false;
      } else {
        state.currentValue = getPointAtProgress(state.playbackDirection === 1 ? 1 : 0);
        state.lastProgress = state.playbackDirection === 1 ? 1 : 0;
        state.isDone = true;
        if (!state.onCompleteFired && onComplete) {
          state.onCompleteFired = true;
          onComplete(animation);
        }
        return;
      }
    }

    if (rawProgress <= 0 && state.playbackDirection === -1) {
      if (loop) {
        state.startTime = time;
        rawProgress = 1;
        state.onStartFired = false;
      } else {
        state.currentValue = getPointAtProgress(0);
        state.lastProgress = 0;
        state.isDone = true;
        if (!state.onCompleteFired && onComplete) {
          state.onCompleteFired = true;
          onComplete(animation);
        }
        return;
      }
    }

    const clampedProgress = Math.max(0, Math.min(1, rawProgress));
    const easedProgress = assertFiniteNumber(easingFn(clampedProgress), 'easing result');
    state.currentValue = getPointAtProgress(easedProgress);
    state.lastProgress = clampedProgress;
    state.isDone = false;

    if (onUpdate) {
      onUpdate(state.currentValue, clampedProgress, animation);
    }
  }

  function value(): Point {
    return state.currentValue;
  }

  function done(): boolean {
    return state.isDone;
  }

  function reset(): void {
    state.startTime = null;
    state.pausedTime = null;
    state.lastTickTime = null;
    state.currentValue = { ...startPoint };
    state.lastProgress = 0;
    state.isDone = false;
    state.isStopped = false;
    state.isPaused = false;
    state.playbackDirection = 1;
    state.playbackSpeed = 1;
    state.onStartFired = false;
    state.onCompleteFired = false;
    usesExternalClock = false;
  }

  function start(): void {
    reset();
  }

  function stop(): void {
    if (!state.isDone && !state.isStopped && onCancel) {
      onCancel(animation);
    }
    state.isStopped = true;
  }

  function pause(): void {
    if (!state.isPaused && !state.isStopped && state.startTime !== null) {
      state.isPaused = true;
      state.pausedTime = usesExternalClock ? (state.lastTickTime ?? Date.now()) : Date.now();
    }
  }

  function resume(): void {
    if (state.isPaused && state.pausedTime !== null && state.startTime !== null) {
      if (!usesExternalClock) {
        const pauseDuration = Date.now() - state.pausedTime;
        state.startTime += pauseDuration;
        if (state.lastTickTime !== null) {
          state.lastTickTime += pauseDuration;
        }
        state.pausedTime = null;
      }
      state.isPaused = false;
    }
  }

  function seek(p: number): void {
    const clampedProgress = normalizeProgress(p);
    const time = state.lastTickTime ?? Date.now();

    if (state.startTime === null) {
      state.startTime = time;
      if (!state.onStartFired && onStart) {
        state.onStartFired = true;
        onStart(animation);
      }
    }

    state.startTime = time - (clampedProgress * durationMs) / state.playbackSpeed;
    state.lastTickTime = time;
    const easedProgress = assertFiniteNumber(easingFn(clampedProgress), 'easing result');
    state.currentValue = getPointAtProgress(easedProgress);
    state.lastProgress = clampedProgress;
    state.isDone = clampedProgress >= 1;
    state.onCompleteFired = state.isDone;
  }

  function reverse(): void {
    state.playbackDirection = state.playbackDirection === 1 ? -1 : 1;
    state.onStartFired = false;
    state.onCompleteFired = false;
    state.isDone = false;
  }

  function speed(factor: number): void {
    state.playbackSpeed = normalizeSpeed(factor);
  }

  function getProgress(): number {
    return state.lastProgress;
  }

  function getDirection(): 1 | -1 {
    return state.playbackDirection;
  }

  function isPlaying(): boolean {
    return !state.isStopped && !state.isPaused && !state.isDone;
  }

  function getDuration(): number {
    return durationMs;
  }

  const animation: Animation<Point> = {
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

function bezierPoint(points: Point[], t: number): Point {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }

  if (points.length === 1) {
    return { ...points[0]! };
  }

  const n = points.length - 1;
  let x = 0;
  let y = 0;

  for (let i = 0; i <= n; i++) {
    const p = points[i]!;
    const b = binomial(n, i) * Math.pow(1 - t, n - i) * Math.pow(t, i);
    x += p.x * b;
    y += p.y * b;
  }

  return { x, y };
}

function binomial(n: number, k: number): number {
  let result = 1;
  for (let i = 0; i < k; i++) {
    result *= (n - i) / (i + 1);
  }
  return result;
}

export function bezier(points: Point[], config: PathConfig): Animation<Point> {
  if (points.length < 2) {
    throw new Error('Bezier curve requires at least 2 points');
  }

  const normalizedPoints = points.map((point, index) => assertPoint(point, `points[${index}]`));
  const startPoint = normalizedPoints[0]!;

  return createBasePathAnimation(config, (progress) => bezierPoint(normalizedPoints, progress), startPoint);
}

export function quadraticBezier(p0: Point, p1: Point, p2: Point, config: PathConfig): Animation<Point> {
  return bezier([p0, p1, p2], config);
}

export function cubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, config: PathConfig): Animation<Point> {
  return bezier([p0, p1, p2, p3], config);
}

export function arc(center: Point, radius: number, startAngle: number, endAngle: number, config: PathConfig): Animation<Point> {
  const normalizedCenter = assertPoint(center, 'center');
  const normalizedRadius = assertNonNegativeNumber(radius, 'radius');
  const normalizedStartAngle = assertFiniteNumber(startAngle, 'startAngle');
  const normalizedEndAngle = assertFiniteNumber(endAngle, 'endAngle');
  const startPoint = {
    x: normalizedCenter.x + normalizedRadius * Math.cos(normalizedStartAngle),
    y: normalizedCenter.y + normalizedRadius * Math.sin(normalizedStartAngle),
  };

  return createBasePathAnimation(
    config,
    (progress) => {
      const angle = normalizedStartAngle + (normalizedEndAngle - normalizedStartAngle) * progress;
      return {
        x: normalizedCenter.x + normalizedRadius * Math.cos(angle),
        y: normalizedCenter.y + normalizedRadius * Math.sin(angle),
      };
    },
    startPoint,
  );
}

export function circle(center: Point, radius: number, config: PathConfig): Animation<Point> {
  const normalizedCenter = assertPoint(center, 'center');
  const normalizedRadius = assertNonNegativeNumber(radius, 'radius');
  const startPoint = {
    x: normalizedCenter.x + normalizedRadius,
    y: normalizedCenter.y,
  };

  return createBasePathAnimation(
    config,
    (progress) => {
      const angle = progress * 2 * Math.PI;
      return {
        x: normalizedCenter.x + normalizedRadius * Math.cos(angle),
        y: normalizedCenter.y + normalizedRadius * Math.sin(angle),
      };
    },
    startPoint,
  );
}

export function line(from: Point, to: Point, config: PathConfig): Animation<Point> {
  const normalizedFrom = assertPoint(from, 'from');
  const normalizedTo = assertPoint(to, 'to');
  return createBasePathAnimation(
    config,
    (progress) => ({
      x: normalizedFrom.x + (normalizedTo.x - normalizedFrom.x) * progress,
      y: normalizedFrom.y + (normalizedTo.y - normalizedFrom.y) * progress,
    }),
    normalizedFrom,
  );
}

export function path(points: Point[], config: PathConfig): Animation<Point> {
  if (points.length < 2) {
    throw new Error('Path requires at least 2 points');
  }

  const normalizedPoints = points.map((point, index) => assertPoint(point, `points[${index}]`));
  const startPoint = normalizedPoints[0]!;
  let totalLength = 0;
  const segmentLengths: number[] = [];

  for (let i = 0; i < normalizedPoints.length - 1; i++) {
    const p1 = normalizedPoints[i]!;
    const p2 = normalizedPoints[i + 1]!;
    const len = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    segmentLengths.push(len);
    totalLength += len;
  }

  return createBasePathAnimation(
    config,
    (progress) => {
      if (totalLength === 0) return { ...startPoint };
      if (progress <= 0) return { ...normalizedPoints[0]! };
      if (progress >= 1) return { ...normalizedPoints[normalizedPoints.length - 1]! };

      const targetLength = progress * totalLength;
      let accumulatedLength = 0;

      for (let i = 0; i < segmentLengths.length; i++) {
        const segmentLength = segmentLengths[i]!;

        if (accumulatedLength + segmentLength >= targetLength) {
          const segmentProgress = (targetLength - accumulatedLength) / segmentLength;
          const p1 = normalizedPoints[i]!;
          const p2 = normalizedPoints[i + 1]!;
          return {
            x: p1.x + (p2.x - p1.x) * segmentProgress,
            y: p1.y + (p2.y - p1.y) * segmentProgress,
          };
        }

        accumulatedLength += segmentLength;
      }

      return { ...normalizedPoints[normalizedPoints.length - 1]! };
    },
    startPoint,
  );
}

export function ellipse(center: Point, radiusX: number, radiusY: number, config: PathConfig): Animation<Point> {
  const normalizedCenter = assertPoint(center, 'center');
  const normalizedRadiusX = assertNonNegativeNumber(radiusX, 'radiusX');
  const normalizedRadiusY = assertNonNegativeNumber(radiusY, 'radiusY');
  const startPoint = {
    x: normalizedCenter.x + normalizedRadiusX,
    y: normalizedCenter.y,
  };

  return createBasePathAnimation(
    config,
    (progress) => {
      const angle = progress * 2 * Math.PI;
      return {
        x: normalizedCenter.x + normalizedRadiusX * Math.cos(angle),
        y: normalizedCenter.y + normalizedRadiusY * Math.sin(angle),
      };
    },
    startPoint,
  );
}

export function spiral(center: Point, startRadius: number, endRadius: number, turns: number, config: PathConfig): Animation<Point> {
  const normalizedCenter = assertPoint(center, 'center');
  const normalizedStartRadius = assertNonNegativeNumber(startRadius, 'startRadius');
  const normalizedEndRadius = assertNonNegativeNumber(endRadius, 'endRadius');
  const normalizedTurns = assertFiniteNumber(turns, 'turns');
  const startPoint = {
    x: normalizedCenter.x + normalizedStartRadius,
    y: normalizedCenter.y,
  };

  return createBasePathAnimation(
    config,
    (progress) => {
      const angle = progress * normalizedTurns * 2 * Math.PI;
      const radius = normalizedStartRadius + (normalizedEndRadius - normalizedStartRadius) * progress;
      return {
        x: normalizedCenter.x + radius * Math.cos(angle),
        y: normalizedCenter.y + radius * Math.sin(angle),
      };
    },
    startPoint,
  );
}

export function sineWave(start: Point, end: Point, amplitude: number, frequency: number, config: PathConfig): Animation<Point> {
  const normalizedStart = assertPoint(start, 'start');
  const normalizedEnd = assertPoint(end, 'end');
  const normalizedAmplitude = assertNonNegativeNumber(amplitude, 'amplitude');
  const normalizedFrequency = assertFiniteNumber(frequency, 'frequency');
  const dx = normalizedEnd.x - normalizedStart.x;
  const dy = normalizedEnd.y - normalizedStart.y;
  const angle = Math.atan2(dy, dx);

  return createBasePathAnimation(
    config,
    (progress) => {
      const baseX = normalizedStart.x + dx * progress;
      const baseY = normalizedStart.y + dy * progress;
      const waveOffset = Math.sin(progress * normalizedFrequency * 2 * Math.PI) * normalizedAmplitude;

      const perpX = -Math.sin(angle) * waveOffset;
      const perpY = Math.cos(angle) * waveOffset;

      return {
        x: baseX + perpX,
        y: baseY + perpY,
      };
    },
    normalizedStart,
  );
}
