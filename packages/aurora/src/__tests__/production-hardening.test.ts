import { describe, expect, it } from 'vitest';
import {
  type Animation,
  animationDuration,
  createFrameBudget,
  decay,
  easing,
  interpolateWithType,
  keyframes,
  line,
  loop,
  parallel,
  registerInterpolator,
  sequence,
  spring,
  staggerGrid,
  transition,
  tween,
} from '../index.js';
import { createTimeline } from '../timeline.js';

function manualAnimation(): Animation<number> {
  let progress = 0;

  return {
    value: () => progress * 100,
    done: () => progress >= 1,
    reset: () => {
      progress = 0;
    },
    start: () => {},
    stop: () => {},
    tick: () => {},
    pause: () => {},
    resume: () => {},
    seek: (nextProgress) => {
      progress = nextProgress;
    },
    reverse: () => {},
    speed: () => {},
    progress: () => progress,
    direction: () => 1,
    playing: () => progress < 1,
  };
}

describe('production validation', () => {
  it('rejects invalid primitive animation configuration with typed errors', () => {
    expect(() => tween({ from: 0, to: 1, duration: 0 })).toThrow(RangeError);
    expect(() =>
      keyframes({
        keyframes: [{ offset: 1.1, value: 1 }],
        duration: 100,
      }),
    ).toThrow(RangeError);
    expect(() => decay(0, { velocity: 10, deceleration: 1 })).toThrow(RangeError);
    expect(() => spring(1, { stiffness: 100, damping: 10, mass: 0 })).toThrow(RangeError);
  });

  it('rejects invalid boundary helper inputs', () => {
    expect(() => easing.steps(0)).toThrow(RangeError);
    expect(() => createFrameBudget(0)).toThrow(RangeError);
    expect(() => interpolateWithType(0, 1, 0.5, 'missing')).toThrow(RangeError);
    expect(() => registerInterpolator('', () => 0)).toThrow(RangeError);
    expect(() => line({ x: 0, y: Number.NaN }, { x: 1, y: 1 }, { duration: 100 })).toThrow(TypeError);
    expect(() => transition(() => Number.POSITIVE_INFINITY, 100).value()).toThrow(TypeError);
    expect(() => staggerGrid(0, 1, { delay: 10 })).toThrow(RangeError);
  });

  it('rejects invalid clocks, easing output, and interpolated values', () => {
    const animation = tween({ from: 0, to: 1, duration: 100 });
    expect(() => animation.tick(Number.NaN)).toThrow(TypeError);

    const invalidEasing = tween({ from: 0, to: 1, duration: 100, easing: () => Number.NaN });
    expect(() => invalidEasing.tick(1000)).toThrow(TypeError);

    const invalidInterpolation = tween({ from: 0, to: 1, duration: 100, interpolate: () => Number.POSITIVE_INFINITY });
    expect(() => invalidInterpolation.tick(1000)).toThrow(TypeError);
  });

  it('ignores stale external clock frames instead of moving backward', () => {
    const animation = tween({ from: 0, to: 100, duration: 100 });
    animation.tick(1000);
    animation.tick(1050);
    expect(animation.value()).toBe(50);

    animation.tick(1025);
    expect(animation.value()).toBe(50);
    animation.tick(1075);
    expect(animation.value()).toBe(75);
  });

  it('rejects incompatible spring value shapes', () => {
    expect(() =>
      spring(
        { x: 1 },
        {
          stiffness: 100,
          damping: 10,
          from: { y: 0 } as unknown as { x: number },
        },
      ),
    ).toThrow(TypeError);
  });

  it('validates timeline identifiers and time values', () => {
    const timeline = createTimeline();
    const animation = tween({ from: 0, to: 1, duration: 100 });

    expect(() => timeline.add('', animation, { at: 0, duration: 100 })).toThrow(RangeError);
    expect(() => timeline.add('alpha', animation, { at: Number.NaN, duration: 100 })).toThrow(TypeError);
    expect(() => timeline.seek(Number.NaN)).toThrow(TypeError);
  });
});

describe('duration metadata', () => {
  it('reports primitive and composite durations', () => {
    const first = tween({ from: 0, to: 100, duration: 100, delay: 25 });
    const second = tween({ from: 0, to: 100, duration: 300 });

    expect(animationDuration(first)).toBe(125);
    expect(sequence(first, second).duration?.()).toBe(425);
    expect(parallel(first, second).duration?.()).toBe(300);
  });

  it('reports infinite duration for unbounded loops without breaking parent composites', () => {
    const forever = loop(tween({ from: 0, to: 1, duration: 100 }));
    const parent = sequence(forever, tween({ from: 1, to: 2, duration: 100 }));

    expect(animationDuration(forever)).toBe(Infinity);
    expect(parent.duration?.()).toBe(Infinity);
  });

  it('rejects corrupt duration metadata while preserving explicit unbounded durations', () => {
    const invalid = manualAnimation();
    invalid.duration = () => Number.NaN;
    expect(() => animationDuration(invalid)).toThrow(RangeError);

    invalid.duration = () => Number.NEGATIVE_INFINITY;
    expect(() => animationDuration(invalid)).toThrow(RangeError);
    invalid.duration = () => Number.POSITIVE_INFINITY;
    expect(animationDuration(invalid)).toBe(Number.POSITIVE_INFINITY);
  });

  it('uses known durations when seeking through a sequence', () => {
    const first = tween({ from: 0, to: 100, duration: 100 });
    const second = tween({ from: 0, to: 100, duration: 300 });
    const animation = sequence(first, second);

    animation.seek(0.5);

    expect(first.done()).toBe(true);
    expect(second.value()).toBeCloseTo(33.33, 1);
    expect(animation.value()).toBeCloseTo(33.33, 1);
  });

  it('uses known durations when seeking parallel animations', () => {
    const short = tween({ from: 0, to: 100, duration: 100 });
    const long = tween({ from: 0, to: 100, duration: 200 });
    const animation = parallel(short, long);

    animation.seek(0.5);

    expect(short.value()).toBe(100);
    expect(long.value()).toBe(50);
  });

  it('falls back to equal weighting for custom animations without duration metadata', () => {
    const first = manualAnimation();
    const second = manualAnimation();
    const animation = sequence(first, second);

    animation.seek(0.75);

    expect(first.progress()).toBe(1);
    expect(second.progress()).toBe(0.5);
    expect(animation.duration?.()).toBe(2);
  });
});

describe('explicit clocks', () => {
  it('resets playback speed before replaying an animation', () => {
    const animation = tween({ from: 0, to: 100, duration: 100 });

    animation.speed(2);
    animation.start();
    animation.tick(1000);
    animation.tick(1050);

    expect(animation.value()).toBe(50);
    expect(animation.done()).toBe(false);
  });

  it('does not count externally paused decay time as elapsed animation time', () => {
    const animation = decay(0, { velocity: 100, deceleration: 0.9, restDelta: 0.5 });

    animation.tick(1000);
    animation.tick(1016);
    const beforePause = animation.value();

    animation.pause();
    animation.resume();
    animation.tick(2016);

    expect(animation.value()).toBeCloseTo(beforePause, 5);

    animation.tick(2032);
    expect(animation.value()).toBeGreaterThan(beforePause);
  });
});
