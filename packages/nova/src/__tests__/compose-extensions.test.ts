import { describe, expect, it, vi } from 'vitest';
import { composeConditional, composeNested, composeParallel, composeRandom, composeSequence } from '../compose.js';
import type { TransitionEffect } from '../effects.js';

function fakeTransitionEffect(name: string): TransitionEffect {
  let elapsed = 0;
  let startTime: number | null = null;
  return {
    kind: 'transition',
    tick(now: number): void {
      if (startTime === null) startTime = now;
      elapsed = now - startTime;
    },
    progress(): number {
      return Math.min(1, elapsed / 10);
    },
    done(): boolean {
      return elapsed >= 10;
    },
    reset(): void {
      elapsed = 0;
      startTime = null;
    },
    apply(_oldContent, newContent): string {
      return `[${name}:${elapsed}]${newContent}`;
    },
  };
}

describe('composeRandom', () => {
  it('is deterministic for the same seed', () => {
    const e1 = fakeTransitionEffect('a');
    const e2 = fakeTransitionEffect('b');
    const ra = composeRandom([e1, e2], 100, 7);

    const e3 = fakeTransitionEffect('a');
    const e4 = fakeTransitionEffect('b');
    const rb = composeRandom([e3, e4], 100, 7);

    ra.tick(0);
    rb.tick(0);
    ra.tick(50);
    rb.tick(50);
    expect(ra.applyTransition('o', 'n')).toBe(rb.applyTransition('o', 'n'));
  });

  it('different seeds yield different start delays', () => {
    // Capture the per-tick virtual elapsed time the wrapped effect sees.
    function recordingEffect() {
      const ticks: number[] = [];
      let elapsed = 0;
      let startTime: number | null = null;
      return {
        ticks,
        effect: {
          kind: 'transition' as const,
          tick(now: number): void {
            if (startTime === null) startTime = now;
            elapsed = now - startTime;
            ticks.push(elapsed);
          },
          progress: () => Math.min(1, elapsed / 1000),
          done: () => elapsed >= 1000,
          reset: () => {
            elapsed = 0;
            startTime = null;
            ticks.length = 0;
          },
          apply: (_o: string, n: string) => n,
        },
      };
    }

    const a = recordingEffect();
    const b = recordingEffect();
    const r1 = composeRandom([a.effect], 1000, 1);
    const r2 = composeRandom([b.effect], 1000, 999);
    // Drive far enough that both delays have certainly been crossed.
    r1.tick(0);
    r2.tick(0);
    r1.tick(2000);
    r2.tick(2000);
    // The recorded virtual-elapsed times differ because the start delays differ.
    expect(a.ticks).not.toEqual(b.ticks);
  });

  it('done when all sub-effects are done', () => {
    const e1 = fakeTransitionEffect('a');
    const e2 = fakeTransitionEffect('b');
    const r = composeRandom([e1, e2], 0, 1); // zero delay
    expect(r.done()).toBe(false);
    r.tick(0);
    r.tick(20);
    expect(r.done()).toBe(true);
  });
});

describe('composeConditional', () => {
  it('selects the then-branch when predicate is true', () => {
    const e1 = fakeTransitionEffect('THEN');
    const e2 = fakeTransitionEffect('ELSE');
    const cond = composeConditional((_now) => true, composeParallel(e1), composeParallel(e2));
    cond.tick(0);
    cond.tick(5);
    expect(cond.applyTransition('o', 'n')).toContain('THEN');
  });

  it('selects the else-branch when predicate is false', () => {
    const e1 = fakeTransitionEffect('THEN');
    const e2 = fakeTransitionEffect('ELSE');
    const cond = composeConditional((_now) => false, composeParallel(e1), composeParallel(e2));
    cond.tick(0);
    cond.tick(5);
    expect(cond.applyTransition('o', 'n')).toContain('ELSE');
  });

  it('resets the newly-active branch when predicate flips mid-flight', () => {
    const e1 = fakeTransitionEffect('THEN');
    const e2 = fakeTransitionEffect('ELSE');
    const e2Reset = vi.spyOn(e2, 'reset');
    let switched = false;
    const cond = composeConditional((_now) => switched, composeParallel(e1), composeParallel(e2));
    cond.tick(0); // predicate=false → else active
    switched = true;
    cond.tick(1); // predicate=true → then active, else NOT reset (we reset the new branch on switch — and the new is then)
    // Switch back to else now: else SHOULD reset.
    switched = false;
    cond.tick(2);
    expect(e2Reset).toHaveBeenCalled();
  });

  it('reset() resets both branches', () => {
    const e1 = fakeTransitionEffect('a');
    const e2 = fakeTransitionEffect('b');
    const e1Reset = vi.spyOn(e1, 'reset');
    const e2Reset = vi.spyOn(e2, 'reset');
    const cond = composeConditional(() => true, composeParallel(e1), composeParallel(e2));
    cond.tick(0);
    cond.reset();
    expect(e1Reset).toHaveBeenCalled();
    expect(e2Reset).toHaveBeenCalled();
  });
});

describe('composeNested', () => {
  it('wraps a ComposedAnimation as a TransitionEffect', () => {
    const e1 = fakeTransitionEffect('inner');
    const inner = composeSequence(e1);
    const wrapped = composeNested(inner);
    expect(wrapped.kind).toBe('transition');
    expect(typeof wrapped.tick).toBe('function');
    expect(typeof wrapped.apply).toBe('function');
  });

  it('forwards tick + apply to the inner animation', () => {
    const e1 = fakeTransitionEffect('inner');
    const wrapped = composeNested(composeParallel(e1));
    wrapped.tick(0);
    wrapped.tick(5);
    expect(wrapped.apply('o', 'n')).toContain('inner');
  });

  it('progress is binary: 1 when inner is done, 0 otherwise', () => {
    const e1 = fakeTransitionEffect('inner');
    const wrapped = composeNested(composeParallel(e1));
    expect(wrapped.progress()).toBe(0);
    wrapped.tick(0);
    wrapped.tick(20);
    expect(wrapped.progress()).toBe(1);
  });

  it('can be nested inside another compose call', () => {
    const inner1 = composeNested(composeParallel(fakeTransitionEffect('x')));
    const inner2 = composeNested(composeParallel(fakeTransitionEffect('y')));
    const outer = composeParallel(inner1, inner2);
    outer.tick(0);
    outer.tick(20);
    expect(outer.done()).toBe(true);
  });
});
