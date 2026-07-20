import { tween } from '@celestial/aurora';
import { describe, expect, it } from 'vitest';
import { compose, composeParallel, composeSequence, composeStagger } from '../compose.js';
import { styleEffect, transitionEffect, valueEffect } from '../effects.js';

/** Strip ANSI escape sequences for clean text comparison */
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('compose (alias for composeParallel)', () => {
  it('runs all effects simultaneously', () => {
    const v1 = valueEffect(tween({ from: 0, to: 100, duration: 10 }));
    const v2 = valueEffect(tween({ from: 0, to: 50, duration: 10 }));
    const composed = compose(v1, v2);

    composed.tick(0);
    composed.tick(5);

    // Both should have advanced
    expect(v1.value()).toBeCloseTo(50, 0);
    expect(v2.value()).toBeCloseTo(25, 0);
  });
});

describe('composeParallel', () => {
  it('both effects tick simultaneously', () => {
    const v1 = valueEffect(tween({ from: 0, to: 100, duration: 10 }));
    const v2 = valueEffect(tween({ from: 0, to: 200, duration: 20 }));
    const composed = composeParallel(v1, v2);

    composed.tick(0);
    composed.tick(10);

    expect(v1.done()).toBe(true);
    expect(v2.done()).toBe(false);
    expect(composed.done()).toBe(false);
  });

  it('done when BOTH effects are done', () => {
    const v1 = valueEffect(tween({ from: 0, to: 100, duration: 10 }));
    const v2 = valueEffect(tween({ from: 0, to: 200, duration: 20 }));
    const composed = composeParallel(v1, v2);

    composed.tick(0);
    composed.tick(20);

    expect(v1.done()).toBe(true);
    expect(v2.done()).toBe(true);
    expect(composed.done()).toBe(true);
  });

  it('value() returns first ValueEffect output', () => {
    const v1 = valueEffect(tween({ from: 0, to: 100, duration: 10 }));
    const t1 = transitionEffect('crossfade', { duration: 10 });
    const composed = composeParallel(v1, t1);

    composed.tick(0);
    composed.tick(5);

    expect(composed.value()).toBeCloseTo(50, 0);
  });

  it('applyTransition chains all TransitionEffects L->R', () => {
    const t1 = transitionEffect('crossfade', { duration: 10 });
    const t2 = transitionEffect('crossfade', { duration: 10 });
    const composed = composeParallel(t1, t2);

    composed.tick(0);
    composed.tick(10);

    const result = composed.applyTransition('old', 'new');
    // At progress 1, both transitions return new content
    expect(strip(result)).toContain('new');
  });

  it('applyStyle chains all StyleEffects L->R', () => {
    const s1 = styleEffect('shimmer', { speed: 1 });
    const s2 = styleEffect('colorCycle', { speed: 1 });
    const composed = composeParallel(s1, s2);

    composed.tick(0);
    composed.tick(3);

    const result = composed.applyStyle('Hello');
    // The result should be styled text
    expect(result).toContain('\x1b[');
    expect(strip(result)).toContain('Hello');
  });
});

describe('composeSequence', () => {
  it('e1 runs first, then e2', () => {
    const v1 = valueEffect(tween({ from: 0, to: 100, duration: 10 }));
    const v2 = valueEffect(tween({ from: 0, to: 200, duration: 10 }));
    const composed = composeSequence(v1, v2);

    composed.tick(0);
    composed.tick(5);

    // v1 should be active, v2 should not have started
    expect(v1.value()).toBeCloseTo(50, 0);
    expect(v2.value()).toBe(0); // Not started yet
    expect(composed.done()).toBe(false);
  });

  it('advances to e2 when e1 is done', () => {
    const v1 = valueEffect(tween({ from: 0, to: 100, duration: 10 }));
    const v2 = valueEffect(tween({ from: 0, to: 200, duration: 10 }));
    const composed = composeSequence(v1, v2);

    composed.tick(0);
    composed.tick(10); // v1 done
    composed.tick(15); // v2 at midpoint

    expect(v1.done()).toBe(true);
    expect(v2.done()).toBe(false);
    expect(composed.done()).toBe(false);
  });

  it('done when last effect finishes', () => {
    const v1 = valueEffect(tween({ from: 0, to: 100, duration: 10 }));
    const v2 = valueEffect(tween({ from: 0, to: 200, duration: 10 }));
    const composed = composeSequence(v1, v2);

    composed.tick(0);
    composed.tick(10); // v1 done
    composed.tick(20); // v2 should also be done

    expect(composed.done()).toBe(true);
  });

  it('value() returns current active effect value', () => {
    const v1 = valueEffect(tween({ from: 0, to: 100, duration: 10 }));
    const v2 = valueEffect(tween({ from: 0, to: 200, duration: 10 }));
    const composed = composeSequence(v1, v2);

    composed.tick(0);
    composed.tick(5);
    expect(composed.value()).toBeCloseTo(50, 0);

    composed.tick(10); // v1 done, v2 starts
    composed.tick(15);
    // v2 should be at ~100
    expect(composed.value()).toBeCloseTo(100, 0);
  });
});

