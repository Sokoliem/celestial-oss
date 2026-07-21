import { tween } from '@celestial/aurora';
import { describe, expect, it } from 'vitest';
import { styleEffect, transitionEffect, valueEffect } from '../effects.js';

/** Strip ANSI escape sequences for clean text comparison */
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('valueEffect', () => {
  it('wraps an Aurora animation correctly', () => {
    const anim = tween({ from: 0, to: 100, duration: 10 });
    const effect = valueEffect(anim);
    expect(effect).toBeDefined();
    expect(typeof effect.tick).toBe('function');
    expect(typeof effect.value).toBe('function');
    expect(typeof effect.done).toBe('function');
    expect(typeof effect.reset).toBe('function');
  });

  it('has kind === "value"', () => {
    const anim = tween({ from: 0, to: 100, duration: 10 });
    const effect = valueEffect(anim);
    expect(effect.kind).toBe('value');
  });

  it('tick(now) advances the animation', () => {
    const anim = tween({ from: 0, to: 100, duration: 10 });
    const effect = valueEffect(anim);
    effect.tick(0);
    expect(effect.value()).toBe(0);
    effect.tick(5);
    expect(effect.value()).toBe(50);
  });

  it('value() returns current interpolated value', () => {
    const anim = tween({ from: 0, to: 100, duration: 10 });
    const effect = valueEffect(anim);
    effect.tick(0);
    effect.tick(10);
    expect(effect.value()).toBe(100);
  });

  it('done() returns false while animating, true when complete', () => {
    const anim = tween({ from: 0, to: 100, duration: 10 });
    const effect = valueEffect(anim);
    effect.tick(0);
    expect(effect.done()).toBe(false);
    effect.tick(5);
    expect(effect.done()).toBe(false);
    effect.tick(10);
    expect(effect.done()).toBe(true);
  });

  it('reset() resets to initial state', () => {
    const anim = tween({ from: 0, to: 100, duration: 10 });
    const effect = valueEffect(anim);
    effect.tick(0);
    effect.tick(10);
    expect(effect.done()).toBe(true);
    expect(effect.value()).toBe(100);

    effect.reset();
    expect(effect.done()).toBe(false);
    expect(effect.value()).toBe(0);
  });

  it('progress() reflects animation progress', () => {
    const anim = tween({ from: 0, to: 100, duration: 10 });
    const effect = valueEffect(anim, { from: 0, to: 100 });
    effect.tick(0);
    // Progress is based on value relative to range
    expect(effect.progress()).toBeCloseTo(0, 1);
    effect.tick(5);
    expect(effect.progress()).toBeCloseTo(0.5, 1);
    effect.tick(10);
    expect(effect.progress()).toBeCloseTo(1, 1);
  });
});

