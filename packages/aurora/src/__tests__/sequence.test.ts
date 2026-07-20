import { describe, expect, it } from 'vitest';
import { delay, loop, parallel, sequence, stagger } from '../sequence.js';
import { tween } from '../tween.js';

function makeTween(from: number, to: number, duration: number) {
  return tween({ from, to, duration });
}

describe('sequence', () => {
  it('plays animations in order', () => {
    const a1 = makeTween(0, 10, 100);
    const a2 = makeTween(20, 30, 100);
    const s = sequence(a1, a2);

    const start = 1000;
    s.tick(start);

    // Halfway through first animation
    s.tick(start + 50);
    expect(s.value()).toBeCloseTo(5, 0);

    // Complete first animation
    s.tick(start + 100);
    // Should now be on second animation
    s.tick(start + 150);
    expect(s.value()).toBeCloseTo(25, 0);
  });

  it('done() is true when all animations are complete', () => {
    const a1 = makeTween(0, 10, 100);
    const a2 = makeTween(20, 30, 100);
    const s = sequence(a1, a2);

    const start = 1000;
    s.tick(start);
    s.tick(start + 100); // finish first
    s.tick(start + 200); // finish second
    s.tick(start + 300); // extra tick to ensure done
    expect(s.done()).toBe(true);
  });

  it('done() is false during animation', () => {
    const a1 = makeTween(0, 10, 100);
    const s = sequence(a1);

    s.tick(1000);
    s.tick(1050);
    expect(s.done()).toBe(false);
  });
});

describe('parallel', () => {
  it('plays all animations at once', () => {
    const a1 = makeTween(0, 10, 100);
    const a2 = makeTween(0, 20, 200);
    const p = parallel(a1, a2);

    const start = 1000;
    p.tick(start);
    p.tick(start + 100);

    // a1 should be done, a2 should be at 50%
    expect(a1.done()).toBe(true);
    expect(a2.done()).toBe(false);
  });

  it('done() when all sub-animations are done', () => {
    const a1 = makeTween(0, 10, 100);
    const a2 = makeTween(0, 20, 200);
    const p = parallel(a1, a2);

    const start = 1000;
    p.tick(start);
    p.tick(start + 100);
    expect(p.done()).toBe(false); // a2 still running

    p.tick(start + 200);
    expect(p.done()).toBe(true);
  });

  it('value() returns the last animation value', () => {
    const a1 = makeTween(0, 10, 100);
    const a2 = makeTween(0, 20, 100);
    const p = parallel(a1, a2);

    const start = 1000;
    p.tick(start);
    p.tick(start + 50);
    // value returns last animation's value
    expect(p.value()).toBeCloseTo(10, 0); // a2 at 50% = 10
  });
});

describe('stagger', () => {
  it('adds delay between starts', () => {
    const a1 = makeTween(0, 10, 100);
    const a2 = makeTween(0, 20, 100);
    const s = stagger([a1, a2], 50);

    const start = 1000;
    s.tick(start);

    // At t=50, a1 has been running for 50ms, a2 just started
    s.tick(start + 50);
    expect(a1.value()).toBeCloseTo(5, 0);
    // a2 just started or hasn't started yet (depending on timing)
  });

  it('done when all staggered animations complete', () => {
    const a1 = makeTween(0, 10, 100);
    const a2 = makeTween(0, 20, 100);
    const s = stagger([a1, a2], 50);

    const start = 1000;
    s.tick(start);
    // Tick frequently so each animation starts at correct stagger time
    s.tick(start + 50); // a2 starts here
    s.tick(start + 100);
    expect(s.done()).toBe(false); // a2 started at 50ms, needs until 150ms

    s.tick(start + 150);
    expect(s.done()).toBe(true);
  });
});

describe('loop', () => {
  it('replays animation', () => {
    const a = makeTween(0, 10, 100);
    const l = loop(a, 2);

    const start = 1000;
    l.tick(start);

    // Complete first iteration
    l.tick(start + 100);
    expect(l.done()).toBe(false); // should loop

    // Second iteration: needs its own ticks (no double-tick at boundary)
    l.tick(start + 200); // iter 2 starts, tween gets startTime
    l.tick(start + 300); // iter 2 completes (elapsed=100)
    expect(l.done()).toBe(true);
  });

  it('with count stops after N iterations', () => {
    const a = makeTween(0, 10, 100);
    const l = loop(a, 3);

    const start = 1000;
    l.tick(start);

    l.tick(start + 100); // end of iter 1
    expect(l.done()).toBe(false);

    // Iter 2: needs its own start tick + completion tick
    l.tick(start + 200); // iter 2 starts
    l.tick(start + 300); // end of iter 2
    expect(l.done()).toBe(false);

    // Iter 3: same pattern
    l.tick(start + 400); // iter 3 starts
    l.tick(start + 500); // end of iter 3
    expect(l.done()).toBe(true);
  });

  it('without count loops indefinitely', () => {
    const a = makeTween(0, 10, 100);
    const l = loop(a);

    const start = 1000;
    l.tick(start);

    // Run many iterations
    for (let i = 1; i <= 10; i++) {
      l.tick(start + i * 100);
      if (i < 10) {
        expect(l.done()).toBe(false);
      }
    }
    // Still not done after 10 iterations (infinite loop)
    expect(l.done()).toBe(false);
  });
});

