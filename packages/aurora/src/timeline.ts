import type { Animation } from './types.js';
import { assertFiniteNumber, assertNonEmptyString, assertNonNegativeNumber, normalizeProgress, resolveTimestamp } from './validation.js';

export interface TimelineTrack {
  readonly id: string;
  readonly animation: Animation;
  readonly at: number;
  readonly duration: number;
}

export interface TimelineMarker {
  readonly name: string;
  readonly at: number;
}

export interface Timeline {
  add(id: string, animation: Animation, options: { at: number; duration: number }): void;
  addMarker(name: string, at: number): void;
  play(startAt?: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
  reset(): void;
  tick(now?: number): void;
  seek(timeMs: number): void;
  scrub(progress: number): void;
  currentTime(): number;
  duration(): number;
  values(): Record<string, unknown>;
  value(id: string): unknown;
  passedMarkers(): string[];
  done(): boolean;
  playing(): boolean;
}

type TrackZone = 'before' | 'active' | 'after';

interface InternalTrack extends TimelineTrack {
  zone: TrackZone;
  progress: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function assertAnimation(animation: Animation): Animation {
  if (typeof animation !== 'object' || animation === null) {
    throw new TypeError('animation must be an Animation object');
  }

  for (const method of ['value', 'done', 'reset', 'start', 'stop', 'tick', 'pause', 'resume', 'seek', 'reverse', 'speed', 'progress', 'direction', 'playing']) {
    if (typeof animation[method as keyof Animation] !== 'function') {
      throw new TypeError(`animation.${method} must be a function`);
    }
  }

  return animation;
}

export function createTimeline(): Timeline {
  const tracks: InternalTrack[] = [];
  const markers: TimelineMarker[] = [];
  let currentTimeMs = 0;
  let isPlaying = false;
  let lastTickTime: number | null = null;

  function getDuration(): number {
    const trackDuration = tracks.reduce((max, track) => Math.max(max, track.at + track.duration), 0);
    const markerDuration = markers.reduce((max, marker) => Math.max(max, marker.at), 0);
    return Math.max(trackDuration, markerDuration);
  }

  function syncTrack(track: InternalTrack): void {
    if (currentTimeMs < track.at) {
      if (track.zone !== 'before') {
        track.animation.reset();
      }
      track.zone = 'before';
      track.progress = 0;
      return;
    }

    const endTime = track.at + track.duration;
    if (track.duration <= 0 || currentTimeMs >= endTime) {
      if (track.zone !== 'after' || track.progress !== 1) {
        track.animation.reset();
        track.animation.seek(1);
      }
      track.zone = 'after';
      track.progress = 1;
      return;
    }

    const localProgress = clamp((currentTimeMs - track.at) / track.duration, 0, 1);
    if (track.zone !== 'active' || localProgress < track.progress) {
      track.animation.reset();
    }
    track.animation.seek(localProgress);
    track.zone = 'active';
    track.progress = localProgress;
  }

  function syncAllTracks(): void {
    for (const track of tracks) {
      syncTrack(track);
    }
  }

  function add(id: string, animation: Animation, options: { at: number; duration: number }): void {
    const normalizedId = assertNonEmptyString(id, 'id');
    const existingIndex = tracks.findIndex((track) => track.id === normalizedId);
    const track: InternalTrack = {
      id: normalizedId,
      animation: assertAnimation(animation),
      at: assertNonNegativeNumber(options.at, 'options.at'),
      duration: assertNonNegativeNumber(options.duration, 'options.duration'),
      zone: 'before',
      progress: 0,
    };

    if (existingIndex >= 0) {
      tracks.splice(existingIndex, 1, track);
    } else {
      tracks.push(track);
    }

    syncTrack(track);
  }

  function addMarker(name: string, at: number): void {
    markers.push({ name: assertNonEmptyString(name, 'name'), at: assertNonNegativeNumber(at, 'at') });
    markers.sort((left, right) => left.at - right.at);
  }

  function play(startAt?: number): void {
    if (startAt !== undefined) {
      currentTimeMs = clamp(assertFiniteNumber(startAt, 'startAt'), 0, getDuration());
      syncAllTracks();
    } else if (done()) {
      currentTimeMs = 0;
      syncAllTracks();
    }

    isPlaying = true;
    lastTickTime = null;
  }

  function pause(): void {
    isPlaying = false;
    lastTickTime = null;
  }

  function resume(): void {
    if (!done()) {
      isPlaying = true;
      lastTickTime = null;
    }
  }

  function stop(): void {
    isPlaying = false;
    lastTickTime = null;
  }

  function reset(): void {
    currentTimeMs = 0;
    isPlaying = false;
    lastTickTime = null;
    syncAllTracks();
  }

  function tick(now?: number): void {
    if (!isPlaying) return;

    const time = resolveTimestamp(now, lastTickTime);
    if (lastTickTime === null) {
      lastTickTime = time;
      syncAllTracks();
      return;
    }

    currentTimeMs = clamp(currentTimeMs + Math.max(0, time - lastTickTime), 0, getDuration());
    lastTickTime = time;
    if (currentTimeMs >= getDuration()) {
      isPlaying = false;
    }
    syncAllTracks();
  }

  function seek(timeMs: number): void {
    currentTimeMs = clamp(assertFiniteNumber(timeMs, 'timeMs'), 0, getDuration());
    if (currentTimeMs >= getDuration()) {
      isPlaying = false;
    }
    lastTickTime = null;
    syncAllTracks();
  }

  function scrub(progress: number): void {
    seek(getDuration() * normalizeProgress(progress));
  }

  function currentTime(): number {
    return currentTimeMs;
  }

  function duration(): number {
    return getDuration();
  }

  function values(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const track of tracks) {
      result[track.id] = track.animation.value();
    }
    return result;
  }

  function value(id: string): unknown {
    return tracks.find((track) => track.id === id)?.animation.value();
  }

  function passedMarkers(): string[] {
    return markers.filter((marker) => marker.at <= currentTimeMs).map((marker) => marker.name);
  }

  function done(): boolean {
    return currentTimeMs >= getDuration();
  }

  function playing(): boolean {
    return isPlaying;
  }

  return {
    add,
    addMarker,
    play,
    pause,
    resume,
    stop,
    reset,
    tick,
    seek,
    scrub,
    currentTime,
    duration,
    values,
    value,
    passedMarkers,
    done,
    playing,
  };
}