describe('transitionEffect', () => {
  it('creates a TransitionEffect with correct kind', () => {
    const effect = transitionEffect('slide', { duration: 10 });
    expect(effect.kind).toBe('transition');
  });

  it('tick() advances progress', () => {
    const effect = transitionEffect('crossfade', { duration: 10 });
    effect.tick(0);
    expect(effect.progress()).toBeCloseTo(0, 1);
    effect.tick(5);
    expect(effect.progress()).toBeCloseTo(0.5, 1);
  });

  it('apply(old, new) calls the strategy function with correct progress', () => {
    const effect = transitionEffect('crossfade', { duration: 10 });
    effect.tick(0);
    effect.tick(10);
    // At progress 1, apply should return new content
    const result = effect.apply('old text', 'new text');
    expect(strip(result)).toContain('new text');
  });

  it('apply() at progress 0 returns old content', () => {
    const effect = transitionEffect('crossfade', { duration: 10 });
    effect.tick(0);
    const result = effect.apply('old text', 'new text');
    expect(strip(result)).toContain('old text');
  });

  it('done() returns true after duration', () => {
    const effect = transitionEffect('slide', { duration: 10 });
    effect.tick(0);
    expect(effect.done()).toBe(false);
    effect.tick(10);
    expect(effect.done()).toBe(true);
  });

  it('supports slide direction option', () => {
    const effect = transitionEffect('slide', { duration: 10, direction: 'right' });
    effect.tick(0);
    effect.tick(5);
    // Should produce a valid intermediate frame
    const result = effect.apply('old', 'new');
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('supports wipe strategy', () => {
    const effect = transitionEffect('wipe', { duration: 10 });
    effect.tick(0);
    effect.tick(10);
    const result = effect.apply('old text', 'new text');
    expect(strip(result)).toContain('new text');
  });

  it('reset() resets the effect', () => {
    const effect = transitionEffect('crossfade', { duration: 10 });
    effect.tick(0);
    effect.tick(10);
    expect(effect.done()).toBe(true);

    effect.reset();
    expect(effect.done()).toBe(false);
    expect(effect.progress()).toBe(0);
  });
});

describe('styleEffect', () => {
  it('creates a StyleEffect with correct kind', () => {
    const effect = styleEffect('shimmer', { speed: 2 });
    expect(effect.kind).toBe('style');
  });

  it('tick() advances the effect tick counter', () => {
    const effect = styleEffect('shimmer', { speed: 1 });
    effect.tick(0);
    expect(effect.progress()).toBeCloseTo(0, 1);
    effect.tick(5);
    expect(effect.progress()).toBeGreaterThan(0);
  });

  it('apply(text) returns styled text for shimmer', () => {
    const effect = styleEffect('shimmer', { speed: 1 });
    effect.tick(0);
    effect.tick(3);
    const result = effect.apply('Hello World');
    // Should contain ANSI color codes from shimmer
    expect(result).toContain('\x1b[');
    expect(strip(result)).toContain('Hello World');
  });

  it('apply(text) returns styled text for colorCycle', () => {
    const effect = styleEffect('colorCycle', { speed: 1 });
    effect.tick(0);
    effect.tick(3);
    const result = effect.apply('Hello');
    expect(result).toContain('\x1b[');
    expect(strip(result)).toContain('Hello');
  });

  it('apply(text) returns styled text for breathe', () => {
    const effect = styleEffect('breathe', { speed: 1 });
    effect.tick(0);
    effect.tick(3);
    const result = effect.apply('Hello');
    expect(result).toContain('\x1b[');
    expect(strip(result)).toContain('Hello');
  });

  it('apply(text) returns styled text for glow', () => {
    const effect = styleEffect('glow', { intensity: 2 });
    effect.tick(0);
    effect.tick(3);
    const result = effect.apply('Hello');
    expect(result).toContain('\x1b[');
    expect(strip(result)).toContain('Hello');
  });

  it('reset() resets the tick counter', () => {
    const effect = styleEffect('shimmer', { speed: 1 });
    effect.tick(0);
    effect.tick(10);
    const progressBefore = effect.progress();
    expect(progressBefore).toBeGreaterThan(0);

    effect.reset();
    expect(effect.progress()).toBe(0);
  });

  it('style effects are never "done" — they run indefinitely', () => {
    const effect = styleEffect('shimmer', { speed: 1 });
    effect.tick(0);
    effect.tick(100);
    // Style effects are perpetual — they never complete
    expect(effect.done()).toBe(false);
  });

  it('validates style configuration and ignores stale clocks', () => {
    expect(() => styleEffect('shimmer', { speed: Number.NaN })).toThrow(TypeError);
    expect(() => styleEffect('glow', { intensity: -1 })).toThrow(RangeError);
    const effect = styleEffect('shimmer');
    effect.tick(10);
    effect.tick(20);
    effect.tick(15);
    expect(effect.progress()).toBe(10);
    expect(() => effect.tick(Number.NaN)).toThrow(TypeError);
  });
});
