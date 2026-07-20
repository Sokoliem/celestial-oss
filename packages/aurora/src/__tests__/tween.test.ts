import { afterEach, describe, expect, it, vi } from 'vitest';
import { tween } from '../tween.js';

describe('tween', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts at "from" value', () => {
    const t = tween({ from: 10, to: 20, duration: 1000 });
    expect(t.value()).toBe(10);
  });

  it('reaches "to" value when done', () => {
    const t = tween({ from: 0, to: 100, duration: 500 });
    const start = 1000;
    t.tick(start);
    t.tick(start + 500);
    expect(t.value()).toBe(100);
    expect(t.done()).toBe(true);
  });

  it('interpolates between from and to', () => {
    const t = tween({ from: 0, to: 100, duration: 1000 });
    const start = 1000;
    t.tick(start);
    t.tick(start + 500);
    expect(t.value()).toBeCloseTo(50, 0);
  });

  it('done() returns false before completion', () => {
    const t = tween({ from: 0, to: 100, duration: 1000 });
    t.tick(1000);
    t.tick(1500);
    expect(t.done()).toBe(false);
  });

  it('done() returns true after completion', () => {
    const t = tween({ from: 0, to: 100, duration: 1000 });
    t.tick(1000);
    t.tick(2000);
    expect(t.done()).toBe(true);
  });

  it('applies easing function', () => {
    const easeIn = (t: number) => t * t; // quadratic ease in
    const t = tween({ from: 0, to: 100, duration: 1000, easing: easeIn });
    const start = 1000;
    t.tick(start);
    t.tick(start + 500); // 50% through
    // easeIn(0.5) = 0.25, so value should be 25
    expect(t.value()).toBeCloseTo(25, 0);
  });

  it('waits during delay before starting', () => {
    const t = tween({ from: 0, to: 100, duration: 1000, delay: 500 });
    const start = 1000;
    t.tick(start);
    t.tick(start + 250); // still in delay
    expect(t.value()).toBe(0);
    expect(t.done()).toBe(false);
  });

  it('starts animating after delay completes', () => {
    const t = tween({ from: 0, to: 100, duration: 1000, delay: 500 });
    const start = 1000;
    t.tick(start);
    t.tick(start + 1000); // 500ms delay + 500ms animation = halfway
    expect(t.value()).toBeCloseTo(50, 0);
  });

  it('done after delay + duration', () => {
    const t = tween({ from: 0, to: 100, duration: 1000, delay: 500 });
    const start = 1000;
    t.tick(start);
    t.tick(start + 1500);
    expect(t.done()).toBe(true);
    expect(t.value()).toBe(100);
  });

  it('reset() restarts the animation', () => {
    const t = tween({ from: 0, to: 100, duration: 1000 });
    t.tick(1000);
    t.tick(2000); // done
    expect(t.done()).toBe(true);

    t.reset();
    expect(t.value()).toBe(0);
    expect(t.done()).toBe(false);

    // Can re-animate
    t.tick(3000);
    t.tick(3500);
    expect(t.value()).toBeCloseTo(50, 0);
  });

  it('stop() freezes at current value', () => {
    const t = tween({ from: 0, to: 100, duration: 1000 });
    t.tick(1000);
    t.tick(1500); // halfway
    const frozenValue = t.value();
    t.stop();

    t.tick(1750);
    t.tick(2000);
    expect(t.value()).toBe(frozenValue);
  });

  it('handles from > to (reverse animation)', () => {
    const t = tween({ from: 100, to: 0, duration: 1000 });
    const start = 1000;
    t.tick(start);
    t.tick(start + 500);
    expect(t.value()).toBeCloseTo(50, 0);
    t.tick(start + 1000);
    expect(t.value()).toBe(0);
  });

  it('uses a custom interpolate function when provided', () => {
    let calls = 0;
    const t = tween<number>({
      from: 0,
      to: 100,
      duration: 1000,
      interpolate: (from, to, progress) => {
        calls++;
        return from + (to - from) * progress + 10;
      },
    });

    t.tick(1000);
    t.tick(1500);

    expect(calls).toBeGreaterThan(0);
    expect(t.value()).toBeCloseTo(60, 0);
  });

  it('does not count paused time after resume', () => {
    const t = tween({ from: 0, to: 100, duration: 1000 });
    const nowSpy = vi.spyOn(Date, 'now');

    nowSpy.mockReturnValue(1000);
    t.tick();
    nowSpy.mockReturnValue(1400);
    t.tick();
    t.pause();
    nowSpy.mockReturnValue(1900);
    t.resume();

    nowSpy.mockReturnValue(2000);
    t.tick();

    expect(t.value()).toBeCloseTo(50, 0);
    expect(t.done()).toBe(false);
  });

  it('resumes correctly when driven by explicit tick timestamps', () => {
    const t = tween({ from: 0, to: 100, duration: 1000 });

    t.tick(1000);
    t.tick(1400);
    t.pause();
    t.resume();

    t.tick(2000);
    expect(t.value()).toBeCloseTo(40, 0);

    t.tick(2200);
    expect(t.value()).toBeCloseTo(60, 0);
    expect(t.done()).toBe(false);
  });

  it('reports progress from the animation tick clock', () => {
    const t = tween({ from: 0, to: 100, duration: 1000 });

    t.tick(1000);
    t.tick(1500);

    vi.spyOn(Date, 'now').mockReturnValue(10_000);

    expect(t.progress()).toBeCloseTo(0.5, 5);
  });

  it('preserves progress while paused', () => {
    const t = tween({ from: 0, to: 100, duration: 1000 });

    t.tick(1000);
    t.tick(1500);
    t.pause();

    vi.spyOn(Date, 'now').mockReturnValue(10_000);

    expect(t.progress()).toBeCloseTo(0.5, 5);
    expect(t.playing()).toBe(false);
    expect(t.done()).toBe(false);
  });

  it('preserves progress while stopped', () => {
    const t = tween({ from: 0, to: 100, duration: 1000 });

    t.tick(1000);
    t.tick(1500);
    t.stop();

    vi.spyOn(Date, 'now').mockReturnValue(10_000);

    expect(t.progress()).toBeCloseTo(0.5, 5);
    expect(t.playing()).toBe(false);
    expect(t.done()).toBe(false);
  });

  it('freezes paused progress across later control changes', () => {
    const t = tween({ from: 0, to: 100, duration: 1000 });

    t.tick(1000);
    t.tick(1500);
    t.pause();
    t.reverse();
    t.speed(2);

    expect(t.progress()).toBeCloseTo(0.5, 5);
    expect(t.playing()).toBe(false);
    expect(t.done()).toBe(false);
  });

  it('freezes stopped progress across later control changes', () => {
    const t = tween({ from: 0, to: 100, duration: 1000 });

    t.tick(1000);
    t.tick(1500);
    t.stop();
    t.reverse();
    t.speed(2);

    expect(t.progress()).toBeCloseTo(0.5, 5);
    expect(t.playing()).toBe(false);
    expect(t.done()).toBe(false);
  });

  it('does not jump progress when speed changes during active playback', () => {
    const t = tween({ from: 0, to: 100, duration: 1000 });

    t.tick(1000);
    t.tick(1500);

    t.speed(2);

    expect(t.progress()).toBeCloseTo(0.5, 5);
    expect(t.value()).toBeCloseTo(50, 5);

    t.tick(1750);
    expect(t.progress()).toBeCloseTo(1, 5);
    expect(t.value()).toBeCloseTo(100, 5);
  });

  it('does not jump progress when reversed during active playback', () => {
    const t = tween({ from: 0, to: 100, duration: 1000 });

    t.tick(1000);
    t.tick(1250);

    t.reverse();

    expect(t.progress()).toBeCloseTo(0.25, 5);
    expect(t.value()).toBeCloseTo(25, 5);

    t.tick(1375);
    expect(t.progress()).toBeCloseTo(0.125, 5);
    expect(t.value()).toBeCloseTo(12.5, 5);
  });

  it('reports progress after delay relative to animation time', () => {
    const t = tween({ from: 0, to: 100, duration: 1000, delay: 500 });

    t.tick(1000);
    t.tick(1250);
    expect(t.progress()).toBe(0);

    t.tick(1750);
    expect(t.progress()).toBeCloseTo(0.25, 5);
    expect(t.playing()).toBe(true);
    expect(t.done()).toBe(false);
  });

  it('fires onComplete only once after completion', () => {
    const onComplete = vi.fn();
    const t = tween({ from: 0, to: 100, duration: 1000, onComplete });

    t.tick(1000);
    t.tick(2000);
    t.tick(2500);
    t.tick(3000);

    expect(t.done()).toBe(true);
    expect(t.value()).toBe(100);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
