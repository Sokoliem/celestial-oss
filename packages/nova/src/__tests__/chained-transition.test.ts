import { describe, expect, it } from 'vitest';
import { createChainedTransition } from '../chained-transition.js';

describe('createChainedTransition', () => {
  it('throws on empty stages array', () => {
    expect(() => createChainedTransition([])).toThrow(/stages.*not be empty/);
  });

  it('returns oldContent before start()', () => {
    const tx = createChainedTransition([{ strategy: 'crossfade', duration: 10 }]);
    expect(tx.render('a', 'b', 0)).toBe('a');
    expect(tx.activeStage(0)).toBe(-1);
  });

  it('runs through stages in order, advancing activeStage', () => {
    const tx = createChainedTransition([
      { strategy: 'wipe', duration: 6, options: { direction: 'right' } },
      { strategy: 'blur', duration: 4 },
      { strategy: 'crossfade', duration: 5 },
    ]);
    tx.start(0);
    expect(tx.activeStage(0)).toBe(0); // wipe
    expect(tx.activeStage(5)).toBe(0); // still wipe (ends at offset 6)
    expect(tx.activeStage(6)).toBe(1); // blur (offset 6..10)
    expect(tx.activeStage(10)).toBe(2); // crossfade (offset 10..15)
    expect(tx.activeStage(15)).toBe(3); // past end
  });

  it('done() returns true once total duration has elapsed', () => {
    const tx = createChainedTransition([
      { strategy: 'wipe', duration: 6 },
      { strategy: 'blur', duration: 4 },
    ]);
    tx.start(0);
    expect(tx.done(0)).toBe(false);
    expect(tx.done(5)).toBe(false);
    expect(tx.done(9)).toBe(false);
    expect(tx.done(10)).toBe(true);
    expect(tx.done(100)).toBe(true);
  });

  it('past total duration returns newContent', () => {
    const tx = createChainedTransition([{ strategy: 'crossfade', duration: 5 }]);
    tx.start(0);
    expect(tx.render('hello', 'world', 100)).toBe('world');
  });

  it('mid-stage rendering produces a non-trivial frame', () => {
    const tx = createChainedTransition([{ strategy: 'crossfade', duration: 10 }]);
    tx.start(0);
    const frame = tx.render('hello', 'world', 5);
    expect(frame).not.toBe('hello');
    expect(frame).not.toBe('world');
  });

  it('does not snap back to oldContent at a stage boundary', () => {
    const tx = createChainedTransition([
      { strategy: 'crossfade', duration: 10 },
      { strategy: 'blur', duration: 10 },
    ]);
    tx.start(0);
    expect(tx.activeStage(10)).toBe(1);
    expect(tx.render('hello', 'world', 10)).toBe('world');
  });

  it('forwards strategy options to each stage', () => {
    // dissolveSeed must reach the dissolve strategy via the dispatcher.
    const tx = createChainedTransition([{ strategy: 'dissolve', duration: 10, options: { dissolveSeed: 1 } }]);
    const txOther = createChainedTransition([{ strategy: 'dissolve', duration: 10, options: { dissolveSeed: 999 } }]);
    tx.start(0);
    txOther.start(0);
    const a = tx.render('hello', 'world', 5);
    const b = txOther.render('hello', 'world', 5);
    expect(a).not.toBe(b);
  });
});