describe('composeStagger', () => {
  it('each effect starts delayed from previous', () => {
    const v1 = valueEffect(tween({ from: 0, to: 100, duration: 10 }));
    const v2 = valueEffect(tween({ from: 0, to: 100, duration: 10 }));
    const v3 = valueEffect(tween({ from: 0, to: 100, duration: 10 }));
    const composed = composeStagger([v1, v2, v3], 5);

    composed.tick(0);
    composed.tick(3);

    // v1 started at 0, so at tick 3 it has progressed
    expect(v1.value()).toBeCloseTo(30, 0);
    // v2 starts at tick 5, so at tick 3 it hasn't started
    expect(v2.value()).toBe(0);
    // v3 starts at tick 10, so at tick 3 it hasn't started
    expect(v3.value()).toBe(0);
  });

  it('second effect starts after delay', () => {
    const v1 = valueEffect(tween({ from: 0, to: 100, duration: 10 }));
    const v2 = valueEffect(tween({ from: 0, to: 100, duration: 10 }));
    const composed = composeStagger([v1, v2], 5);

    composed.tick(0);
    composed.tick(7);

    // v1 started at 0, at tick 7 => 70% done
    expect(v1.value()).toBeCloseTo(70, 0);
    // v2 started at tick 5, at tick 7 => 2/10 = 20% done
    expect(v2.value()).toBeCloseTo(20, 0);
  });

  it('done when all staggered effects complete', () => {
    const v1 = valueEffect(tween({ from: 0, to: 100, duration: 10 }));
    const v2 = valueEffect(tween({ from: 0, to: 100, duration: 10 }));
    const composed = composeStagger([v1, v2], 5);

    composed.tick(0);
    composed.tick(15); // v1 done at 10, v2 done at 15

    expect(composed.done()).toBe(true);
  });
});

describe('mixed composition', () => {
  it('ValueEffect + TransitionEffect + StyleEffect work together', () => {
    const v = valueEffect(tween({ from: 0, to: 100, duration: 10 }));
    const t = transitionEffect('crossfade', { duration: 10 });
    const s = styleEffect('shimmer', { speed: 1 });
    const composed = composeParallel(v, t, s);

    composed.tick(0);
    composed.tick(5);

    // value() returns first ValueEffect's output
    expect(composed.value()).toBeCloseTo(50, 0);

    // applyTransition chains all TransitionEffects
    const transResult = composed.applyTransition('old', 'new');
    expect(typeof transResult).toBe('string');

    // applyStyle chains all StyleEffects
    const styleResult = composed.applyStyle('Hello');
    expect(typeof styleResult).toBe('string');
    expect(strip(styleResult)).toContain('Hello');
  });

  it('composed.reset() resets all effects', () => {
    const v = valueEffect(tween({ from: 0, to: 100, duration: 10 }));
    const t = transitionEffect('crossfade', { duration: 10 });
    const composed = composeParallel(v, t);

    composed.tick(0);
    composed.tick(10);
    expect(v.done()).toBe(true);
    expect(t.done()).toBe(true);

    composed.reset();
    expect(v.done()).toBe(false);
    expect(t.done()).toBe(false);
    expect(v.value()).toBe(0);
  });

  it('composed.done() is false until all effects complete', () => {
    const v = valueEffect(tween({ from: 0, to: 100, duration: 10 }));
    const s = styleEffect('shimmer', { speed: 1 });
    const composed = composeParallel(v, s);

    composed.tick(0);
    composed.tick(10);

    // v is done but style effects never complete
    expect(v.done()).toBe(true);
    expect(s.done()).toBe(false);
    expect(composed.done()).toBe(false);
  });
});

describe('empty compose', () => {
  it('returns identity behaviors', () => {
    const composed = compose();

    composed.tick(0);

    expect(composed.applyTransition('old', 'new')).toBe('new');
    expect(composed.applyStyle('input')).toBe('input');
    expect(composed.value()).toBe(0);
    expect(composed.done()).toBe(true);
  });
});
