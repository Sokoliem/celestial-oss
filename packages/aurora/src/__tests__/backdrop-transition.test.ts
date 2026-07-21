import { describe, expect, it } from 'vitest';
import {
  createBackdropTransition,
  DEFAULT_BACKDROP_BOOTSTRAP_MS,
  DEFAULT_BACKDROP_DURATION_MS,
  getBackdropOpacity,
  isBackdropSettled,
  setBackdropVisible,
  tickBackdropTransition,
} from '../backdrop-transition.js';

describe('createBackdropTransition (P0-12)', () => {
  it('starts hidden by default with opacity 0', () => {
    const state = createBackdropTransition();
    expect(getBackdropOpacity(state)).toBe(0);
    expect(isBackdropSettled(state)).toBe(true);
    expect(state.config.duration).toBe(DEFAULT_BACKDROP_DURATION_MS);
    expect(state.config.bootstrapMs).toBe(DEFAULT_BACKDROP_BOOTSTRAP_MS);
  });

  it('honors initiallyVisible', () => {
    const state = createBackdropTransition({ initiallyVisible: true });
    expect(getBackdropOpacity(state)).toBe(1);
    expect(isBackdropSettled(state)).toBe(true);
  });

  it('snaps to the target inside the bootstrap window', () => {
    let state = createBackdropTransition();
    // First tick advances ageMs but stays inside bootstrap (default 80ms).
    state = tickBackdropTransition(state, 10);
    state = setBackdropVisible(state, true);
    expect(getBackdropOpacity(state)).toBe(1);
    expect(isBackdropSettled(state)).toBe(true);
  });

  it('crossfades outside the bootstrap window', () => {
    let state = createBackdropTransition();
    // Push past bootstrap window first.
    state = tickBackdropTransition(state, DEFAULT_BACKDROP_BOOTSTRAP_MS + 1);
    state = setBackdropVisible(state, true);
    // Half the duration in => roughly half opacity (eased).
    state = tickBackdropTransition(state, DEFAULT_BACKDROP_DURATION_MS / 2);
    const opacity = getBackdropOpacity(state);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
    // Push to end.
    state = tickBackdropTransition(state, DEFAULT_BACKDROP_DURATION_MS);
    expect(getBackdropOpacity(state)).toBe(1);
    expect(isBackdropSettled(state)).toBe(true);
  });

  it('reduceMotion snaps every target change instantly', () => {
    let state = createBackdropTransition({ reduceMotion: true });
    state = tickBackdropTransition(state, DEFAULT_BACKDROP_BOOTSTRAP_MS + 100);
    state = setBackdropVisible(state, true);
    expect(getBackdropOpacity(state)).toBe(1);
    expect(isBackdropSettled(state)).toBe(true);
    state = setBackdropVisible(state, false);
    expect(getBackdropOpacity(state)).toBe(0);
    expect(isBackdropSettled(state)).toBe(true);
  });

  it('accepts a custom duration override (Q-T2 — themes pass corona.theme.motion.duration.backdrop)', () => {
    const state = createBackdropTransition({ duration: 160 });
    expect(state.config.duration).toBe(160);
  });

  it('exits crossfade back to 0 over the duration', () => {
    let state = createBackdropTransition({ initiallyVisible: true });
    state = tickBackdropTransition(state, DEFAULT_BACKDROP_BOOTSTRAP_MS + 1);
    state = setBackdropVisible(state, false);
    state = tickBackdropTransition(state, DEFAULT_BACKDROP_DURATION_MS);
    expect(getBackdropOpacity(state)).toBe(0);
  });

  it('rejects invalid duration, bootstrap, and tick values before corrupting state', () => {
    expect(() => createBackdropTransition({ duration: 0 })).toThrow(RangeError);
    expect(() => createBackdropTransition({ bootstrapMs: Number.NaN })).toThrow(TypeError);
    const state = createBackdropTransition();
    expect(() => tickBackdropTransition(state, -1)).toThrow(RangeError);
    expect(() => tickBackdropTransition(state, Number.NaN)).toThrow(TypeError);
  });
});
