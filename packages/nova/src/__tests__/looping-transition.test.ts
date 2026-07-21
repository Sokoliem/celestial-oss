import { describe, expect, it } from 'vitest';
import { createLoopingTransition } from '../looping-transition.js';

describe('createLoopingTransition', () => {
  it('returns oldContent before start()', () => {
    const tx = createLoopingTransition({ strategy: 'crossfade', duration: 10 });
    expect(tx.render('a', 'b', 0)).toBe('a');
    expect(tx.running).toBe(false);
  });

  it('pingpong mode: progress goes 0→1 in the first half, 1→0 in the second', () => {
    const tx = createLoopingTransition({ strategy: 'crossfade', duration: 20, mode: 'pingpong' });
    tx.start(0);
    expect(tx.progress(0)).toBe(0);
    expect(tx.progress(5)).toBeCloseTo(0.5, 1);
    expect(tx.progress(10)).toBeCloseTo(1, 1);
    expect(tx.progress(15)).toBeCloseTo(0.5, 1);
    expect(tx.progress(20)).toBeCloseTo(0, 1);
  });

  it('forward mode: progress goes 0→1 in each half, snap reset between', () => {
    const tx = createLoopingTransition({ strategy: 'crossfade', duration: 20, mode: 'forward' });
    tx.start(0);
    expect(tx.progress(0)).toBe(0);
    // forward halfDuration spans the full cycle
    expect(tx.progress(10)).toBeCloseTo(0.5, 1);
    expect(tx.progress(19)).toBeCloseTo(0.95, 1);
  });

  it('reverse mode: progress goes 1→0', () => {
    const tx = createLoopingTransition({ strategy: 'crossfade', duration: 20, mode: 'reverse' });
    tx.start(0);
    expect(tx.progress(0)).toBe(1);
    expect(tx.progress(10)).toBeCloseTo(0.5, 1);
  });

  it('loops indefinitely (progress wraps around)', () => {
    const tx = createLoopingTransition({ strategy: 'crossfade', duration: 20, mode: 'pingpong' });
    tx.start(0);
    const p1 = tx.progress(5);
    const p2 = tx.progress(25); // one full cycle later
    expect(p1).toBeCloseTo(p2, 1);
  });

  it('stop() freezes the loop; running flips to false', () => {
    const tx = createLoopingTransition({ strategy: 'crossfade', duration: 20 });
    tx.start(0);
    expect(tx.running).toBe(true);
    tx.stop();
    expect(tx.running).toBe(false);
  });

  it('stop() freezes the last rendered frame instead of resetting progress', () => {
    const tx = createLoopingTransition({ strategy: 'crossfade', duration: 20 });
    tx.start(0);
    const frame = tx.render('hello', 'world', 5);
    tx.stop();
    expect(tx.render('hello', 'world', 50)).toBe(frame);
    expect(tx.progress(50)).toBeCloseTo(0.5, 1);
  });

  it('stop(tick) freezes the frame at the supplied tick', () => {
    const tx = createLoopingTransition({ strategy: 'crossfade', duration: 20 });
    tx.start(0);
    tx.stop(5);
    expect(tx.progress(50)).toBeCloseTo(0.5, 1);
  });

  it('renders a non-trivial mid-cycle frame', () => {
    const tx = createLoopingTransition({ strategy: 'crossfade', duration: 20 });
    tx.start(0);
    const frame = tx.render('hello', 'world', 5);
    expect(frame).not.toBe('hello');
    expect(frame).not.toBe('world');
  });

  it('handles zero duration and rejects corrupt timing inputs', () => {
    const instant = createLoopingTransition({ duration: 0, mode: 'forward' });
    instant.start(0);
    expect(instant.progress(0)).toBe(1);
    expect(instant.render('old', 'new', 0)).toBe('new');

    expect(() => createLoopingTransition({ duration: Number.NaN })).toThrow(TypeError);
    expect(() => createLoopingTransition({ pauseTicks: -1 })).toThrow(RangeError);
    expect(() => instant.progress(Number.NaN)).toThrow(TypeError);
  });
});