describe('delay', () => {
  it('adds wait before animation starts', () => {
    const a = makeTween(0, 10, 100);
    const d = delay(a, 200);

    const start = 1000;
    d.tick(start);
    d.tick(start + 100); // still in delay
    expect(d.value()).toBe(0);
    expect(d.done()).toBe(false);
  });

  it('starts animation after delay period', () => {
    const a = makeTween(0, 10, 100);
    const d = delay(a, 200);

    const start = 1000;
    d.tick(start);
    d.tick(start + 200); // delay complete, animation starts
    d.tick(start + 300); // 100ms into animation = done
    expect(d.done()).toBe(true);
    expect(d.value()).toBe(10);
  });

  it('done() is false during delay', () => {
    const a = makeTween(0, 10, 100);
    const d = delay(a, 200);

    d.tick(1000);
    d.tick(1100);
    expect(d.done()).toBe(false);
  });
});

describe('composite reset', () => {
  it('reset on sequence resets all children', () => {
    const a1 = makeTween(0, 10, 100);
    const a2 = makeTween(20, 30, 100);
    const s = sequence(a1, a2);

    const start = 1000;
    s.tick(start);
    s.tick(start + 200); // complete both

    s.reset();
    expect(s.done()).toBe(false);
    expect(a1.value()).toBe(0);
    expect(a2.value()).toBe(20);
  });

  it('reset on parallel resets all children', () => {
    const a1 = makeTween(0, 10, 100);
    const a2 = makeTween(0, 20, 100);
    const p = parallel(a1, a2);

    p.tick(1000);
    p.tick(1100);

    p.reset();
    expect(p.done()).toBe(false);
    expect(a1.value()).toBe(0);
    expect(a2.value()).toBe(0);
  });

  it('reset on loop resets child and iteration count', () => {
    const a = makeTween(0, 10, 100);
    const l = loop(a, 2);

    l.tick(1000);
    l.tick(1200);

    l.reset();
    expect(l.done()).toBe(false);
    expect(a.value()).toBe(0);
  });
});

describe('loop(anim, 0) regression', () => {
  it('should be immediately done when maxIterations is 0', () => {
    const a = makeTween(0, 10, 100);
    const l = loop(a, 0);

    // With 0 iterations requested, done() should be true before any tick
    expect(l.done()).toBe(true);
  });

  it('should not tick the inner animation when maxIterations is 0', () => {
    const a = makeTween(0, 10, 100);
    let innerTickCount = 0;
    const origTick = a.tick;
    (a as any).tick = function (time?: number) {
      innerTickCount++;
      return origTick.call(this, time);
    };

    const l = loop(a, 0);
    l.tick(1000);
    l.tick(1100);

    // Inner animation should never be ticked
    expect(innerTickCount).toBe(0);
  });

  it('should return initial value when maxIterations is 0', () => {
    const a = makeTween(5, 10, 100);
    const l = loop(a, 0);

    l.tick(1000);
    // value should reflect the untouched inner animation's initial value
    expect(l.value()).toBe(5);
  });
});

describe('loop double-tick regression', () => {
  it('should not produce duplicate values at iteration boundaries', () => {
    const inner = makeTween(0, 10, 100);

    const l = loop(inner, 3);

    const start = 1000;
    l.tick(start); // initialize

    // Count how many times inner.tick is called per outer loop.tick call
    // At the iteration boundary, the bug causes inner.tick to be called twice
    // with the same timestamp
    let innerTickCallCount = 0;

    // Replace inner.tick with a spy
    const origInnerTick = inner.tick;
    (inner as any).tick = function (time?: number) {
      innerTickCallCount++;
      return origInnerTick.call(this, time);
    };

    // Tick to the end of the first iteration
    innerTickCallCount = 0;
    l.tick(start + 100);
    // At the boundary (done=true), the buggy code calls:
    //   1. animation.tick(time)    <- first tick
    //   2. animation.reset() + animation.start() + animation.tick(time) <- second tick
    // So innerTickCallCount should be 1 (not 2) for the boundary tick
    // The bug causes it to be 2
    expect(innerTickCallCount).toBe(1);
  });

  it('should not advance first frame of new iteration with stale timestamp', () => {
    // Create a tween that records all tick timestamps
    const tickTimestamps: number[] = [];
    const inner = makeTween(0, 10, 100);
    const origTick = inner.tick;
    (inner as any).tick = function (time?: number) {
      tickTimestamps.push(time ?? 0);
      return origTick.call(this, time);
    };

    const l = loop(inner, 2);
    const start = 1000;

    l.tick(start);
    // Complete first iteration
    l.tick(start + 100);

    // After the boundary, the next tick should be the first one of
    // the new iteration. With the bug, the new iteration already
    // received a tick at start+100 (the same timestamp as the completion).
    // Clear timestamps and do the next tick
    tickTimestamps.length = 0;
    l.tick(start + 116);

    // Should only see one tick call at start+116, not a stale one
    expect(tickTimestamps).toEqual([start + 116]);
  });
});
